# ENPASS Gestión: de "módulo de clubes" a plataforma de gestión institucional

Estado: **propuesta para aprobación** (2026-11-04). No hay código ni migraciones asociadas. Auditoría hecha sobre el repo real, no sobre el prompt.

## 0. Qué es ENPASS (decisión estratégica)

- **ENPASS Eventos**: la ticketera actual. Se monetiza con cargo por entrada. No cambia.
- **ENPASS Gestión**: administración de instituciones con miembros y cuotas periódicas (clubes, academias de danza, institutos, etc.). Hoy existe como "módulo de clubes".
- Es **una sola plataforma**: la misma organización puede tener los dos paneles (ya existe el botón Eventos | Club). Una academia cobra mensualidades y vende entradas a su muestra con la misma cuenta.
- **Gestión Base**: sin abono, comisión sobre las cuotas cobradas por ENPASS (porcentaje **sin definir**). **Módulos** opcionales con cobro recurrente (catálogo tentativo en la sección 8).
- Primeros mercados: clubes y academias de danza. El resto de los rubros no se habilita comercialmente todavía.

## 1. Diagnóstico: qué existe realmente

| Capacidad | Estado | Dónde |
|---|---|---|
| Padrón de miembros (alta, edición, estado activo/suspendido/baja, número, DNI, búsqueda) | ✅ Hecho | `memberships`, `/app/socios` |
| Importación de padrón por CSV | ✅ Hecho | `members-csv.ts`, `members-import.tsx` |
| Categorías con cuota mensual | ✅ Hecho | `membership_categories` |
| Divisiones / disciplinas con cuota propia e inscripciones múltiples | ✅ Hecho | `divisions`, `membership_division_enrollments`, `division_dues` |
| Planes de cobro (familiar, becado, % o monto fijo) | ✅ Hecho | `membership_plans`, `apply_membership_plan` |
| Cuotas: generar por período, cuota suelta, vencimiento, estado pendiente/pagada | ✅ Hecho, pero **manual** | `generate_dues_for_period`; botón del administrador |
| Cuotas **automáticas** recurrentes cada mes | ❌ No existe | los cron actuales son solo `event-reminders` e `invoices` |
| Recargos por mora / descuento por pronto pago | ❌ No existe | solo hay descuentos por plan |
| Cobro online por Mercado Pago (cuenta del club, o cuenta de ENPASS con liquidación) | ✅ Hecho | `club_collection_mode`, `club_payouts`, `platform-collection.ts` |
| Cargo de servicio por institución y absorción de comisión de MP | ✅ Hecho | `club_dues_fee_bps`, `club_dues_mp_fee_bps` |
| Pagos manuales (efectivo / transferencia / otro) con fecha, importe y referencia | ✅ Hecho | `payment_method` en `membership_dues` y `division_dues` |
| Distinguir pago por ENPASS de pago manual | ✅ Parcial | el método lo distingue (`mercado_pago` vs resto); falta política comercial |
| Equipo con roles (administrador, tesorero, coordinador, solo lectura) | ✅ Hecho, verificado en base | `club_staff`, `club-roles.ts` |
| Panel de indicadores | 🟡 Parcial | existe `Reportes`; no verifiqué que cubra todos los indicadores del punto 5.5 |
| Configuración: nombre, logo, color, portada, datos de contacto | ✅ Hecho | `club_settings` |
| Solicitudes de ingreso con aprobación del club | ✅ Hecho | `club_membership_requests` |
| Portal del miembro (login propio, cuotas, pago, carnet con QR) | ✅ Hecho | `/mi-club/[slug]`, `/socios/cuota/...`, `member_credentials` |
| Puerta / control de acceso de club | ✅ Hecho | `club_door_*`, `/club-scan` |
| Página pública con aprobación de ENPASS | ✅ Hecho | `/clubes`, `/clubes/[slug]` |
| Administración de ENPASS (clubes, plata, productores) | ✅ Hecho | `/admin` |
| Eventos de la institución | ✅ Hecho | misma organización, botón Eventos \| Club |
| **Tipo de institución / rubro** | ❌ No existe | |
| **Nomenclatura configurable** (socio/alumno/estudiante) | ❌ No existe | "socio" está escrito a mano |
| **Módulos activables por institución** como sistema | ❌ No existe | hay interruptores sueltos (`club_settings.enabled`, taquilla, transferencias) |
| Página institucional en `enpass.com.ar/<slug>` | ❌ No existe | hoy es `/clubes/<slug>` |
| Aislamiento de datos entre instituciones | ✅ Hecho | RLS por `organization_id` en todas las tablas; tests pgTAP (`club_access_test`, `club_roles_test`, `club_function_grants_test`) |

