# Ticket + QR + entrega — FASE 2B

Esta fase comienza exclusivamente desde una `Order` confirmada server-side en estado `paid`. No depende de Mercado Pago, del retorno del browser ni de parámetros de URL. Cualquier `PaymentProvider` futuro puede producir la misma transición de dominio.

## Lifecycle y modelo

Por cada unidad de `OrderItem.quantity` se emite un `Ticket` independiente. `OrderItem` conserva la línea comercial; `Ticket` es la credencial individual. La pareja `(order_item_id, unit_index)` es única y define la identidad idempotente de cada unidad.

Estados implementados:

- `valid`: QR visible y potencialmente utilizable.
- `cancelled`: cancelación administrativa; QR oculto.
- `refunded`: refund total de la Order; QR oculto.

`max_entries` y `used_entries` ya existen, pero FASE 2B no implementa `used`. En FASE 3 el uso se derivará de check-ins atómicos para soportar múltiples accesos sin convertir el estado del Ticket en un bloqueo prematuro.

## Emisión e idempotencia

`issueTicketsForPaidOrder(orderId)` prepara credenciales y llama a `issue_tickets_for_paid_order(orderId, credentials)`.

La función PostgreSQL:

1. bloquea la Order;
2. exige `status = paid`;
3. valida que exista una credencial por cada unidad comprada;
4. recorre los `OrderItem` en orden estable;
5. omite unidades ya emitidas;
6. inserta solamente las faltantes;
7. exige que el total final coincida con la compra;
8. registra `ticket.issued` sin secretos.

El lock de Order serializa reintentos concurrentes y el constraint único protege como segunda barrera. Un retry con credenciales nuevas sigue devolviendo exactamente la cantidad original.

La confirmación financiera termina antes de este proceso. Si una Order queda `paid` sin Tickets por una falla extraordinaria, el webhook reintenta y la página de Order ejecuta recuperación lazy. Nunca se vuelve a cobrar.

## QR

Formato versionado:

```text
NLOS1:<base64url de 32 bytes aleatorios>
```

El token tiene 256 bits de entropía y no contiene UUID, nombre, email, DNI, evento ni precio. Se generan dos representaciones persistidas:

- `qr_token_hash`: SHA-256 para validación futura.
- `qr_token_encrypted`: payload cifrado con AES-256-GCM, IV aleatorio y versión `v1`.

La clave vive únicamente en `TICKET_TOKEN_ENCRYPTION_KEY`. El servidor verifica el hash después de descifrar y genera SVG localmente con nivel de corrección M. No se almacenan imágenes ni se llama a servicios externos. El raw token no se serializa como texto ni se registra en logs. El código corto `NXXX-XX` es referencia humana, no un secreto.

## Acceso buyer guest-first

`/mis-entradas` no usa `auth.users`. El comprador ingresa su email y recibe siempre la misma respuesta pública, exista o no una compra.

Cuando hay Tickets:

1. se crea un token aleatorio de 256 bits con vida de 15 minutos;
2. la base guarda solo el hash y sus Customer autorizados;
3. el email contiene `/buyer/access?token=...`;
4. el endpoint intercambia el token una sola vez por una sesión buyer de 30 días;
5. el browser guarda una cookie `HttpOnly`, `SameSite=Lax`, `Secure` en producción;
6. la base guarda solo el hash de sesión y permite revocación/logout.

Una sesión puede mapear varios `Customer` con el mismo email en diferentes organizaciones, pero solo si esos Customers tenían Tickets pagados o reembolsados al crear el acceso. Esto permite recuperar también la constancia visible de un Ticket ya invalidado. Las tablas de tokens y sesiones tienen RLS sin políticas públicas ni grants para `anon`/`authenticated`; solo las RPC de `service_role` acceden a ellas.

La Order pública existente usa un `public_id` aleatorio de 128 bits como capacidad post-checkout. No existen URLs enumerables `/ticket/1`.

## Email y delivery

El dominio depende de `EmailProvider`. La implementación local `SmtpEmailProvider` usa SMTP de Supabase Local/Mailpit (`127.0.0.1:56325`); los mensajes se inspeccionan en `http://127.0.0.1:56324`.

`TicketDelivery` registra una entrega email por Order: hash del destino, estado, intentos, timestamps y error sanitizado. No guarda cuerpo ni email raw. Claim y finalización son RPC privilegiadas. Un envío exitoso no se repite automáticamente; un productor puede forzar “Reenviar”.

Si SMTP falla, el delivery queda `failed` y se audita, pero Payment, Order y Tickets no se revierten.

## Refund y cancelación

La transición completa `Order paid -> refunded` activa un trigger que marca todos sus Tickets `refunded` y crea auditoría por Ticket. Es idempotente.

Un `partially_refunded` permanece en Payment con `requires_action`; los Tickets no cambian automáticamente porque todavía no existe una asignación inequívoca de monto reembolsado a unidades concretas. El refund granular por Ticket queda explícitamente pendiente.

`cancel_ticket(ticketId)` es una RPC autenticada que vuelve `cancelled` un Ticket válido solo si el usuario puede administrar su Organization. No existe todavía una pantalla masiva de cancelaciones.

## RLS y fuentes de métricas

- El público no puede seleccionar Tickets ni deliveries.
- Producer accede solo a filas de su Organization.
- Las columnas cifradas/hash no están concedidas al rol producer.
- Buyer accede mediante endpoints server-side y sesión buyer, nunca mediante una policy improvisada.

“Entradas confirmadas” cuenta Tickets emitidos cuya Order continúa `paid`. `TicketType.quantity` sigue siendo inventario, `OrderItem.quantity` cantidad comprada y `Ticket` credencial emitida.

## Fixture local

El seed contiene una Order controlada `paid` para Noche 2000, con `Preventa 2 × 2` y `General × 1`. No contiene Tickets precalculados porque el ciphertext depende de la clave local. Al abrir:

```text
http://127.0.0.1:3000/order/2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b
```

la recuperación lazy emite tres Tickets y envía un acceso a `buyer@nightlife.local` en Mailpit. No existe botón público “Simular pago”.

## Límites

No se implementan Scanner, cámara, AccessGate, dispositivos, check-in atómico, RRPP, POS, mesas, stock general, transferencias, resale, Wallet, PDF ni cuentas buyer con contraseña.

FASE 2B está validada desde una Order local controlada en `paid`. La compra completa Mercado Pago sandbox → webhook → Order paid → Ticket todavía no debe declararse end-to-end hasta disponer de credenciales y túnel HTTPS para ejecutar la validación pendiente de FASE 2A.
