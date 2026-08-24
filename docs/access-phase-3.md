# FASE 3 — Access, Scanner y check-in atómico

FASE 3 agrega control operativo de acceso sobre los Tickets emitidos en FASE 2B. No modifica el contrato QR existente (`NLOS1:<opaque>`), no emite Tickets nuevos y no agrega pagos.

## Alcance implementado

- `AccessGate` por Event, con nombre, descripción, estado y relación normalizada con los `TicketType` aceptados.
- autorización temporal de dispositivo con PIN criptográficamente aleatorio de seis dígitos, bcrypt en PostgreSQL, vencimiento de 30 minutos, un solo uso y límite de cinco intentos por ventana de 15 minutos.
- límites server-side por sesión: 60 lecturas cada diez segundos y 20 operaciones manuales por minuto.
- `ScannerSession` separada de Supabase Auth y de buyer sessions. El navegador conserva únicamente el token opaco en una cookie `HttpOnly`, `SameSite=Strict`, revocable y con vencimiento operativo del Event.
- `/scan` como interfaz independiente, mobile-first, con cámara trasera, lector QR `qr-scanner`, linterna cuando el dispositivo la soporta, vibración y sonido configurables, estado online/offline y overlays operativos.
- `/app/events/[eventId]/access` para puertas, reglas, autorizaciones, sesiones, revocación, métricas y últimos ingresos con polling cada cuatro segundos.
- búsqueda por código corto y excepciones solamente para sesiones `supervisor`; ambos caminos requieren confirmación y quedan auditados.
- manifest PWA mínimo con entrada `/scan`. No se implementó caché offline ni service worker.

## Modelo de seguridad

Las tablas `access_gates`, `access_gate_ticket_types`, `scanner_device_authorizations`, `scanner_sessions`, `scanner_activation_rate_limits` y `checkins` tienen RLS. Los productores autenticados solo leen datos de Organizations administrables. Los hashes de PIN y de sesión no tienen privilegio `SELECT` para `authenticated`.

Los endpoints del scanner usan el cliente server-only y RPC con privilegios mínimos. El frontend envía el payload QR al backend controlado; el backend lo convierte inmediatamente a SHA-256. El payload raw no se persiste ni se registra. La cámara y el video nunca salen del navegador.

El PIN se genera con `crypto.randomInt`, se compara mediante bcrypt dentro de PostgreSQL, deja de existir al activar el dispositivo y no vuelve a mostrarse. Los intentos fallidos se agrupan por un fingerprint SHA-256 de red/agente y se bloquean temporalmente.

Solamente Events `published` o `sold_out` permiten activar/usar scanners. `draft`, `cancelled` y `finished` rechazan la sesión. Las autorizaciones creadas desde el dashboard vencen en `ends_at + 4 horas`; si no existe `ends_at`, usan `starts_at + 16 horas`. Los tiempos operativos se guardan en UTC y la UI usa el timezone del Venue.

`audit_logs` conserva cambios de puertas, altas/revocaciones de dispositivos, activaciones y overrides. Cada lectura válida o rechazada vive en `checkins`, evitando duplicar el volumen operacional en el audit log general.

## Check-in atómico

`check_in_ticket(session_hash, qr_hash, idempotency_key)` ejecuta en una sola transacción:

1. recupera y bloquea `ScannerSession` y su autorización;
2. valida expiración, revocación, Event y puerta activa;
3. resuelve y bloquea el `Ticket` por `qr_token_hash`;
4. valida Organization/Event, status, ventana temporal, regla de puerta y `max_entries`;
5. incrementa `Ticket.used_entries` cuando corresponde;
6. crea el `Checkin` con resultado e idempotency key;
7. devuelve solamente datos operativos mínimos.

El orden de locks es estable: sesión → autorización → Ticket. Dos requests con idempotency keys distintas que llegan simultáneamente al mismo Ticket de un ingreso se serializan en el lock: uno devuelve `valid` y el otro `already_used`. El script `npm run test:concurrency` ejecuta esta condición con dos RPC realmente paralelos.

Resultados implementados: `valid`, `already_used`, `invalid`, `wrong_event`, `wrong_gate`, `too_early`, `too_late`, `cancelled`, `refunded`, `expired`, `device_not_authorized` y `rate_limited`.

Los Tickets con `max_entries > 1` aceptan exactamente esa cantidad de ingresos. Cada ingreso válido conserva su `entry_number`. Refund/cancel y check-in bloquean el mismo Ticket; la transición que obtenga primero el lock define el estado observado por la siguiente.

## Supervisor

Una autorización se crea como `scanner` o `supervisor`. Un scanner normal no puede consultar códigos cortos ni ejecutar overrides.

El supervisor puede:

- buscar exclusivamente un código corto exacto;
- confirmar un ingreso manual, que usa las mismas validaciones de status, tiempo, puerta y máximo;
- aprobar una excepción para `wrong_gate`, `too_early` o `too_late`.

No se permite override de Tickets cancelados, reembolsados, de otro evento, inválidos o sin ingresos disponibles. El Checkin de excepción guarda sesión, motivo, Checkin original y `override=true`; también genera `audit_logs`.

## Desarrollo local

Después de `npx supabase db reset --local`:

- Evento: Noche 2000.
- Puertas: Acceso principal y Acceso VIP.
- PIN scanner: `320000`.
- PIN supervisor: `320001`.
- Galería: <http://localhost:3000/dev/qr>.
- Scanner: <http://localhost:3000/scan>.
- Gestión: <http://localhost:3000/app/events/44444444-4444-4444-8444-444444444444/access>.

Los PIN se renuevan con cada reset y vencen en una hora en el seed para facilitar revisión. La creación real desde el dashboard usa 30 minutos. La galería y la entrada manual de payload de desarrollo responden `404`/no se renderizan en producción.

El seed incluye casos válidos, ya usado, refund, cancelado, VIP, demasiado temprano, demasiado tarde, multi-ingreso y otro Event. Los QR son credenciales deterministas exclusivamente locales.

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run test:concurrency
npx supabase db lint --local --schema public --level warning --fail-on warning
npm run build
```

pgTAP cubre RLS, tenant isolation, estados, reglas de puerta, ventanas, `max_entries`, revocación, PIN de un uso, rate limit, permisos y auditoría. Vitest cubre el contrato del payload y la presentación operativa. La concurrencia real se verifica en un proceso separado porque pgTAP corre cada archivo en una única conexión.

## Fuera de alcance / FASE 3.5+

- modo offline distribuido, sincronización o resolución de conflictos;
- WebSockets/Realtime (el MVP usa polling);
- credenciales nominadas de staff, RBAC ampliado o MFA operativo;
- hardware scanner dedicado, MDM y attestation de dispositivo;
- RRPP, POS, mesas, stock/inventory general y wallet/PDF;
- cambios en pagos, webhooks o emisión de Tickets.

La decisión futura sobre offline está documentada en [access-offline-future.md](access-offline-future.md).
