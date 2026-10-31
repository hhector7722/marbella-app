# Multimedia en el chat de Marbella App

## Audio desde el micrófono pequeño

El usuario mantiene pulsado el micrófono para grabar y suelta para enviar. La
transcripción se procesa con el proveedor Groq (`whisper-large-v3-turbo`), usando
`GROQ_API_KEY` que ya utiliza el chat textual. Si la caja está vacía y la IA no
está ocupada, la transcripción se envía automáticamente; si el usuario está
escribiendo, el dictado se añade a la caja para que pueda revisarlo.

La ruta `/api/copiloto/transcribe` requiere autenticación, limita el audio a 20 MB,
señala errores del proveedor sin exponer claves ni respuestas privadas y no
conserva los archivos originales.

## Adjuntos

El botón `+` permite seleccionar una imagen de hasta 10 MB o PDF de hasta 20 MB.
Al pulsar Enviar, `/api/copiloto/attachments` autentica al usuario y analiza
el fichero únicamente en la petición actual. Para imágenes se usa el modelo
multimodal Groq `qwen/qwen3.8-27b`; para PDFs `pdf2json` extrae texto de las páginas.

- Se adjunta el contenido interpretado a la consulta mediante
  `attachmentContext`, validado por el servidor (máximo 16 000 caracteres),
  sin conceder permisos extra sobre datos de la app.
- El texto permanece disponible en la sesión abierta del componente del chat
  para preguntas posteriores, pero el binario **no se almacena** en Supabase.
- En PDF extensos se limita el texto a 14 000 caracteres; se avisa si se truncó.
- PDFs escaneados sin texto seleccionable no se fingen procesados y muestran un
  error claro. El OCR de albaranes sigue funcionando por la vía especializada.

## Conversación de voz

El botón Llamada abre `VoiceConversation`, que usa micrófono y VAD local para
capturar turnos, Groq Whisper para transcribir, la misma API del copiloto para
responder (y sus controles RLS), y la síntesis `speechSynthesis` del navegador
para hablar. Escucha de nuevo automáticamente después de pronunciar la respuesta.
Es una conversación **por turnos**, no una conexión Full Duplex WebRTC.

El módulo anterior utilizaba `gpt-4o-realtime-preview-2024-12-17` (modelo
retirado); ya no se usa en el cliente. No se crea una sesión facturable de OpenAI.
La compatibilidad real de micrófono y audio hablado depende del navegador,
los permisos del usuario, HTTPS y el dispositivo. Debe probarse en iPhone.

## Límite de archivos al desplegar en Vercel

Las funciones de Vercel tienen un límite de 4,5 MB por petición. Una imagen
seleccionada se transforma localmente a JPEG (máximo 1440 px, calidad 77 %) y
se comprueba que pesa menos de 3,8 MB antes de enviarla al servidor. Un PDF de
más de 3,8 MB (hasta 20 MB) se extrae con PDF.js **en el navegador**: a la
API del chat se manda únicamente el texto, no el binario. Los PDF menores se
procesan en la ruta de servidor usando pdf2json.

Esto preserva el PDF original del usuario y evita `413 FUNCTION_PAYLOAD_TOO_LARGE`.
Si el navegador no puede decodificar una imagen HEIC, solicita convertirla a JPG.

El worker de PDF.js se sirve desde `/pdfjs/pdf.worker.min.mjs` (versión
empaquetada en `public/pdfjs`, licencia Apache-2.0 incluida en el propio
archivo); no depende de un CDN ni de rutas internas inexistentes del bundle
Next.js. Al actualizar la versión `pdfjs-dist` del package, debe actualizarse
el worker de esta carpeta con la misma versión.
