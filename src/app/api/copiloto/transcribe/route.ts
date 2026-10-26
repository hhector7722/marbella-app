import { createClient } from '@/utils/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 45;

const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const AUDIO_TYPES = /^(audio\/(webm|mp4|mpeg|mp3|ogg|wav|x-m4a|m4a|aac)|application\/octet-stream)(;.*)?$/i;

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return Response.json({ error: 'Inicia sesión para dictar.' }, { status: 401 });

  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return Response.json({ error: 'El servicio de dictado no está configurado.' }, { status: 503 });

  try {
    const form = await req.formData();
    const file = form.get('file');
    if (!(file instanceof File) || !AUDIO_TYPES.test(file.type) || file.size < 500 || file.size > MAX_AUDIO_BYTES) {
      return Response.json({ error: 'Audio no válido (máximo 20 MB). Mantén pulsado el micrófono para grabar.' }, { status: 400 });
    }
    const mime = file.type.toLowerCase();
    const extension = /mp4|m4a|aac/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
    const groqForm = new FormData();
    groqForm.append('file', new File([file], `dictado.${extension}`, { type: file.type }));
    groqForm.append('model', 'whisper-large-v3-turbo');
    groqForm.append('language', 'es');
    groqForm.append('response_format', 'json');

    const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: groqForm,
      signal: AbortSignal.timeout(30000),
      cache: 'no-store',
    });
    if (!response.ok) {
      console.error('[copilot:transcribe] Groq HTTP', response.status);
      return Response.json({ error: response.status === 429
        ? 'Límite del dictado gratuito alcanzado. Inténtalo más tarde.'
        : 'No se ha podido transcribir el audio.' }, { status: response.status === 429 ? 429 : 502 });
    }
    const data = await response.json() as { text?: string };
    if (!data.text?.trim()) return Response.json({ error: 'No se ha detectado voz en el audio.' }, { status: 422 });
    return Response.json({ text: data.text.trim() });
  } catch (cause) {
    console.warn('[copilot:transcribe]', cause instanceof Error ? cause.name : 'Error');
    return Response.json({ error: 'No se pudo procesar el audio. Comprueba tu conexión.' }, { status: 500 });
  }
}
