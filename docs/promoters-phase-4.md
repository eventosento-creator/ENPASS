# FASE 4 — RRPP, atribución y comisiones

## Alcance

FASE 4 agrega RRPP como dominio normalizado de la organización, links públicos por evento, atribución server-side, cálculo histórico de comisiones y un panel passwordless específico. No agrega mesas, POS, liquidaciones ni pagos automáticos al RRPP.

## Modelo

- `promoters`: identidad de la persona dentro de una `Organization`. No depende de `auth.users`.
- `event_promoters`: asociación reutilizable entre Promoter y Event, con estado y `public_slug` único por evento.
- `promoter_commission_rules`: regla general o excepción por `ticket_type_id`.
- `promoter_commissions`: snapshot auditable por `order_item_id`.
- `promoter_attribution_sessions` y `promoter_attributions`: last touch por evento.
- `promoter_link_visits`: visitas deduplicadas de forma simple.
- `promoter_access_tokens` y `promoter_sessions`: acceso passwordless separado de Supabase Auth.
- `orders.promoter_id` y `orders.event_promoter_id`: atribución final congelada.

Los Promoters pertenecen a la organización y pueden participar en varios eventos. La duplicación de un Event referencia los mismos Promoters y crea nuevas relaciones y reglas cuando se elige “Conservar RRPP”. Nunca copia visitas, Orders ni comisiones.

## Link y atribución

El link compartible es `/e/:eventSlug/:promoterSlug`. La ruta valida en servidor que Event, EventPromoter y Promoter estén activos, registra la visita, actualiza el touch y redirige a la página pública normal del evento. Un link inactivo o desconocido abre el evento sin crear una atribución nueva.

La cookie `nl_promoter_attribution` contiene solamente un token opaco aleatorio. Es `HttpOnly`, `SameSite=Lax`, segura en producción y tiene un máximo de siete días. Los hashes se guardan en PostgreSQL. La vigencia efectiva es `min(7 días, fin del evento)`; cuando el Event no tiene fin, se usa inicio + 1 día.

Regla V1: **last valid promoter touch por evento**. Un touch de Martina reemplaza a Lucas solo para ese mismo Event. La compra de otro Event no hereda esa atribución. Una visita directa no inventa un RRPP.

Al crear la Order, el servidor resuelve el hash de sesión y llama a `create_guest_checkout_attributed`. La Order recibe las dos referencias dentro del flujo server-side. El frontend no envía IDs ni montos de comisión. Desde ese momento la atribución queda congelada y futuros cambios de cookie no modifican la Order.

Las visitas se deduplican por sesión anónima, EventPromoter y ventana de 30 minutos. No se persiste la IP completa ni se intenta atribución cross-device.

## Motor de comisiones

Tipos iniciales:

- `fixed_per_ticket`: monto entero en centavos por cada entrada.
- `percentage`: basis points; 5% se almacena como `500`.

Una regla de TicketType activa reemplaza a la regla general. La base del porcentaje es `OrderItem.line_total_amount`, que representa únicamente el precio base de entradas. El `service_fee` no integra la comisión.

La división porcentual usa **round half up** y toda la aritmética monetaria permanece en integer minor units. Por cada `OrderItem` existe como máximo un `promoter_commissions` gracias a la restricción `unique(order_item_id)`.

Cuando la Order pasa a `paid`, el lifecycle ejecuta `calculate_promoter_commissions_for_order`. La fila conserva snapshots de:

- tipo y valor de regla;
- base y cantidad;
- monto calculado y moneda;
- Order, OrderItem, EventPromoter y Promoter.

Editar reglas no recalcula historia. Reprocesar un webhook o reconciliar una Order no duplica filas. Las vistas Producer y RRPP ejecutan una reconciliación acotada para recuperar una comisión faltante de una Order ya pagada sin volver a cobrar.

Un refund total de Order marca las comisiones confirmadas como `refunded` mediante trigger idempotente y las excluye de los totales. El refund parcial no se reparte todavía: el modelo financiero actual no identifica con precisión qué unidad de un OrderItem fue reembolsada.

Modelo financiero visible:

```text
Ticket base price + buyer service fee = buyer total
Promoter commission = obligación interna del Producer
```

La comisión no cambia el precio Buyer ni se descuenta automáticamente de `seller_net`.

## Acceso del RRPP

El Producer crea un invite de un uso y 24 horas. El token es opaco, se guarda hasheado y desaparece de la URL después del exchange en `/promoter/access`. La sesión resultante vive en `nl_promoter_session`, es `HttpOnly`, `SameSite=Strict`, revocable y vence a los 30 días.

El panel `/promoter` no reutiliza Supabase Producer Auth y no permite entrar a `/app`. Sus consultas son RPCs `security definer` exclusivas de `service_role` que primero validan el hash de sesión. No expone nombre, email, teléfono, DNI ni datos de pago de compradores.

El panel soporta varios eventos y muestra solamente:

- link para compartir;
- entradas y revenue base vendido;
- comisión confirmada;
- desglose por TicketType y últimas ventas anonimizadas.

## Seguridad y aislamiento

- RLS habilitado en todas las tablas nuevas.
- Producer autenticado solo tiene `select` sobre datos de organizaciones administradas; las mutaciones pasan por RPCs autorizadas.
- `anon` no tiene acceso directo a Promoters, reglas, visitas, atribuciones, tokens, sesiones ni comisiones.
- Los endpoints públicos usan proyecciones mínimas y nunca devuelven contacto del RRPP.
- Los tokens no aparecen en audit logs ni logs estructurados.
- Los RPC públicos sensibles se revocan y se conceden explícitamente a `authenticated` o `service_role`.
- Índices cubren slug por evento, métricas por EventPromoter, Orders atribuidas, comisiones por estado y expiración de sesiones.

Audit logs registran altas/cambios, relaciones, estado, reglas, atribución de Order, confirmación/refund e invitaciones enviadas. Los logs estructurados registran attribution created/skipped y commission calculated/confirmed/failed sin PII.

## Superficies de producto

- Producer Event Summary: ventas vía RRPP, ventas directas y entradas atribuidas.
- Producer RRPP list: ranking, revenue, comisión, visitas y conversión.
- Producer RRPP detail: perfil, slug, reglas general/específicas, link, invite y actividad anonimizada.
- Duplicar Event: fecha/nombre nuevos y opción de conservar RRPP.
- Buyer Event: misma landing; puede mostrar “Invitación de …” discretamente.
- Buyer Order en development: muestra la atribución solo dentro del detalle técnico.
- RRPP panel: experiencia mobile-first sin sidebar administrativo.

## Tests

Los unit tests cubren monto fijo, porcentaje, exclusión del fee, overrides, conversión a minor units y redondeo. pgTAP cubre direct/link/last touch/freeze/inactive/wrong Event, snapshots, refund, retry, sesiones, RLS, tenant isolation y duplicación con reglas.

## Límites explícitos

- Sin atribución cross-device ni multi-touch.
- Sin aliases para slugs anteriores; el link viejo deja de atribuir y abre el Event normal.
- Sin payouts, settlements, payroll, wallet ni “marcar pagado”.
- Sin distribución precisa de refund parcial.
- Sin antifraude automático o bloqueo de self-referral.
- Sin Mesas, POS, barras, inventory ni atribución de otros tipos de OrderItem.

El modelo mantiene `Promoter` y atribución a `Order` genéricos para extenderlos en una fase posterior, pero FASE 4 calcula comisión únicamente sobre Ticket OrderItems.
