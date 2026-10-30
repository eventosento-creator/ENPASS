# Ruta de trabajo: ENPASS para boliches

Punto de partida: un boliche de Mendoza (Godoy Cruz) con unas 1.500 personas por fin de semana, hoy en Tikeo (15%). Vende entradas con hora límite de ingreso ("Stop 1 am", "Stop 2:30 am"), entradas gratis con cupo, preventas, tickets VIP y combos ("Combo botella + 4 ingresos"). Cobra por transferencia con comprobante.

Tamaños: **S** = chico (horas), **M** = mediano (uno o dos días), **L** = grande (varios días).

---

## Fase 0 · Base del negocio (sin código, la hacés vos)
Sin esto no conviene salir en vivo.

| # | Qué | Quién | Por qué |
|---|---|---|---|
| 0.1 | Pasar Vercel y Supabase a plan Pro (≈ USD 45/mes) | Vos | Hobby no permite uso comercial; Supabase gratis se pausa y tiene poca capacidad |
| 0.2 | Reunión con el boliche con la lista de preguntas | Vos | Define el alcance real de las fases 2 a 5 |
| 0.3 | Definir el cargo para boliches (hoy estándar 12%, piso 10%, Tikeo 15%) y quién lo paga | Vos | No se hardcodea nada; se carga por organización |
| 0.4 | Definir precios de módulos (canje, barra, stock, Venue) | Vos | Ver tabla de módulos abajo |
| 0.5 | Hardware de puerta: celulares, Starlink (ya comprado), router, cargadores | Vos | Es costo aparte, nunca gratis dentro del cargo |
| 0.6 | Revisar términos con el boliche (venta a menores, no reembolso, responsabilidades de puerta) | Vos + legales/ | Paquete legal ya existe para clubes; hay que adaptarlo |
| 0.7 | Fecha objetivo del primer evento y una **noche de prueba** previa | Vos | La primera noche en vivo no es la prueba |

## Fase 1 · Entradas de boliche (núcleo, bloquea la salida)
| # | Qué | Tamaño | Notas |
|---|---|---|---|
| 1.1 | **Hora límite de ingreso por tipo de entrada** | M | Campo nuevo en el tipo de entrada (hora de corte). El scanner rechaza con "FUERA DE HORARIO · cerró a la 1:00". Mostrar el corte en la entrada del comprador. Considerar eventos que pasan la medianoche |
| 1.2 | Scanner: mostrar el **nombre del tipo de entrada en grande** | S | Para controlar "H+25 M+23" contra el documento |
| 1.3 | **Duplicar evento** (copiar tipos, fases, puertas, scanners) | M | Un boliche repite cada fin de semana |
| 1.4 | **Combos con varios ingresos**: una compra genera N entradas (un QR por persona) | L | Reutiliza entradas nominales. Se conecta con la Fase 2 (botella como beneficio) |
| 1.5 | **Interruptores de módulos** por organización con precio configurable | M | Como la taquilla: se activa o se apaga por boliche |
| 1.6 | Entradas gratis con cupo y corte de horario propio | S | Ya funciona precio 0; falta verificar con 1.1 |
| 1.7 | Prueba completa con el flujo real del boliche (transferencia, preventas, gratis, combos) | M | Con datos de su evento anterior |

## Fase 2 · Canje de beneficios en la barra (módulo 1)
| # | Qué | Tamaño | Notas |
|---|---|---|---|
| 2.1 | Beneficios por tipo de entrada o combo ("1 trago", "1 botella + 4 gaseosas") | M | Extender la tabla `entitlements` que hoy usan solo las mesas |
| 2.2 | Crear los beneficios al pagar, junto con las entradas | M | Igual que cupones/titulares: después de crear la orden |
| 2.3 | Pantalla **Barra** (link + PIN, como el scanner): escanear, ver saldo, canjear | M | Canje parcial; varias barras opcionales |
| 2.4 | El comprador ve "te queda 1 trago" en su entrada y en el carnet | S | |
| 2.5 | Reporte de canjes: canjeadas, no canjeadas, por barra y por hora | M | Útil para el boliche y para el cobro del módulo |
| 2.6 | Reglas: qué pasa con lo no canjeado, que entrar por la puerta no consuma el trago | S | Decisiones tuyas |

