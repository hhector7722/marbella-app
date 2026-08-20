"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { KdsMesaNumber } from "@/components/kds/KdsMesaNumber";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

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

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={<KdsMesaNumber value={mesaValue} isCompleted={false} />}
      variant="work"
      layer="base"
      instance="kds-notes"
      headerTone="petroleum"
      hideHeaderDivider
      headerTrailing={
        <button
          type="button"
          onClick={() => setIsWriting((v) => !v)}
          className="relative flex h-full max-h-full min-h-0 shrink-0 items-center px-2 rounded-xl border border-zinc-200/90 bg-white text-zinc-900 shadow-sm transition active:scale-[0.99] hover:bg-zinc-50 before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
          title="Escribir"
        >
          <span className="text-[12px] sm:text-[13px] font-black uppercase tracking-[0.14em]">
            Escribir
          </span>
        </button>
      }
      footer={
        <div className="flex w-full items-center justify-end gap-2">
          <Button type="button" variant="secondary" instance="kds-notes-cancel" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="primary"
            instance="kds-notes-save"
            disabled={!canSave}
            loading={saving}
            loadingLabel="Guardar"
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
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
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
                  isOn && "ring-2 ring-[#D56170]/70 border-[#D56170]"
                )}
              >
                {q}
              </button>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