**Hallazgo clave:** el modelo de datos ya es neutral (`memberships`, `membership_categories`, `divisions`, `membership_plans`). Lo que está atado al "club" es **el texto y las rutas**: 78 archivos y 248 líneas dicen "socio" y 136 archivos dicen "club". No hace falta rediseñar tablas.

## 2. Reutilización para academias de danza

| Concepto de academia | Ya lo cubre |
|---|---|
| Alumno | `memberships` (+ `customers`) |
| Disciplina / grupo (clásico, contemporáneo, urbano) | `divisions`, con cuota y cupo de inscriptos |
| Mensualidad base | `membership_categories` |
| Hermanos / descuentos / becas | `membership_plans` |
| Inscripción a una disciplina y cuota propia | `membership_division_enrollments` + `division_dues` |
| Muestra anual con entradas | Eventos (misma organización) |

Lo que falta para venderles: nomenclatura ("alumno", "disciplina", "mensualidad"), el selector de rubro en el alta, y **resolver quién paga cuando el alumno es menor** (hoy la persona es una sola, con su mail; ver decisiones pendientes).

## 3. Arquitectura propuesta

**Principio: no renombrar tablas, funciones ni permisos internos** (`club_settings`, `can_manage_club`, etc.). Renombrarlos es riesgo alto y no aporta nada al cliente. Se cambia lo que el usuario ve.

1. **Tipo de institución**: una columna `institution_type` (texto con lista cerrada) en `club_settings`, default `club`. Los clubes existentes quedan como `club` sin tocar nada.
2. **Diccionario de términos en código** (`src/modules/clubs/domain/institution-types.ts`): para cada tipo define cómo se llama el miembro (singular y plural), la categoría, la división, la cuota, y qué secciones se destacan. Un solo lugar; los 78 archivos pasan a leer de ahí. Nada de tablas por rubro.
3. **Onboarding**: "Armar mi club" pasa a "Administrar mi institución" con selector de rubro; el rubro decide el primer rótulo del formulario, igual que hoy (es guía, no restricción).
4. **Páginas institucionales**: ver sección 5.
5. **Módulos activables**: no construir el sistema ahora. Cuando haya el primer módulo pago, una tabla `organization_modules (organization_id, module_key, enabled, config)` con una función `has_module(org, key)`. Los interruptores sueltos actuales se migran a esa tabla en ese momento.

## 4. Gestión Base: qué incluye el producto inicial

Incluido en la base (sin abono): padrón, categorías, disciplinas/divisiones, planes de cobro, cuotas, cobro online, registro de pagos manuales, historial, equipo con roles, panel, configuración y página propia, portal del miembro con carnet, solicitudes de ingreso, importación CSV, eventos (con su comisión habitual).

Queda **fuera** de la base y es candidato a módulo: asistencia, horarios/cupos por clase, profesores y honorarios, reservas, comunicación avanzada (WhatsApp, campañas), facturación electrónica, finanzas avanzadas, formularios de inscripción personalizados. Los recordatorios transaccionales esenciales (mail de cuota nueva o por vencer) sí van en la base.

## 5. Páginas institucionales (`enpass.com.ar/<slug>`)

Estado actual: `/clubes/[slug]` (perfil público), `/mi-club/[slug]` (portal), `/socios/cuota/...` (pago). Slug único por organización (`organizations.slug`), cambiable por el club.

Riesgos de pasar a la raíz:
- **Choque con rutas existentes**: `admin`, `app`, `api`, `login`, `eventos`, `clubes`, `e`, `order`, `buyer`, `payment`, `promoter`, `socios`, `invite`, `mi-club`, `mis-entradas`, `ayuda`, `terminos`, `privacidad`, `reembolsos`, `arrepentimiento`, `crear-evento`, `ingresar`, `actualizar-clave`, `auth`, `dev`. Las rutas fijas ganan sobre la dinámica, pero un slug igual a una de ellas quedaría inalcanzable.
- **Hoy no hay lista de slugs reservados**: el slug solo valida el formato.
- Hay que **auditar los slugs ya creados** antes de nada.

