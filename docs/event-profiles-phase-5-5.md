# FASE 5.5 — Event Profiles + Capabilities

## Modelo

`Event` continúa siendo la entidad universal. `profile` describe el formato del evento y las seis columnas `*_enabled` describen las herramientas activas. No hay JSON libre, schemas paralelos ni arquitectura de plugins.

Perfiles estables:

- `nightlife` — Fiesta / Club
- `concert` — Recital
- `festival` — Festival
- `conference` — Congreso / Conferencia
- `sports` — Evento deportivo
- `expo` — Feria / Expo
- `private_event` — Evento privado
- `other` — Otro

Funciones tipadas: `tickets`, `promoters`, `tables`, `access`, `pos` e `inventory`. POS e Inventory existen únicamente como preparación de dominio y no tienen navegación ni UI en esta fase.

## Presets iniciales

| Perfil | Entradas | RRPP | Mesas | Accesos |
| --- | --- | --- | --- | --- |
| Fiesta / Club | sí | sí | sí | sí |
| Recital | sí | sí | no | sí |
| Festival | sí | no | no | sí |
| Congreso / Conferencia | sí | no | no | sí |
| Evento deportivo | sí | no | no | sí |
| Feria / Expo | sí | no | no | sí |
| Evento privado | sí | no | no | sí |
| Otro | sí, editable | no, editable | no, editable | sí, editable |

Los presets solo se aplican al crear. Cambiar el perfil luego modifica metadata y nunca reemplaza capacidades explícitas.

## Comportamiento

- El wizard empieza con “¿Qué estás organizando?” y aplica el preset en una sola selección.
- “Otro” permite elegir únicamente los cuatro módulos ya implementados.
- Event Settings permite cambiar tipo y funciones por separado.
- La navegación siempre muestra Resumen y filtra Entradas, RRPP, Mesas y Accesos.
- Una URL administrativa desactivada muestra un estado corto y enlaza a configuración.
- La página pública consulta una proyección que solo expone `tickets_enabled` y `tables_enabled`.
- Publicación valida inventario únicamente para las funciones activas. Un evento sin ventas puede publicarse si tickets y mesas están desactivados.
- Duplicación conserva perfil y funciones, y solo ofrece copiar configuraciones de módulos activos.
- Desactivar una función bloquea nuevas configuraciones/holds, pero conserva hijos, órdenes, ventas, comisiones, tickets y check-ins.
- El link de un RRPP desactivado sigue llevando al evento, pero no genera atribución nueva.

## Seguridad y compatibilidad

Las mutaciones pasan por `update_event_configuration`, verifican `can_manage_org` y generan auditoría por cambio de perfil o función. Los triggers transaccionales impiden nuevas operaciones en módulos desactivados. RLS existente mantiene el aislamiento por Organization.

El backfill asigna `nightlife` y las cuatro funciones actuales a todos los eventos previos. Por eso Noche 2000 y sus rutas continúan funcionando sin cambios de datos.

## Regla para módulos futuros

Los módulos nuevos no deben asumir un único tipo de evento salvo que sean inherentemente específicos. POS será un dominio genérico (`Product`, `SalesLocation`, `PosDevice`, `PosSession`); la UI podrá resolver etiquetas contextuales como Barra, Caja o Punto de venta mediante una utilidad futura equivalente a `getModuleLabel(profile, module)`.

## Límites

- Profile no es una categoría pública de discovery.
- No se implementan POS, Inventory, Accreditation, QR Orders ni seat maps.
- No se crean dependencias artificiales entre capacidades.
- El scanner, Orders, pagos, emisión y atribución histórica no cambian de arquitectura.
