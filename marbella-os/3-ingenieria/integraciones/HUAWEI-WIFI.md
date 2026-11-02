---
documento: INTEGRACION-HUAWEI-WIFI
clase: vivo
estado: vigente
capa: ingenieria
normativo: true
precedencia: 20
responsable: propiedad del producto
revisado: 2026-11-02
caducidad: 6 meses
depende_de: SEGURIDAD, ARQUITECTURA
supersede: —
---

# Huawei Wi-Fi — Alertas de conexión de un dispositivo

## Estado

Integración desarrollada en rama de función; activación pendiente de validar el firmware real, identificar la MAC del iPhone autorizado y ejecutar el monitor en un equipo de la LAN del bar. Ninguna alerta es operativa por el mero hecho de fusionar el código.

## Dirección y autoridad

1. El Huawei B311-221 observa qué MAC están asociadas a su punto de acceso. Es la autoridad únicamente de **asociación Wi-Fi**, no de presencia física ni jornada laboral.
2. Un proceso Python en un ordenador del bar ejecuta \`wlan.host_list()\` cada diez segundos. Fija el primer estado sin notificar, confirma las conexiones con dos lecturas y las desconexiones tras treinta segundos.
3. Ante un cambio confirmado, el agente registra un UUID y la marca temporal en un archivo local, y los envía por HTTPS al endpoint de Marbella \`/api/internal/wifi-presence\`. La MAC y las credenciales del Huawei no salen de la LAN.
4. El endpoint comprueba una clave dedicada, inserta el evento con deduplicación en \`wifi_presence_events\`, crea una tarjeta en \`user_notifications\` y utiliza las suscripciones Web Push existentes.
5. El destinatario es exclusivamente el perfil cuyo correo coincide con \`NOTIFICATION_HECTOR_EMAIL\` en el servidor. La campana es el historial del usuario.

## Fallos y seguridad

- Ausencia de secreto, fallo de autenticación o configuración incompleta: ruta cerrada. La clave no puede ser pública.
- Router sin respuesta o datos de formato no reconocido: **ningún cambio de estado**, nunca desconexión falsa.
- Petición fallida a Marbella: el evento sigue en cola local; se reintenta con el mismo UUID.
- Reintentos: la clave primaria del evento y el índice único parcial sobre notificaciones evitan duplicaciones del registro.
- Web Push confirma aceptación por el proveedor, no visualización efectiva en iOS. La interfaz puede conservar un aviso aunque el push falle.
- El acceso a la tabla de eventos no se concede a los roles \`anon\` ni \`authenticated\`. Solo el backend con privilegios de servicio puede operarla.
- No se considera prueba de entrada, salida ni geolocalización. Para cualquier uso sobre personal han de cumplirse las obligaciones de información y protección de datos.

## Código y operación

- Monitor externo: \`integrations/huawei-wifi-monitor/\`.
- Ingesta: \`src/app/api/internal/wifi-presence/route.ts\`.
- Migración: \`supabase/migrations/*_wifi_presence_events.sql\`.
- El procedimiento reproducible de instalación, sondeo y validación está junto al monitor en su \`README.md\`.

La validación técnica se realiza con pruebas unitarias del monitor, comprobación de tipos y una prueba presencial controlada en la red Huawei. Antes de esta última la integración no se declara operativa.
