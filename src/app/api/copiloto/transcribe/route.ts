import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;
const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "audio/webm", "audio/mp4", "audio/mpeg", "audio/mp3", "audio/wav",
  "audio/ogg", "audio/x-m4a", "audio/m4a", "video/webm",
]);

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  }
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "La transcripción no está configurada." }, { status: 503 });
  }

  let file: FormDataEntryValue | null;
  try {
    const data = await req.formData();
    file = data.get("file");
  } catch {
    return NextResponse.json({ error: "Audio inválido." }, { status: 400 });
  }
  if (!(file instanceof File) || !file.size || file.size > MAX_AUDIO_BYTES) {
    return NextResponse.json({ error: "El audio está vacío o excede los 15 MB." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.has(file.type.split(";")[0].toLowerCase())) {
    return NextResponse.json({ error: "Formato de audio no compatible." }, { status: 415 });
  }

  const audio = new FormData();
  audio.append("file", file, file.name || "grabacion.webm");
  audio.append("model", "gpt-transcribe");
  audio.append("language", "es");

  try {
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: audio,
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) {
      console.error("[Copiloto] STT upstream status:", response.status);
      return NextResponse.json(
        { error: "No se ha podido transcribir el audio. Comprueba la configuración del servicio." },
        { status: 502 },
      );
    }
    const data: unknown = await response.json();
    const text = data && typeof data === "object" && "text" in data &&
      typeof data.text === "string" ? data.text.trim() : "";
    if (!text) {
      return NextResponse.json({ error: "No se ha reconocido voz en la grabación." }, { status: 422 });
    }
    return NextResponse.json({ text });
  } catch (cause) {
    console.error("[Copiloto] STT request error:", cause);
    return NextResponse.json({ error: "El servicio de transcripción no responde." }, { status: 502 });
  }
}
