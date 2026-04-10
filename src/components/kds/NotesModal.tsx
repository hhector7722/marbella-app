"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Plus, Check, Pencil, Trash2 } from "lucide-react";

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
  const {
    isOpen,
    title,
    subtitle,
    initialNotes,
    quickNotes,
    accent = "rose",
    onClose,
    onSave,
  } = props;

  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setItems(splitNotes(initialNotes));
    setDraft("");
    setEditingIndex(null);
    // Teclado nativo: intentar foco "fuerte" al abrir.
    // Nota: en iOS/Android el teclado puede requerir gesto del usuario; esto mejora el éxito en la mayoría de casos.
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
  }, [isOpen, initialNotes]);

  const setByAddingUnique = (text: string) => {
    const cleaned = text.trim().replace(/\s+/g, " ");
    if (!cleaned) return;
    const target = norm(cleaned);
    setItems((prev) => {
      const existing = new Set(prev.map(norm));
      if (existing.has(target)) return prev;
      return [...prev, cleaned];
    });
  };

  const canSave = useMemo(() => true, []);
  const accentClasses =
    accent === "red"
      ? { title: "text-red-700" }
      : { title: "text-rose-800" };

  if (!isOpen || !mounted) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[2147483647] bg-black/60 backdrop-blur-[1px] flex items-center justify-center p-2 sm:p-3"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl max-h-[86vh] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
        <div className="px-4 sm:px-5 py-3 bg-[#36606F] text-white flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="text-lg sm:text-xl font-black uppercase tracking-[0.12em] truncate">
              {title}
            </div>
            {subtitle && (
              <div className="text-sm sm:text-base font-bold text-white/70 tracking-wide truncate">
                {subtitle}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 w-12 h-12 rounded-xl bg-white/10 hover:bg-white/15 flex items-center justify-center"
          >
            <X size={22} />
          </button>
        </div>

        {/* Cuerpo scrollable para mantener cabecera + footer siempre visibles */}
        <div className="p-3 sm:p-4 space-y-3 overflow-y-auto flex-1">
          {/* Chips notas rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2">
            {quickNotes.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setByAddingUnique(q)}
                className="min-h-[48px] rounded-xl border-2 border-black bg-white text-black px-3 py-2 text-center font-black uppercase tracking-[0.08em] text-[12px] sm:text-[13px] hover:bg-slate-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Lista actual */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[12px] sm:text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                Notas
              </div>
              <button
                type="button"
                onClick={() => {
                  setItems([]);
                  setEditingIndex(null);
                  setDraft("");
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className="min-h-[44px] px-3 rounded-xl bg-white border border-slate-200 text-slate-700 font-black uppercase tracking-[0.12em] text-[11px] hover:bg-slate-100"
              >
                Borrar
              </button>
            </div>

            {items.length === 0 ? (
              <div className="text-slate-500 font-bold tracking-wide italic py-2">
                Sin notas
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={`${it}-${idx}`}
                    className="flex items-start gap-2 rounded-xl bg-white border border-slate-200 p-3"
                  >
                    <div className={`text-xl font-black ${accentClasses.title}`}>·</div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingIndex(idx);
                        setDraft(it);
                        requestAnimationFrame(() => textareaRef.current?.focus());
                      }}
                      className="flex-1 text-left text-base sm:text-lg font-bold tracking-wide text-slate-800 break-words"
                    >
                      {it}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setItems((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="shrink-0 w-12 h-12 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center"
                      title="Borrar nota"
                    >
                      <Trash2 size={18} className="text-slate-700" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Botón + (solo aquí, no pesa en la tarjeta si no hay notas) */}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setEditingIndex(null);
                  setDraft("");
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className="w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-lg"
                title="Añadir nota"
              >
                <Plus size={26} strokeWidth={3} />
              </button>
            </div>
          </div>

          {/* Editor */}
          <div className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-[12px] sm:text-sm font-black uppercase tracking-[0.18em] text-slate-500">
                {editingIndex === null ? "Nueva nota" : "Editar nota"}
              </div>
              <button
                type="button"
                onClick={() => textareaRef.current?.focus()}
                className="min-h-[44px] px-3 rounded-xl bg-[#407080] hover:bg-[#36606F] text-white font-black uppercase tracking-[0.12em] text-[11px] flex items-center gap-2"
              >
                <Pencil size={16} /> Escribir
              </button>
            </div>

            <textarea
              ref={textareaRef}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Escribe una nota…"
              className="w-full min-h-[88px] rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-base sm:text-lg font-semibold tracking-wide text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#407080]/40"
              inputMode="text"
              autoCorrect="off"
              autoCapitalize="sentences"
              spellCheck={false}
            />

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const cleaned = draft.trim().replace(/\s+/g, " ");
                  if (!cleaned) return;
                  setItems((prev) => {
                    const existing = new Set(prev.map(norm));
                    if (existing.has(norm(cleaned))) return prev;
                    if (editingIndex === null) return [...prev, cleaned];
                    const next = [...prev];
                    next[editingIndex] = cleaned;
                    return next;
                  });
                  setDraft("");
                  setEditingIndex(null);
                  requestAnimationFrame(() => textareaRef.current?.focus());
                }}
                className="flex-1 min-h-[52px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black uppercase tracking-[0.14em] text-base flex items-center justify-center gap-2"
              >
                <Plus size={20} strokeWidth={3} />{" "}
                {editingIndex === null ? "Añadir" : "Actualizar"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraft("");
                  setEditingIndex(null);
                }}
                className="min-h-[52px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black uppercase tracking-[0.14em] text-base"
              >
                Limpiar
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 border-t border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[52px] px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-black uppercase tracking-[0.14em] text-base"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !canSave}
            onClick={async () => {
              const payload = joinNotes(items);
              try {
                setSaving(true);
                await onSave(payload);
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            className="flex-1 min-h-[52px] rounded-xl bg-[#407080] hover:bg-[#36606F] text-white font-black uppercase tracking-[0.16em] text-base flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Check size={22} strokeWidth={3} /> Guardar
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

