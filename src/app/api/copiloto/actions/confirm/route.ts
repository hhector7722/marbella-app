import { NextResponse } from "next/server";
import { saveWeekendPublicScheduleNote } from "@/app/actions/schedule-weekend-public-note";
import { prepareWeekendNoteProposal } from "@/lib/copilot/weekend-note-proposal";

/** Solo se ejecuta después de la aprobación expresa en la interfaz. */
export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) {
    return NextResponse.json({ error: "Origen no autorizado." }, { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const proposal = prepareWeekendNoteProposal(raw);
  if ("error" in proposal) {
    return NextResponse.json({ error: proposal.error }, { status: 400 });
  }
  // La acción preexistente valida auth.getUser(), identidad, perfil y RLS.
  const result = await saveWeekendPublicScheduleNote(proposal.date, proposal.content);
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 403 });
  }
  return NextResponse.json({ ok: true, date: proposal.date, content: result.content });
}