Plan de migración sin romper nada:
1. Lista de slugs reservados, en código y como restricción en base. Consulta previa de slugs en producción para ver si alguno choca.
2. Agregar la ruta `/<slug>` **como alias**, sin sacar `/clubes/<slug>` ni `/mi-club/<slug>`.
3. Con todo estable, `/clubes/<slug>` y `/mi-club/<slug>` redirigen (permanente) a la nueva dirección. Los QR y mails ya enviados con los links viejos siguen funcionando.
4. Recién ahí se saca "Clubes" de la navegación pública.

**Cuidado**: mientras `/clubes` sea el listado que ENPASS aprueba, quitarlo de la navegación cambia lo decidido en (plan de onboarding público de clubes, 2026-10-01) (directorio con aprobación). Hay que confirmar si el directorio público se elimina o queda oculto.

## 6. Compatibilidad con clubes existentes

- Todo lo nuevo entra con default `club`: Club Obras y los demás no cambian de comportamiento ni de links.
- No se tocan tablas ni funciones de cobro. Los textos legales vigentes (`legales/clubes/`) hablan de "club" y "socios"; para academias hay que decidir si se adaptan o se duplican (ver pendientes).
- Cada fase se entrega con los tests de base y de dominio existentes en verde.

## 7. Roadmap

**Fase 0 — Decisiones (sin código).** Comisión de Gestión Base, política de pagos manuales, nombre del producto, menores de edad, qué pasa con el directorio `/clubes`.

**Fase 1 — Imprescindible para vender a academias.**
1. `institution_type` + diccionario de términos + onboarding con rubro.
2. Reemplazar los textos fijos de "socio" por los términos del rubro (pantallas del administrador, portal del miembro, mails, página pública).
3. Probar el flujo completo de una academia de ejemplo de punta a punta.

**Fase 2 — Completar la promesa de "cuotas" (recomendado antes de salir a vender).**
1. Generación automática mensual de cuotas (cron), con aviso al administrador. Hoy es un botón.
2. Recargo por mora y/o descuento por pronto pago, si se confirma que se necesita.
3. Mail de cuota nueva / por vencer.
4. Revisar el panel contra los indicadores de 5.5 y completar lo que falte.
5. Política y registro de pagos fuera de la plataforma.

**Fase 3 — Páginas institucionales.** Reservados, alias en la raíz, redirecciones, sacar "Clubes" de la navegación (según Fase 0).

**Fase 4 — Primer módulo y sistema de módulos.** Hipótesis del prompt: Actividades y horarios, luego Asistencia, Comunicación Pro, Profesores. Se decide con los primeros clientes. Se crea `organization_modules` junto con el primero.

**Fase 5+ — Ecosistema.** Inscripciones, Reservas, Control de accesos (reusando QR y scanner), Facturación (hay precedente: Factura C vía Afip SDK solo para el cargo de servicio), Finanzas Pro.

## 8. Catálogo tentativo de módulos (no aprobado para desarrollo)

Asistencia · Actividades y horarios · Profesores y personal · Reservas · Comunicación Pro · Facturación · Finanzas Pro · Inscripciones · Control de accesos · Eventos. Los precios y los esquemas de cobro **no están definidos**. Paquetes comerciales ("Academia Pro", "Club Pro") serán agrupaciones de estos mismos módulos, no desarrollos aparte.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Reemplazar textos en 78 archivos puede dejar palabras sueltas en pantallas o mails | Diccionario único + búsqueda de "socio" fija al terminar + revisión visual de cada pantalla |
| Slugs en la raíz chocan con rutas o con slugs ya creados | Reservados + auditoría previa + alias antes de redirigir |
| Links viejos en mails y QR enviados | Nunca eliminar rutas viejas; solo redirigir |
| Sacar el directorio `/clubes` afecta lo decidido sobre aprobación de ENPASS | Decidirlo en Fase 0 |
| Pagos fuera de la plataforma erosionan la comisión | Política comercial antes de abrir ventas |
| Cuotas automáticas generan cobros equivocados si hay un error | Empezar con generación automática + aviso previo al administrador; no cobrar solo |
| Textos legales de clubes aplicados a academias (menores, tutores) | Revisión legal antes de la primera academia |

## 10. Decisiones pendientes

