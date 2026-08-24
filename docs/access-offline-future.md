# Access offline — decisión futura

FASE 3 no valida ingresos sin red. Cuando el dispositivo queda offline, `/scan` pausa la cámara, muestra un bloqueo explícito y no permite marcar entradas como usadas.

Un modo offline real necesitaría paquetes de credenciales firmados por Event y puerta, claves rotables, reloj tolerante, ledger local append-only, identificadores idempotentes, sincronización posterior y una política explícita para conflictos entre varios dispositivos. Sin ese protocolo, dos puertas desconectadas podrían aceptar el mismo Ticket.

Evaluar FASE 3.5 solo si la operación real demuestra cortes frecuentes o venues sin conectividad confiable. Hasta entonces, polling online conserva un modelo sencillo y una única fuente de verdad transaccional en PostgreSQL.
