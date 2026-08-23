# Nightlife OS

Aplicación local de gestión y venta de entradas. FASE 2B agrega emisión individual de Tickets, QR seguros, experiencia “Mis entradas” guest-first y entrega local por email sobre el dominio de pagos de FASE 2A.

No hay deployment ni conexión a infraestructura productiva.

## Requisitos

- Node.js 22 o superior
- npm
- Docker Desktop activo
- Para el flujo Mercado Pago: aplicación y usuarios de prueba de Mercado Pago
- Para OAuth, retornos y webhooks: un túnel HTTPS temporal (por ejemplo, `cloudflared`)

## Arranque local

```bash
npm install
npx supabase start
npx supabase db reset --local
cp .env.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Abrir <http://127.0.0.1:3000>. Supabase Local aplica todas las migrations y el seed con `db reset`.

Después de `supabase start`, copiar su `PUBLISHABLE_KEY` y `SERVICE_ROLE_KEY` exclusivamente locales a `.env.local`. La API local versionada usa `http://127.0.0.1:56321`. Generar la clave de cifrado local con:

```bash
openssl rand -base64 32
```

Copiar el resultado a `PAYMENT_CREDENTIALS_ENCRYPTION_KEY`. No versionar `.env.local` ni pegar secretos en documentación, logs o issues.

Generar otra clave independiente para `TICKET_TOKEN_ENCRYPTION_KEY`. Supabase Local expone SMTP/Mailpit en `127.0.0.1:56325` y su bandeja web en `http://127.0.0.1:56324`.

Para detener la infraestructura:

```bash
npx supabase stop
```

## Variables de entorno

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
NEXT_PUBLIC_SITE_URL
APP_URL
SUPABASE_SERVICE_ROLE_KEY
MERCADO_PAGO_CLIENT_ID
MERCADO_PAGO_CLIENT_SECRET
MERCADO_PAGO_REDIRECT_URI
MERCADO_PAGO_WEBHOOK_SECRET
MERCADO_PAGO_SANDBOX
PAYMENT_CREDENTIALS_ENCRYPTION_KEY
TICKET_TOKEN_ENCRYPTION_KEY
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_FROM
```

`.env.example` contiene solamente placeholders. `MERCADO_PAGO_SANDBOX` debe permanecer en `true`; el código rechaza credenciales y notificaciones `live_mode` en FASE 2A.

## Datos locales de demo

- Email: `owner@nightlife.local`
- Contraseña: `Nightlife123!`
- Organización: Club Demo
- Venue: Club Central
- Evento publicado: Noche 2000
- Evento borrador: Fecha en preparación
- Buyer fixture: `buyer@nightlife.local`
- Order local pagada: `2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b`

El correo local para magic links se inspecciona en <http://127.0.0.1:56324>.

## URLs

- Aplicación: <http://127.0.0.1:3000>
- Login Producer: <http://127.0.0.1:3000/login>
- Dashboard: <http://127.0.0.1:3000/app>
- Pagos Producer: <http://127.0.0.1:3000/app/settings>
- Catálogo: <http://127.0.0.1:3000/eventos>
- Evento: <http://127.0.0.1:3000/e/noche-2000>
- Mis entradas: <http://127.0.0.1:3000/mis-entradas>
- Order pagada demo: <http://127.0.0.1:3000/order/2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b>
- Mailpit: <http://127.0.0.1:56324>
- Retorno de pago: `/payment/return` (lo construye Mercado Pago)
- Webhook: `/api/webhooks/mercadopago`

## Configuración Mercado Pago de prueba

1. Crear una aplicación de prueba Checkout Pro/Marketplace en Mercado Pago Developers.
2. Habilitar OAuth con PKCE y crear usuarios de prueba de Argentina: Integrador, Vendedor y Comprador.
3. Iniciar la aplicación local y exponerla temporalmente por HTTPS. Ejemplo si `cloudflared` está instalado:

   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```

4. Usar la URL temporal que imprime el túnel:

   ```text
   APP_URL=https://URL-TEMPORAL
   NEXT_PUBLIC_SITE_URL=https://URL-TEMPORAL
   MERCADO_PAGO_REDIRECT_URI=https://URL-TEMPORAL/api/payments/mercadopago/callback
   ```