1. Porcentaje de Gestión Base y quién absorbe la comisión de Mercado Pago (hoy: 5% con el club pagando MP, o 10% con ENPASS absorbiendo, según `legales/clubes/`).
2. Política para pagos manuales (efectivo / transferencia): ¿se permiten sin costo, con cargo fijo, con límite?
3. ~~Alumnos menores~~ **Decidido (2026-11-04):** el tutor es obligatorio para menores y es quien paga; **un solo tutor por alumno**. Ver sección 12.
4. ¿Recargo por mora y pronto pago entran en la base?
5. ~~Directorio público `/clubes`~~ **Decidido (2026-11-04):** las instituciones de Gestión NO se listan en la plataforma de ENPASS; cada una tiene su página propia con su estructura. El directorio se retira (aviso de ENPASS por mail y flujo de aprobación de listado quedan sin uso; migración de links según sección 5).
6. Nombre comercial del producto ("ENPASS Gestión") y cómo se llama el botón Eventos | Club.
7. Textos legales para academias: adaptar el paquete de clubes o hacer uno aparte.
8. Tope de miembros sin costo ("hasta 100 y después soporte"): sigue sin confirmarse.
9. Tipos de institución habilitados en la primera salida (propuesta: club, academia de danza y "otra").

## 11. Recomendación

El camino más corto y seguro es **no construir una plataforma nueva sino cambiar la capa de texto y configuración del módulo que ya funciona**:

1. Fase 0 (decisiones), en paralelo con
2. Fase 1 (rubro + términos): son pocas migraciones, aditivas, con default `club`.
3. Fase 2 (cuotas automáticas, mora, recordatorios): es lo que más separa un "padrón" de un sistema de cobranza que se pueda vender.
4. Recién entonces Fase 3 (links en la raíz): es la de mayor riesgo y la que menos incide en vender la primera academia.

Se sale a vender a academias después de las fases 1 y 2. Las páginas en la raíz y los módulos pagos pueden esperar a tener clientes reales.

## 12. Tutor (responsable de pago) — decidido 2026-11-04

Problema real hoy: el email es único por institución (`customers_org_email_unique`), el email es obligatorio, y mails/link de pago/portal son del alumno. Eso impide cargar hermanos con el mismo tutor y menores sin mail.

Decisiones:
- **Un solo tutor por alumno.** Es quien recibe mails, paga y entra al portal.
- El tutor es una persona (nombre, DNI, mail, teléfono) y puede tener varios alumnos; se reutiliza por mail o DNI.
- El alumno guarda fecha de nacimiento; si es menor, el tutor es obligatorio. Adultos: sin cambios (clubes existentes no notan nada).
- El alumno menor puede no tener mail propio.

Entrega en dos partes:
1. Tutor en base y alta, y que mails y cobro vayan al tutor.
2. Portal del tutor con todos sus alumnos y cuotas juntas (hoy el acceso es por alumno: `member_credentials` / `member_sessions` por `membership_id`).

### Diseño técnico del tutor (parte 1)

Descartado: poner al alumno menor como `customers` con el mail del tutor. Nueve funciones de la ticketera hacen `on conflict (organization_id, lower(email))`; tocar ese índice único arriesga las compras de entradas.

Elegido: **el tutor es el `customers` de la membresía** (es quien tiene mail y paga) y los datos del alumno viven en `memberships`:
- Columnas nuevas (nulas para adultos): `student_first_name`, `student_last_name`, `student_document`, `birth_date`.
- `memberships.customer_id` apunta al tutor. La restricción `unique (organization_id, customer_id)` pasa a un índice único parcial solo para membresías sin datos de alumno, así un tutor puede tener varios hijos.
- Mails de cuota, link de pago y pagador de Mercado Pago ya leen `customers` vía `membership.customer_id`: llegan al tutor sin cambios.
- A tocar: `create_membership` (y su acción/formulario), importación CSV, y todo lugar que muestre el nombre del miembro (listas, detalle, carnet, divisiones) para mostrar el alumno y no el tutor. Mails: saludo al tutor mencionando al alumno.
- Parte 2 (aparte): portal por tutor (`member_credentials`/`member_sessions` hoy por `membership_id`).

## 13. Material comercial

Propuesta en PDF para clubes, academias de baile, gimnasios y escuelas: `presentacion/propuesta-enpass-gestion.pdf` (10 láminas; generador `presentacion/_build/propuesta_gestion.py`). No fija porcentajes ni precios. Los módulos se muestran como "Próximamente": control de ingreso (QR y, a futuro, huella), caja, facturación, asistencia, actividades y horarios, profesores, comunicación y reservas. **Huella digital = dato biométrico sensible (Ley 25.326): requiere análisis legal y registro de la base antes de ofrecerlo.**
