# FASE 5 — Mesas, acceso grupal y beneficios

## Decisión de dominio

Una mesa no crea un checkout ni un sistema financiero paralelo. `OrderItem.item_type` discrimina de forma validada entre `ticket` y `table`: cada fila referencia exactamente un `TicketType` o un `EventTable`, nunca ambos. El mismo `Customer`, `Order`, `Payment`, atribución RRPP, comisión, emisor y scanner procesan los dos tipos.

PostgreSQL conserva constraints, claves foráneas y locks sobre el Event para que esa abstracción polimórfica no sea una relación débil.

## Sectores y mesas

- `TableZone` agrupa mesas con nombre libre como VIP, Terraza o Palco. No guarda coordenadas ni mapa.
- `EventTable` representa una mesa física vendible una vez por Event. Tiene nombre libre, capacidad, precio base en centavos, moneda, fee opcional, Gate opcional y estado operativo `active`.
- `available`, `held` y `sold` son estados derivados de `TableHold`; no se duplican en `EventTable`.
- Una mesa ocupada o vendida no puede deshabilitarse. Una mesa vendida no se elimina, preservando historial.
- La suma de `TicketType.quantity` y las capacidades de mesas activas no puede superar `Event.capacity` al crear, reactivar o publicar.

## Holds y concurrencia

El checkout crea `Order pending + TableHold active` por diez minutos. La transacción bloquea el Event, expira holds vencidos y valida a la vez:

- exclusividad de la mesa física;
- capacidad total del Event;
- estado publicado/activo;
- precio, currency y fee server-side.

Un índice único parcial permite como máximo un hold ocupante (`active`, `consumed` o `refund_review`) por mesa. El frontend solo presenta la cuenta regresiva; PostgreSQL decide la disponibilidad. Hay pgTAP y una prueba con dos RPC concurrentes que exige exactamente un ganador.

## Checkout, Payment y fee

El payload común usa `{ item_type, item_id, quantity }`. Las mesas siempre tienen `quantity = 1`; su capacidad representa personas, no unidades financieras. Tickets y mesas pueden coexistir en una Order.

El fee de mesa sigue esta precedencia:

1. override de `EventTable.service_fee_bps`;
2. `Organization.table_service_fee_bps`;
3. `Organization.service_fee_bps`.

`fee_payer` sigue soportando el dominio buyer/producer/mixed existente. En la configuración actual buyer-paid, el cargo se suma al total y se excluye de la base de comisión.

## Pago, credencial y beneficios

Cuando el mismo procesador server-side confirma una Order:

1. consume el `TableHold`;
2. deja la mesa derivada como sold;
3. emite exactamente una credencial grupal en `Ticket`;
4. define `max_entries = EventTable.capacity`;
5. emite un Entitlement de acceso y los beneficios configurados;
6. confirma la comisión RRPP.

El emisor es idempotente por `OrderItem + unit_index`. Access, beneficios y comisiones tienen constraints independientes para que veinte retries no dupliquen efectos.

El seed local usa payloads QR `dev:` verificables para que sus credenciales puedan recorrerse después de cada reset sin acoplarlas a una clave personal. Ese formato se acepta únicamente con `NODE_ENV=development`; staging y producción rechazan esos fixtures y usan siempre AES-256-GCM.

## Entitlements

`TableEntitlementTemplate` configura beneficios sin columnas específicas de negocio. V1 admite `product`, `drink` y `generic`; al pagar se materializan como `Entitlement` con `quantity`, `redeemed_quantity` y `status`.

El acceso se deriva de la capacidad y no se configura dos veces. FASE 5 no incluye canje. En FASE 6, `reference_id` podrá apuntar a un Product real y el POS administrará redenciones.

## Acceso grupal

V1 usa una credencial grupal, no ocho QR individuales. El scanner existente incrementa `used_entries` atómicamente, muestra `Ingreso N de M` y rechaza el siguiente scan con cupo completo. Si la mesa define `access_gate_id`, el mismo scanner aplica la Gate y sugiere la correcta.

La estrategia deja abierta una futura modalidad de credenciales individuales, pero FASE 5 implementa solo el flujo grupal completo.

## RRPP y comisiones

La atribución se congela en la misma Order. Las reglas ahora declaran `subject_type = ticket | table` y pueden ser generales o específicas por mesa.

- fija: monto por mesa;
- porcentaje: basis points sobre `OrderItem.line_total_amount` de la mesa;
- service fee excluido;
- snapshot histórico, idempotencia y refund iguales al ticketing.

Los paneles Producer y RRPP separan entradas y mesas, mientras facturación y comisión muestran el total real.

## Refund

- Refund total antes del Event y sin ingresos: hold `cancelled`, mesa disponible, credencial `refunded`, Entitlements `revoked` y comisión `refunded`.
- Refund después de al menos un ingreso o después del inicio: hold `refund_review`. La mesa sigue ocupada y nunca se revende automáticamente; requiere resolución operativa manual.

## Duplicación

“Conservar mesas” copia zones, mesas, precios, capacidades y templates. No copia Orders, holds, Customers, ventas, credenciales, Entitlements emitidos, uso de accesos ni Gates. Todas las mesas de la copia comienzan disponibles.

## Fuera de alcance

No hay plano visual, drag and drop, invitados, transferencias, QR individuales, canje de beneficios, Products, stock, barra ni POS. Esos límites corresponden a fases posteriores.