## Fase 3 · Aguantar la escala (en paralelo, bloquea la salida en vivo)
| # | Qué | Tamaño | Notas |
|---|---|---|---|
| 3.1 | Servidor de Vercel en **São Paulo** (hoy pdx1) y revisar región de Supabase | S | Menos demora por escaneo |
| 3.2 | **Prueba de carga**: 1.500 compras y 1.500 escaneos simultáneos | M | Medir y corregir cuellos de botella |
| 3.3 | **Scanner sin conexión**: lista de entradas válidas en el celular, validación local, sincronización al volver | L | Hoy sin internet no se valida. Starlink baja el riesgo pero no lo elimina |
| 3.4 | Alertas y monitoreo (errores, caídas) | S | Saber antes que el boliche |
| 3.5 | Copias de seguridad y plan de recuperación | S | Incluido en Supabase Pro |
| 3.6 | Plan de contingencia de la noche (qué hace cada uno si falla X) | S | Documento de una página |

## Fase 4 · Barra con ventas (módulo 2, solo si el boliche lo pide)
| # | Qué | Tamaño |
|---|---|---|
| 4.1 | Carta de productos y precios por barra | M |
| 4.2 | Venta de barra (ítems, medios de pago, cajero, turno), reutilizando lo de la taquilla | L |
| 4.3 | Cobro con QR/transferencia **del boliche** (ENPASS solo registra, no mueve la plata) | M |
| 4.4 | Cierre de turno y diferencias de caja | M |
| 4.5 | Vincular la venta con el canje de beneficios | S |

Regla: nada de mover plata de la barra por ENPASS en esta fase (ver [[project-pricing-model]]).

## Fase 5 · Stock y gastos (módulo 3, solo si lo piden)
| # | Qué | Tamaño |
|---|---|---|
| 5.1 | Inventario por barra y depósito | M |
| 5.2 | Recetas (60 ml de fernet por trago) y descuento automático en cada venta | L |
| 5.3 | Compras, mermas y costos | M |
| 5.4 | Reportes: ganancia por noche, por producto y por barra | M |

## Fase 6 · Venue (plan para boliches recurrentes)
| # | Qué | Tamaño |
|---|---|---|
| 6.1 | Plan mensual con entradas incluidas y costo por exceso | M |
| 6.2 | Facturación de los módulos al boliche (abonos, mínimos por evento) | M |
| 6.3 | Panel de boliche con vista de varias noches y comparación | M |

---

## Operación (en paralelo)
- Staffing de puertas y coordinador (costo base $6.000/h por persona, jornada de 8 h, más seguro, viático y margen).
- Checklist de la noche: equipos cargados, PIN de scanners, puertas, taquilla, canje.
- Soporte durante la noche: quién atiende y por dónde.
- Capacitación del boliche con los videos de onboarding (evento, scanners, taquilla) y uno nuevo de barra.

## Módulos y cobro (precios a definir, no fijar en código)
| Módulo | Incluye | Cobro propuesto |
|---|---|---|
| Ticketing (base) | Venta, QR, scanner, taquilla, RRPP, invitados, reportes | Cargo de servicio sobre la entrada |
| Canje de consumiciones | Fase 2 | Por evento o dentro de un plan |
| Barra / POS | Fase 4 | Mínimo por evento o 1-2% de ventas de barra, el mayor |
| Stock | Fase 5 | Abono mensual |
| Venue | Fase 6 | Abono mensual + entradas incluidas + exceso |
| Operación | Staffing, hardware, Starlink | Aparte, costo + margen |

## Camino mínimo para el primer boliche
**0.1, 0.2, 0.3 → 1.1, 1.2, 1.3, 1.4, 1.5 → 2.1 a 2.4 → 3.1, 3.2, 3.6 → noche de prueba → salida.**
Después, según lo que pidan: 3.3 (sin conexión), Fase 4 y Fase 5.

## Decisiones tuyas pendientes
1. Cargo y quién lo paga en boliches (¿12%, 10%, otro?).
2. Precio de cada módulo.
3. Consumición no canjeada: ¿se pierde?
4. ¿Canje en cualquier barra o una específica?
5. ¿ENPASS cobra las entradas y liquida, o el boliche cobra directo?
6. Fecha de arranque.

## Riesgos
- Salir en vivo en planes gratuitos (suspensión del proyecto o límites en plena noche).
- Scanner sin conexión no resuelto antes de una noche grande.
- Querer construir barra y stock completos antes de saber qué usa el boliche.
- Cambios de reglas de ingreso (edad, género, horarios) que se resuelvan "a mano" en la puerta.
