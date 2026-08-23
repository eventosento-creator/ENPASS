# Mercado Pago — FASE 2A

Consulta de documentación: **2026-08-21**.

Esta fase integra pagos de prueba con Mercado Pago hasta `Payment approved + Order paid`. No emite tickets, QR ni correos de entrega.

## Decisión de checkout

Se selecciona **Checkout Pro mediante Preferences API**.

| Criterio | Checkout Pro | Checkout API / Bricks |
| --- | --- | --- |
| Experiencia | Redirección a un checkout responsive de Mercado Pago | Checkout integrado y personalizable |
| Mobile | Experiencia preconstruida y responsive | Responsive, con mayor control visual |
| Marketplace 1:1 | Soportado mediante OAuth y `marketplace_fee` | Soportado mediante OAuth y `application_fee` |
| Alcance PCI y seguridad | Menor: ENPASS no captura datos de tarjeta | Mayor superficie client-side y más estados a integrar |
| Complejidad FASE 2A | Menor | Mayor |
| Control visual | Menor | Mayor |

Checkout Pro conserva la capacidad Marketplace requerida y reduce el riesgo de una primera implementación financiera. La redirección es una concesión consciente. Si una fase futura exige un checkout completamente integrado, `PaymentProvider` permite sumar otra implementación sin acoplar Orders al SDK de Mercado Pago.

Fuentes oficiales:

