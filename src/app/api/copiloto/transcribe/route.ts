import { NextRequest, NextResponse } from "next/server";
import { experimental_transcribe as transcribe } from "ai";
import { gateway } from "@ai-sdk/gateway";
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

  try {
    // Usa el mismo OIDC de Vercel que las consultas de texto.
    // No es necesario publicar ni duplicar una clave de OpenAI en Preview.
    const { text } = await transcribe({
      model: gateway.transcriptionModel("openai/gpt-4o-mini-transcribe"),
      audio: new Uint8Array(await file.arrayBuffer()),
      abortSignal: AbortSignal.timeout(45000),
    });
    if (!text?.trim()) {
      return NextResponse.json({ error: "No se ha reconocido voz en la grabación." }, { status: 422 });
    }
    return NextResponse.json({ text: text.trim() });
  } catch (cause) {
    console.error("[Copiloto] STT Gateway request error:", cause);
    return NextResponse.json({ error: "El servicio de transcripción no responde." }, { status: 502 });
  }
}
