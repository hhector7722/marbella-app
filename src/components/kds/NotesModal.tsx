"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { KdsMesaNumber } from "@/components/kds/KdsMesaNumber";
import { cn } from "@/lib/utils";

function norm(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function splitNotes(raw: string | null | undefined) {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

function joinNotes(items: string[]) {
  return items.map((s) => s.trim()).filter(Boolean).join("\n");
}

function extractMesaValue(title: string, subtitle?: string | null) {
  const src = `${title ?? ""}\n${subtitle ?? ""}`.trim();
  const m = src.match(/mesa\s+([^\s]+)/i);
  return (m?.[1] ?? "--").toString();
}

export function NotesModal(props: {
  isOpen: boolean;
  title: string;
  subtitle?: string | null;
  initialNotes: string | null | undefined;
  quickNotes: readonly string[];
  accent?: "red" | "rose";
  onClose: () => void;
  onSave: (notes: string) => Promise<void> | void;
}) {
  const { isOpen, title, subtitle, initialNotes, quickNotes, onClose, onSave } = props;

  const [selectedQuick, setSelectedQuick] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState("");
  const [isWriting, setIsWriting] = useState(false);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const initial = splitNotes(initialNotes);
    const quickNorm = new Map(quickNotes.map((q) => [norm(q), q]));
    const nextSelected = new Set<string>();
    const rest: string[] = [];
    initial.forEach((it) => {
      const key = norm(it);
      const q = quickNorm.get(key);
      if (q) nextSelected.add(q);
      else rest.push(it);
    });
    setSelectedQuick(nextSelected);
    setFreeText(joinNotes(rest));
    setIsWriting(false);
  }, [isOpen, initialNotes, quickNotes]);

  useEffect(() => {
    if (!isOpen) return;
    if (!isWriting) return;
    // Teclado nativo: foco tras el gesto del usuario (click "ESCRIBIR") + refuerzo.
    const focus = () => {
      try {
        textareaRef.current?.focus({ preventScroll: true });
      } catch {
        textareaRef.current?.focus();
      }
    };
    const t1 = setTimeout(focus, 0);
    const t2 = setTimeout(focus, 60);
    requestAnimationFrame(() => focus());
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [isOpen, isWriting]);

  const mesaValue = useMemo(() => extractMesaValue(title, subtitle), [title, subtitle]);
  const canSave = useMemo(() => !saving, [saving]);

  const toggleQuick = (q: string) => {
    setSelectedQuick((prev) => {
      const next = new Set(prev);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });
  };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-1 sm:p-2"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-[98vw] max-w-6xl h-[92vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col bg-[#1b1c20] border border-black/30">
        {/* Cabecera: mismo color que el footer (fila resumen fija) */}
        <div className="px-3 sm:px-4 py-2 bg-[#12141a] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0 flex items-center gap-3">
            <KdsMesaNumber value={mesaValue} isCompleted={false} />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Botón escribir: tarjeta estilo resumen, fuente algo menor */}
            <button
              type="button"
              onClick={() => setIsWriting((v) => !v)}
              className="min-h-[48px] px-3 rounded-xl border border-zinc-200/90 bg-white text-zinc-900 shadow-sm transition active:scale-[0.99] hover:bg-zinc-50"
              title="Escribir"
            >
              <span className="text-[12px] sm:text-[13px] font-black uppercase tracking-[0.14em]">
                Escribir
              </span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"
              aria-label="Cerrar"
            >
              <X size={22} />
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto flex-1">
          {/* Caja de texto libre + teclado nativo */}
          {isWriting && (
            <div className="rounded-2xl border border-black/25 bg-white p-3 sm:p-4 shadow-sm">
              <textarea
                ref={textareaRef}
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder="Escribe notas…"
                className="w-full min-h-[200px] sm:min-h-[260px] rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-3 text-lg sm:text-xl font-semibold tracking-wide text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#407080]/25"
                inputMode="text"
                autoCorrect="off"
                autoCapitalize="sentences"
                spellCheck={false}
              />
            </div>
          )}

          {/* Notas rápidas: tarjetas blancas (mismo tipo/tamaño que resumen) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {quickNotes.map((q) => {
              const isOn = selectedQuick.has(q);
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => toggleQuick(q)}
                  className={cn(
                    "min-h-[56px] sm:min-h-[64px] rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-center shadow-sm transition active:scale-[0.99] hover:bg-zinc-50",
                    "font-black uppercase tracking-[0.04em] text-zinc-900 text-2xl sm:text-3xl",
                    isOn && "ring-2 ring-red-600/70 border-red-600"
                  )}
                >
                  {q}
                </button>
              );
            })}
          </div>
        </div>

        {/* Acciones */}
        <div className="p-3 sm:p-4 border-t border-black/25 bg-[#12141a] flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] px-5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-[0.16em] text-base"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={async () => {
              const quickSelectedInOrder = quickNotes.filter((q) => selectedQuick.has(q));
              const free = splitNotes(freeText);
              const payload = joinNotes([...quickSelectedInOrder, ...free]);
              try {
                setSaving(true);
                await onSave(payload);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.16em] text-base disabled:opacity-60"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