5. Registrar exactamente esa redirect URL y el webhook `payment` `https://URL-TEMPORAL/api/webhooks/mercadopago` en la aplicación de Mercado Pago.
6. Completar en `.env.local` Client ID, Client Secret y Webhook Secret de prueba; reiniciar `npm run dev`.
7. Para OAuth y pago, abrir la aplicación mediante la URL del túnel, iniciar sesión con el usuario demo y entrar a `/app/settings`. Esto mantiene la sesión y las cookies OAuth en el mismo host HTTPS.
8. Conectar el Vendedor de prueba. Luego abrir el evento en una ventana privada, completar el checkout guest y pagar con el Comprador y un método oficial de prueba.
9. Volver a la Order: la pantalla hace polling de nuestro estado, pero solamente el webhook firmado puede confirmar el pago.
10. Verificar Payment `approved`, Order `paid`, Hold `consumed` y la menor disponibilidad. Reenviar la misma notificación no debe cambiar otra vez el inventario.

Mercado Pago no acepta `localhost` para todas las URLs externas. El túnel se usa únicamente como transporte temporal hacia esta misma aplicación y base local; no es un deployment ni una dependencia del producto.

## Qué está implementado

- Productores autenticados con Supabase Auth; compradores guest sin cuenta.
- Organizations, venues, eventos, preventas secuenciales, publicación y discovery público.
- Checkout guest con validaciones server-side, Order pending y Hold transaccional de diez minutos.
- `PaymentProvider` desacoplado de UI y una implementación Mercado Pago Checkout Pro.
- OAuth Authorization Code con `state`, PKCE S256, `offline_access` y refresh token rotativo.
- Credenciales del vendedor cifradas con AES-256-GCM; nunca disponibles al comprador ni en logs.
- Order 1:N Payment attempts, montos enteros y currency explícita.
- `service_fee`, `platform_fee`, `processor_fee` y `seller_net` separados.
- Webhook firmado, consulta server-side del Payment y log idempotente `WebhookEvent`.
- RPC PostgreSQL atómica que bloquea Payment, Order, Event y TicketTypes antes de aprobar y consumir inventario.
- Aprobaciones tardías: recuperan el hold solo si todavía existe capacidad; si no, crean un caso auditable sin fingir la venta.
- Rechazos conservan el hold durante su tiempo restante y permiten un nuevo Payment sin perder el historial.
- Dashboard con ventas/entradas confirmadas y reservas pendientes reales.
- UI de pago responsive para pending, processing, approved, rejected, expired, refunded y excepciones.
- Un Ticket individual por cada unidad de OrderItem, con emisión transaccional e idempotente.
- QR `NLOS1` de 256 bits, SHA-256 para lookup y payload cifrado con AES-256-GCM.
- Pantalla celebratoria mobile-first, carrusel de múltiples Tickets y QR fullscreen.
- “Mis entradas” passwordless con magic link de un uso y sesión buyer revocable separada de Supabase Auth.
- `EmailProvider` desacoplado, implementación SMTP local, delivery log y reenvío producer.
- Refund total invalida Tickets; cancelación administrativa autorizada preparada.
- Producer ve ventas pagadas, cantidad/tipos emitidos y estado de entrega dentro del evento.

Las decisiones están en [docs/mercadopago-phase-2a.md](docs/mercadopago-phase-2a.md) y [docs/ticketing-phase-2b.md](docs/ticketing-phase-2b.md).

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npx supabase db lint --local
npm run build
```

Los tests unitarios cubren fees, estados, dinero, cifrado de credenciales y Ticket, formato/unicidad QR y política anti-enumeración. pgTAP cubre pagos/holds y además emisión exacta, retries, múltiples tipos, paid requirement, magic links, tenant isolation, cancelación y refund.

## Límite actual

El flujo local controlado termina en `Order paid + Tickets emitidos + email en Mailpit + QR visible`. No existe botón público para marcar una Order pagada.

No se implementan Scanner, Access Gates, Device Authorization, check-in atómico, ingresos en tiempo real, RRPP, POS, mesas, inventory general, Wallet/PDF ni producción. La validación end-to-end con Mercado Pago sandbox continúa pendiente por falta de credenciales/túnel; no se declara completa hasta ejecutar ese recorrido real.
