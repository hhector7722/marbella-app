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
