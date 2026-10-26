# Copiloto de chat: Groq GPT-OSS 120B

## Alcance

Sustituye el backend de **chat escrito** de `/api/copiloto`, antes basado en `ollama.chat({model:"qwen3:8b"})`, por llamadas a `https://api.groq.com/openai/v1/chat/completions` con `openai/gpt-oss-120b`.

No altera `ChatMarbella.tsx`, Supabase, perfiles, ni la arquitectura del KDS. No cambia el modo de **llamada de voz en directo** (todavía usa OpenAI Realtime y puede facturar) ni la transcripción por micrófono (todavía usa OpenAI Whisper). Tampoco cambia OCR de albaranes.

## Activación

1. Crear una clave de API en una organización de **plan gratuito** de Groq, sin asociar método de pago ni subir al plan Developer.
2. Configurar la variable de servidor `GROQ_API_KEY` en **Vercel → marbella-app → Settings → Environment Variables** para Production/Preview. No usar prefijo `NEXT_PUBLIC_`.
3. Desplegar la rama con esa variable; abrir Chat Marbella y preguntar por ventas del día, ingredientes, stock, empleados y proveedores.
4. Supervisar el consumo y los límites reales de la organización en `https://console.groq.com/settings/limits`.

La API no se utiliza cuando falta la clave: devuelve HTTP 503 sin recurrir a OpenAI u otro servicio de pago.

## Seguridad y costes

- El cliente Supabase sigue siendo el de la sesión autenticada; las RPC mantienen sus permisos RLS y `canExecute`.
- El modelo solo puede usar un conjunto explícito de **15 herramientas de lectura**. No puede cerrar caja, actualizar stock, crear pedidos ni modificar usuarios.
- La selección de herramientas es limitada y se realiza en el servidor antes de la llamada: máximo 7 definiciones relevantes por petición; máximo 3 rondas de modelo, sin ejecución de una tercera llamada a herramientas.
- El sistema no contiene un router por palabra clave que ejecute acciones sin razonamiento: una pregunta sobre subidas de precios no se convierte automáticamente en un listado de proveedores.
- Sin clave, sin cuota, o ante error de red, se devuelve un mensaje explícito. **No hay fallback a APIs de pago**.
- Groq es un proveedor externo; información de los empleados y de negocio consultada por el modelo se transmite al proveedor bajo las condiciones de su cuenta. Valorar RGPD, minimización de datos y retención antes de probarlo con información sensible.
- No es posible garantizar que el plan siga siendo gratis indefinidamente: elegir una organización Free sin activar facturación y verificar periódicamente la cuota.

## Comprobación

```bash
node --experimental-strip-types --test src/lib/copilot/groq-chat.test.ts
npx tsc --noEmit
npx eslint src/app/api/copiloto/route.ts src/lib/copilot/groq-chat.ts src/lib/copilot/groq-chat.test.ts
npm run build
```

La validación de red contra Groq necesita una clave Free real, sin compartirla en GitHub ni en chat.

## Limitaciones

- Falta una herramienta de análisis histórico de precios de albaranes: el modelo debe reconocer que no puede responder con precisión a comparativas que no cubran las RPC existentes.
- En modo texto no existe confirmación de acciones porque el agente **no expone escrituras**.
- No se ha adaptado el modo de voz, Whisper ni OCR de documentos.
- El historial se sigue guardando en la tabla existente `ai_chat_messages` según el flujo actual, sin migraciones.
