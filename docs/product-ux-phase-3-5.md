# FASE 3.5 — Arquitectura de información y pase de producto

## Alcance

Esta fase refina el producto existente sin modificar su arquitectura funcional. No agrega módulos de negocio, tablas, estados ni flujos de pago/acceso. Las rutas actuales siguen siendo la fuente de verdad y el comprador continúa siendo guest-first.

## Principios de interfaz

- **Comprador primero en superficies públicas.** Descubrir, entender, elegir y pagar deben ser las acciones más visibles. El acceso de productor permanece disponible, pero en segundo plano.
- **Una decisión principal por pantalla.** Las acciones secundarias se agrupan o pierden peso visual.
- **Información antes que contenedores.** Se usan separadores, ritmo y tipografía antes de sumar tarjetas anidadas.
- **Lime con intención.** El acento identifica acción primaria, disponibilidad y confirmación; no decora superficies completas.
- **Datos operativos reales.** Métricas, disponibilidad, ventas, puertas y dispositivos provienen de Supabase; no se agregan números simulados.
- **Mobile-first real.** Acciones críticas alcanzables con el pulgar, áreas táctiles de al menos 44 px y respeto por safe areas.

## Arquitectura de información

### Público y comprador

1. `/` — Descubrir: fechas destacadas y próximas.
2. `/eventos` — Explorar: filtrar por ciudad y momento.
3. `/e/:slug` — Decidir: contexto del evento, lugar, fecha, disponibilidad y selección.
4. `/e/:slug/checkout` — Completar datos y revisar el total completo antes de reservar.
5. `/order/:publicId` — Pagar o entender el estado de la compra y el hold.
6. `/mis-entradas` — Recuperar y presentar entradas sin crear una cuenta.

La navegación pública prioriza **Eventos** y **Mis entradas**. “Productores” agrupa el acceso y la creación de eventos como una vía secundaria.

### Productor

Navegación global deliberadamente corta:

- **Inicio** (`/app`): próxima fecha, señal operativa y métricas principales.
- **Eventos** (`/app/events`): listado y creación.
- **Configuración** (`/app/settings`): pagos y lugares.

No se crea una sección global de “Ventas” porque hoy las ventas pertenecen al contexto de cada evento. Tampoco se mantiene “Lugares” como navegación primaria: vive dentro de Configuración.

Dentro de un evento se presentan tres contextos reconocibles:

- **Resumen** (`/app/events/:id`): estado, disponibilidad, información y ventas.
- **Entradas** (ancla `#entradas` en el resumen): inventario y preventas.
- **Accesos** (`/app/events/:id/access`): puertas, dispositivos y actividad.

Esta navegación local evita inventar páginas vacías y deja preparado el lenguaje para separar vistas en una fase futura si el volumen lo exige.

### Scanner

`/scan` es una experiencia operativa independiente del dashboard:

1. Activación por PIN.
2. Cámara como superficie dominante.
3. Evento, puerta, permiso y conectividad siempre visibles.
4. Resultado válido/rechazado de lectura inmediata.
5. Herramientas de supervisor (código manual y excepción) solo cuando el permiso lo permite.

## Jerarquía por recorrido

### Comprador

Descubrir → abrir evento → elegir cantidades → ver subtotal, cargo y total → completar solo datos necesarios → reserva activa → pago/estado → entrada y QR.

### Productor

Iniciar sesión → ver próxima fecha → crear evento en tres pasos → revisar/publicar → monitorear ventas y disponibilidad → configurar accesos.

### Puerta

Ingresar PIN → confirmar contexto operativo → escanear → resolver resultado → continuar. Los estados sin red, sin permiso de cámara y sin autorización deben bloquear con una explicación accionable.

## Sistema visual

Los tokens se centralizan en `src/app/globals.css`:

- fondo, superficies base/elevadas y bordes;
- texto principal, secundario y tenue;
- acento, éxito, advertencia y peligro;
- radios, sombras y foco;
- espaciado de safe areas y feedback de interacción.

El sistema conserva la dirección oscura, premium y nightlife, con tipografía de sistema para no sumar descargas ni dependencias. La expresividad viene de escala, contraste, flyers y composición, no de efectos decorativos pesados.

## Decisiones explícitas de alcance

- No hay migraciones en FASE 3.5.
- No se modifica RLS, QR, holds, emisión, pagos ni reglas de acceso.
- El checkout incorpora una mejora funcional pequeña y necesaria: calcula en servidor la vista previa del cargo buyer-paid con la configuración real de la organización y la misma aritmética entera del dominio. La RPC transaccional sigue siendo la autoridad al crear la orden.
- La gestión de accesos resume ingresos y dispositivos por puerta usando datos existentes; no persiste métricas nuevas.
- No se agrega autenticación al comprador.
- No se agregan gráficos sin datos suficientes.
- No se agregan tabs que no conduzcan a contenido real.
- No se hace push ni deploy.

## Matriz de revisión

Se revisan las rutas críticas en 390, 430, 768, 1024 y 1440 px, con atención especial a:

- navegación sin overflow;
- orden natural del contenido;
- botones sticky y safe area;
- foco visible y labels;
- loading, empty, success, error, expired, offline y cámara denegada;
- consola del navegador sin errores en los recorridos principales.
