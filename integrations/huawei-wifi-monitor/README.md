# Monitor Wi-Fi Huawei → Marbella

Monitoriza **un solo dispositivo** asociado al Wi-Fi del router Huawei B311-221. La detección ocurre en la red local y transmite exclusivamente el cambio de estado a Marbella: ni la dirección MAC ni las credenciales del router salen del ordenador.

## Antes de activar

1. Confirmar que la persona propietaria del iPhone está informada del seguimiento, su finalidad y conservación de datos, especialmente si se pretende utilizar como control laboral.
2. Conectar el ordenador que ejecuta el proceso a la **misma LAN del Huawei**. No se puede ejecutar desde un equipo de otra red.
3. Identificar la dirección MAC **de ese Wi-Fi concreto** en Ajustes > Wi-Fi > (i) de la red, o con el modo de diagnóstico \`--probe\`. En iOS configurar la dirección Wi-Fi privada como **Fija** para esa red. No hace falta conocer si es iPhone 14 o 14 Pro.
4. Verificar que la PWA Marbella está instalada en el móvil destinatario y que tiene las notificaciones push activas.

## Instalación (Windows o Linux)

Python 3.9 o superior. En una carpeta local fuera del repositorio:

\`\`\`sh
python -m pip install -r requirements.txt
\`\`\`

Configurar las variables siguientes en el proceso, un archivo local protegido o el administrador de servicios **sin subirlas a Git**:

\`\`\`ini
HUAWEI_ROUTER_URL=http://IP_PRIVADA_DEL_HUAWEI/
HUAWEI_USERNAME=USUARIO_ADMIN_ROUTER
HUAWEI_PASSWORD=CONTRASENA_ADMIN_ROUTER
WIFI_TARGET_MAC=AA:BB:CC:DD:EE:FF
MARBELLA_WIFI_EVENTS_URL=https://DOMINIO_REAL_DE_MARBELLA/api/internal/wifi-presence
WIFI_PRESENCE_WEBHOOK_SECRET=CLAVE_ALEATORIA_DE_32_O_MAS_CARACTERES
WIFI_POLL_SECONDS=10
WIFI_DISCONNECT_SECONDS=30
\`\`\`

Para obtener las MAC conectadas, antes de configurar la MAC objetivo y las claves de Marbella:

\`\`\`sh
python monitor.py --probe
\`\`\`

Para monitorizar:

\`\`\`sh
python monitor.py
\`\`\`

Utilizar el administrador de servicios del ordenador (Windows Programador de tareas o PM2/systemd donde ya esté operativo) con inicio automático y reinicio en caso de error. **No lanzar varias instancias a la vez.**

## Configuración del servidor

- Crear en Vercel la variable privada \`WIFI_PRESENCE_WEBHOOK_SECRET\` con la misma clave aleatoria configurada en el ordenador; no usar \`NEXT_PUBLIC_\`.
- Deben existir \`SUPABASE_SERVICE_ROLE_KEY\`, \`NEXT_PUBLIC_SUPABASE_URL\`, \`NEXT_PUBLIC_VAPID_PUBLIC_KEY\` y \`VAPID_PRIVATE_KEY\` que usa ya Marbella.
- Ejecutar la migración \`wifi_presence_events\` antes de activar el proceso local.
- La ruta no acepta ninguna solicitud si falta la clave. Solo genera alertas para la cuenta definida por \`NOTIFICATION_HECTOR_EMAIL\`.

## Comportamiento

- Primer sondeo: establece referencia sin enviar un aviso ficticio.
- Conectado: confirmación por dos sondeos consecutivos.
- Desconectado: confirma durante al menos 30 s.
- Error de router, HTTP o datos incompletos: no se interpreta como desconexión.
- Cada cambio confirmado se conserva en un archivo local hasta que Marbella confirma su recepción.
- Los reintentos utilizan el mismo UUID; la BD evita notificaciones duplicadas.
- Cada evento aparece en la campana de Marbella y se intenta enviar por Web Push.
- Aviso no implica que su propietario esté físicamente en el local.
- Los avisos push pueden fallar si están bloqueados en iOS; el servidor distingue aceptación del proveedor de visualización en pantalla.

## Comprobación

Ejecutar \`python -m unittest test_monitor.py\`. Realizar después una prueba controlada de conexión/desconexión del dispositivo autorizado, con el monitor en la LAN del bar y la PWA habilitada.

No se activa vigilancia real mientras no se valide la respuesta \`wlan/host-list\` del firmware concreto y no se configure la MAC correcta.
