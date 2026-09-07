# FASE 6 — Productos, POS y cajas

FASE 6 agrega venta presencial real sobre el dominio financiero existente. Una venta de barra crea una `Order` pagada con `channel = pos`, uno o más `OrderItem` de tipo `product` y un `Payment` aprobado. No existe una segunda contabilidad paralela.

## Modelo

- `ProductCategory` y `Product` pertenecen a la Organization y forman un catálogo reutilizable.
- `EventProduct` habilita un Product en un Event y fija el precio autoritativo en unidades mínimas.
- `SalesLocation` representa una barra o punto de venta; `SalesLocationProduct` limita su oferta.
- `PosDeviceAuthorization` contiene un PIN bcrypt temporal de seis dígitos, de un uso.
- `PosDeviceSession` es la autorización técnica del navegador y se conserva únicamente mediante una cookie opaca HttpOnly.
- `PosSession` representa apertura y cierre de caja. Solo puede existir una abierta por dispositivo.
- `PosCashMovement` es el libro inmutable de efectivo: apertura en `PosSession`, ventas, ingresos, egresos y futuros reintegros.

Todas las tablas operativas incluyen `organization_id` y relaciones compuestas para impedir cruces de tenant. Productores operan configuración bajo RLS; el flujo `/pos` usa funciones `security definer` de alcance reducido desde rutas server-side.

## Flujo local

1. En `/app/products`, crear categorías y productos reutilizables.
2. En `/app/events/:eventId/pos`, agregar productos al evento, fijar precios y configurar puntos de venta.
3. Generar un dispositivo. El PIN se muestra una sola vez y vence en 30 minutos.
4. Abrir `/pos`, ingresar el PIN y abrir la caja con efectivo inicial.
5. Armar el carrito. El cliente nunca envía precios: PostgreSQL los resuelve nuevamente al confirmar.
6. Elegir efectivo, tarjeta, Mercado Pago o transferencia. En esta fase, los últimos tres se registran como confirmación manual externa; no hay integración Point.
7. En efectivo, la UI calcula recibido y vuelto. La transacción crea Order, items, Payment y movimiento de caja juntos.
8. Registrar ingresos/egresos extraordinarios y cerrar informando el efectivo contado. Se persisten esperado, contado y diferencia.

Tras un `db reset`, el dispositivo demo de **Barra principal** usa el PIN local `481920`. Es de un uso; resetear la base para restaurarlo.

## Seguridad e idempotencia

- El PIN nunca se persiste en claro; una activación exitosa elimina su hash.
- Los intentos fallidos se limitan por huella de red/agente.
- La sesión de dispositivo es independiente de Supabase Auth y de la sesión de caja.
- La cookie es HttpOnly, SameSite strict y Secure en producción.
- Cada venta recibe un UUID idempotente único dentro de su caja. Un advisory lock y un índice único hacen que reintentos concurrentes devuelvan la misma Order.
- No se confía en precio, nombre, moneda, evento, organización ni punto de venta enviados por el navegador.
- Una caja cerrada no acepta más ventas ni movimientos.

## Incluido y diferido

Incluido: catálogo, precios por Event, barras, activación de dispositivo, POS responsive, cuatro medios de pago registrados, caja, arqueo, métricas por evento/barra/producto, auditoría, duplicación opcional de configuración, seed y pruebas.

Diferido: stock e inventario, comandas/cocina, descuentos, reintegros parciales, Mercado Pago Point, lectores externos, turnos de empleados, permisos operativos finos, impresión fiscal, modo offline y sincronización distribuida.