- [Resumen de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/overview)
- [Checkout Bricks](https://www.mercadopago.com.ar/developers/es/docs/checkout-bricks/introduction)
- [Crear una preferencia](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/create-payment-preference)
- [Split de Pagos 1:1](https://www.mercadopago.com.ar/developers/es/docs/split-payments/split-1-1/integration-configuration/integrate-marketplace)

## Productos y endpoints utilizados

- OAuth Authorization Code con `state`, PKCE S256 y scope `offline_access`.
- Autorización: `https://auth.mercadopago.com/authorization`.
- Crear/renovar credenciales: `POST https://api.mercadopago.com/oauth/token`.
- Checkout Pro: `POST https://api.mercadopago.com/checkout/preferences`.
- Verificación server-side: `GET https://api.mercadopago.com/v1/payments/{id}`.
- Reembolso preparado en el provider: `POST https://api.mercadopago.com/v1/payments/{id}/refunds`.
- Webhooks de tipo `payment`, validados mediante `x-signature`, `x-request-id`, `data.id` y el secret de la aplicación.

El retorno del navegador (`success`, `failure`, `pending`) nunca confirma una compra. Solo vuelve a una página de estado interna. El webhook firmado provoca una consulta server-side a Mercado Pago y ese resultado se procesa de forma idempotente.

Fuentes oficiales:

- [OAuth y PKCE](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation)
- [Renovación de Access Token](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/renewal)
- [URLs de retorno](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/configure-back-urls)
- [Webhooks y firma](https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks)
- [Referencia de preferencias](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/preferences/create-preference/post)
- [Obtener un pago](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/get-payment/get)
- [Reembolsos](https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-api-payments/create-refund/post)

## Arquitectura

El dominio depende de la interfaz `PaymentProvider`, no de Mercado Pago. La implementación inicial es `MercadoPagoProvider` y resuelve:

- creación de checkout;
- consulta de un pago;
- reembolso server-side preparado para uso administrativo futuro;
- URL, intercambio y refresh de OAuth.

`OrderStatus` y `PaymentStatus` permanecen separados. Una Order puede tener varios intentos Payment; un rechazo no sobrescribe el historial.

## Marketplace y fees

Cada Organization conecta la cuenta del productor mediante OAuth. Las preferencias se crean con el Access Token de ese vendedor.

Cuando `platform_fee` sea mayor a cero se envía como `marketplace_fee`. Mercado Pago descuenta primero su comisión al vendedor y después la comisión del marketplace. Internamente se guardan por separado:

- `service_fee`: cargo configurado por ENPASS y mostrado al comprador en el modelo `buyer_paid`;
- `platform_fee`: comisión Marketplace enviada a Mercado Pago;
- `processor_fee`: comisión informada por Mercado Pago;
- `seller_net`: neto informado por Mercado Pago.

No se hardcodea un porcentaje. `platform_fee` se calcula sobre el subtotal a partir de la configuración en basis points de la Organization y se fotografía en cada Payment. El seed local configura explícitamente el caso demo; una Organization nueva conserva `0` hasta que la política comercial interna defina su comisión.

Limitación oficial: Split 1:1 está disponible para Checkout Pro y Checkout API; 1:N requiere cartera asesorada. Los reembolsos 1:1 dependen también de que el vendedor tenga saldo suficiente.

## Credenciales y seguridad

- Access Token y Refresh Token existen únicamente server-side.
- Se cifran con AES-256-GCM antes de persistirlos.
- La clave de cifrado vive exclusivamente en `PAYMENT_CREDENTIALS_ENCRYPTION_KEY`.
- Los tokens no se devuelven mediante RLS/RPC, no se loggean y no se envían al browser.
- OAuth usa cookies `HttpOnly`, `SameSite=Lax`, de vida corta para `state`, Organization y PKCE verifier.
- Se solicita `offline_access`; al refrescar se reemplazan tanto Access Token como Refresh Token.
- Webhooks sin firma válida se rechazan y su payload nunca se toma como fuente de verdad financiera.

## Idempotencia

- Cada Payment tiene `public_id` e `idempotency_key` únicos.
- Una preferencia pendiente reutilizable se devuelve en vez de crear un intento duplicado.
- La Preferences API vigente no documenta `X-Idempotency-Key`; se aplica idempotencia interna y `external_reference = Payment.public_id`.
- Refund sí usa el `X-Idempotency-Key` oficial.
- `provider_payment_id` es único y un WebhookEvent no puede procesarse dos veces.
- La transición crítica se ejecuta en una función PostgreSQL que bloquea Order, Payment, Event y TicketTypes en orden estable.

## Holds y aprobación tardía

Los holds duran diez minutos y los expirados se liberan server-side.

- `approved` dentro del hold: Payment pasa a `approved`, Order a `paid` y holds a `consumed` atómicamente.
- `rejected`: el intento queda rechazado y el hold permanece durante el tiempo restante para permitir reintento.
- vencimiento sin aprobación: Order y holds pasan a `expired`.
- aprobación después del vencimiento: se vuelve a validar inventario dentro de la transacción. Si todavía hay lugar, se recupera la reserva y se confirma la venta de forma auditable. Si ya no hay lugar, Payment pasa a `approved_inventory_conflict`, Order no se marca como pagada y queda una intervención/reembolso pendiente. Nunca se finge una venta.
- aprobación de un segundo Payment cuando la Order ya fue pagada: se registra como `approved_duplicate_charge` y requiere compensación.

Los holds `consumed` representan inventario vendido durante FASE 2A. Tanto disponibilidad por TicketType como capacidad del Event descuentan holds activos no vencidos y consumidos.

## Estados

Estados internos principales:

- Payment: `pending`, `processing`, `approved`, `rejected`, `cancelled`, `refunded`, `partially_refunded`, `charged_back`, y estados excepcionales auditables.
- Order: `pending`, `paid`, `expired`, `cancelled`, `refunded`.

El mapper central conserva además `provider_status` y `provider_status_detail` para diagnóstico.

## Pruebas locales

Mercado Pago no acepta `localhost` o `127.0.0.1` como `back_urls`; OAuth y webhooks también necesitan una URL HTTPS alcanzable. Para una prueba end-to-end se usa un túnel temporal hacia `127.0.0.1:3000` y se configura:

```text
APP_URL=https://URL-TEMPORAL
MERCADO_PAGO_REDIRECT_URI=https://URL-TEMPORAL/api/payments/mercadopago/callback
```

La URL no se hardcodea ni se convierte en dependencia del producto. El vendedor, comprador e integrador deben ser cuentas de prueba del mismo país. La compra se realiza solo con métodos y usuarios de prueba oficiales.

Flujo manual:

1. Crear la aplicación Checkout Pro/Marketplace en Mercado Pago Developers.
2. Habilitar PKCE, registrar redirect URL y Webhook `payment` con la URL temporal.
3. Crear cuentas de prueba Integrador, Vendedor y Comprador de Argentina.
4. Completar las variables locales sin versionarlas.
5. Iniciar Supabase Local, Next.js y el túnel.
6. Entrar a `/app/settings` y conectar el Vendedor de prueba.
7. Como comprador guest, crear Order + Hold y abrir Checkout Pro.
8. Pagar con el Comprador/método de prueba.
9. Verificar WebhookEvent procesado, Payment `approved`, Order `paid` y hold `consumed`.
10. Reenviar el mismo webhook y comprobar que el resultado no cambia.

Referencias de prueba:

- [Cuentas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-orders/resources/test-accounts)
- [Prueba de Checkout Pro](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integration-test)
- [Tarjetas de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-api-orders/integration-test/cards)

## Fuera de FASE 2A

No se implementan Ticket, QR, scanner, entrega por email, Mis entradas, buyer accounts ni invalidación de Ticket por refund. Eso pertenece a FASE 2B.
