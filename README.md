# Nightlife OS

Implementación local de FASE 0, FASE 1 y su capa de discovery pública (FASE 1.5): organizaciones, venues, eventos, preventas, catálogo público, checkout guest, órdenes pendientes y holds transaccionales.

## Requisitos

- Node.js 22 o superior
- npm
- Docker Desktop activo

## Arranque local

```bash
npm install
npx supabase start
npx supabase db reset --local
cp .env.example .env.local
```

Después de `supabase start`, copiar el valor `PUBLISHABLE_KEY` que imprime la CLI a `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` en `.env.local`. La URL ya coincide con el puerto local versionado (`http://127.0.0.1:56321`). No versionar `.env.local`.

Iniciar la aplicación:

```bash
npm run dev
```

Abrir <http://localhost:3000>.

Para detener la infraestructura local:

```bash
npx supabase stop
```

## Datos locales de demo

- Email: `owner@nightlife.local`
- Contraseña: `Nightlife123!`
- Organización: Club Demo
- Venue: Club Central
- Evento publicado: Noche 2000
- Eventos publicados de discovery: Club Session, Después de las 12, Sunset Club y Fecha Electrónica
- Evento borrador: Fecha en preparación

El correo local para magic links se inspecciona en <http://127.0.0.1:56324>.

## URLs útiles

- Aplicación: <http://localhost:3000>
- Catálogo público: <http://localhost:3000/eventos>
- Landing para productores: <http://localhost:3000/crear-evento>
- Producer: <http://localhost:3000/app>
- Evento público: <http://localhost:3000/e/noche-2000>
- Correo local: <http://127.0.0.1:56324>

## Superficies implementadas

- Home pública event-first con flyers reales locales, eventos destacados por fin de semana y CTA B2B.
- Catálogo `/eventos` con filtros compartibles por `city` y `when=all|today|tomorrow|weekend`; las fechas se evalúan en la zona horaria del venue.
- Cards cronológicas de eventos futuros publicados con fecha, venue, ciudad y precio público vigente desde.
- Landing breve `/crear-evento` y CTA adaptativo: registro si no hay sesión, onboarding si falta organización o creación directa si el producer ya pertenece a una.
- Dashboard Producer con próxima fecha protagonista, reservas activas, ocupación y cards visuales.
- Wizard de evento en tres pasos: fecha y flyer, entradas/preventas editables y resumen/publicación.
- Lugares con creación contextual y zona horaria dentro de configuración avanzada.
- Flyer con preview, reemplazo, fallback y upload real al bucket local `event-covers`.
- Página pública mobile-first, selector secuencial de preventas y CTA según selección.
- Checkout guest sin cuenta y DNI condicional por evento.
- Reserva pendiente con countdown basado en `expires_at` y estado vencido con retorno al evento.
- Metadata global y por evento, Open Graph con flyer y datos estructurados `Event` en las páginas públicas.

La expiración y la disponibilidad siguen resolviéndose en PostgreSQL; el countdown del navegador es solamente una representación visual.

Discovery consume `get_public_events_discovery()`, una proyección PostgreSQL con permisos explícitos para `anon`/`authenticated`. No expone órdenes, compradores, holds ni campos internos. Incluye únicamente eventos publicados futuros, ordenados por `starts_at`, y calcula el precio desde tipos marcados como públicos, activos, abiertos y con disponibilidad. Si una preventa se agota, la siguiente fase disponible pasa a ser el precio público. Los tipos internos tampoco pueden utilizarse en checkout guest.

## Verificación

```bash
npm run lint
npm run typecheck
npm test
npm run test:db
npm run build
```

`npm run test:db` verifica contra PostgreSQL real que un hold descuenta disponibilidad, que su expiración la libera, que la orden queda pendiente, que el fee se calcula en unidades mínimas, que no se puede sobre-vender un tipo de entrada y que discovery no publica borradores, cancelados o fechas pasadas. También comprueba orden cronológico, acceso anónimo seguro y el salto de precio al agotarse una fase.

## Límite de esta fase

El checkout termina en `Order pending + TicketHold active`. No hay pagos, Mercado Pago, webhooks, tickets emitidos, QR, scanner, RRPP, mesas, POS ni inventario. Esos módulos pertenecen a fases posteriores.

FASE 2 deberá conectar el CTA actual con Mercado Pago, persistir pagos/cuentas de cobro, procesar webhooks y emitir el ticket definitivo. Ninguna de esas acciones se simula en esta versión.

No existe configuración de deployment ni se creó infraestructura cloud. Esta iteración termina en el entorno reproducible de Supabase Local + Next.js local.
