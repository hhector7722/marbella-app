"use client";

import { useState } from "react";
import {
  isWeekendNoteProposal,
  WEEKEND_NOTE_TOOL_NAME,
  type WeekendNoteProposal,
} from "@/lib/copilot/weekend-note-proposal";

/** Únicamente acepta propuestas que provengan de la salida del tool. */
export function weekendNoteFromToolPart(part: unknown): WeekendNoteProposal | null {
  if (!part || typeof part !== "object") return null;
  const value = part as Record<string, unknown>;
  const typed = value.type === `tool-${WEEKEND_NOTE_TOOL_NAME}`;
  const dynamic = value.type === "dynamic-tool" && value.toolName === WEEKEND_NOTE_TOOL_NAME;
  if (!typed && !dynamic) return null;
  return isWeekendNoteProposal(value.output) ? value.output : null;
}

export default function WeekendNoteApproval({ proposal }: { proposal: WeekendNoteProposal }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "dismissed">("idle");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (state !== "idle") return;
    setState("saving");
    setError(null);
    try {
      const response = await fetch("/api/copiloto/actions/confirm", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: proposal.date, content: proposal.content }),
      });
      const result: unknown = await response.json();
      if (!response.ok || !result || typeof result !== "object" || !("ok" in result) || result.ok !== true) {
        const message = result && typeof result === "object" && "error" in result && typeof result.error === "string"
          ? result.error : "No se ha podido guardar la nota.";
        throw new Error(message);
      }
      setState("saved");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Error de conexión al guardar.");
      setState("idle");
    }
  }

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-xl border border-sky-300/25 bg-slate-950/30 p-3" data-element="copilot-weekend-note-approval">
      <div className="text-xs font-semibold text-sky-200">Nota general · {proposal.date}</div>
      <p className="whitespace-pre-wrap break-words text-sm text-white">{proposal.content}</p>
      <p className="text-xs text-amber-100/80">{proposal.warning}</p>
      {state === "saved" ? (
        <p role="status" className="text-sm font-semibold text-emerald-300">Nota guardada correctamente.</p>
      ) : state === "dismissed" ? (
        <p role="status" className="text-sm text-slate-300">Operación cancelada. No se han guardado cambios.</p>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => void confirm()} disabled={state === "saving"}
            className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {state === "saving" ? "Guardando…" : "Confirmar y guardar"}
          </button>
          <button type="button" onClick={() => setState("dismissed")} disabled={state === "saving"}
            className="rounded-lg border border-white/20 px-3 py-2 text-sm text-slate-100 disabled:opacity-50">
            Cancelar
          </button>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </div>
  );
}
