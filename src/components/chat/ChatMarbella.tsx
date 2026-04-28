"use client";
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import { useAIStore } from '@/store/aiStore';

type UiMessage = { role: 'user' | 'assistant'; content: string };

export default function ChatMarbella() {
  const isOpen = useAIStore((s) => s.isOpen);
  const closeChat = useAIStore((s) => s.closeChat);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const apiMessages = useMemo(
    () => messages.map((m) => ({ role: m.role, content: m.content })),
    [messages]
  );

  if (!isOpen) return null;

  const onClose = () => {
    closeChat();
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  };

  const sendMessage = async () => {
    const content = input.trim();
    if (!content || isSending) return;

    setIsSending(true);
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          messages: [...apiMessages, { role: 'user', content }],
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = payload?.detail || payload?.error || 'Error desconocido';
        throw new Error(String(detail));
      }

      const reply = payload?.reply;
      const nextSessionId = payload?.sessionId;
      if (typeof nextSessionId === 'string') setSessionId(nextSessionId);
      if (typeof reply !== 'string' || !reply.trim()) {
        throw new Error('Respuesta IA vacía o inválida');
      }

      setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
      queueMicrotask(scrollToBottom);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error('Fallo IA / conexión', { description: msg });
    } finally {
      setIsSending(false);
      queueMicrotask(scrollToBottom);
    }
  };

  const resetChat = () => {
    setSessionId(null);
    setMessages([]);
    setInput('');
  };

  return (
    <div 
      className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe md:items-center"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#3F5E7A] p-4 flex justify-between items-center text-white shrink-0">
          <div className="flex flex-col">
            <span className="font-black text-[10px] tracking-[0.2em] uppercase">Asistente Operativo</span>
            <span className="text-[10px] text-white/80">
              {sessionId ? `Sesión: ${sessionId.slice(0, 8)}…` : 'Sesión nueva'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetChat}
              className="h-9 px-3 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors text-[10px] font-black tracking-[0.18em] uppercase"
            >
              Nuevo
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 transition-colors"
              aria-label="Cerrar chat"
            >
              <X className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.length === 0 ? (
            <div className="rounded-2xl border border-zinc-100 shadow-sm p-4 text-[12px] text-zinc-700">
              Escribe una consulta operativa. Si no hay datos autorizados por RLS/RBAC, la IA devolverá “Dato no disponible”.
            </div>
          ) : (
            messages.map((m, idx) => (
              <div
                key={idx}
                className={[
                  'max-w-[90%] rounded-2xl px-4 py-3 text-[13px] leading-relaxed shadow-sm border border-zinc-100',
                  m.role === 'user' ? 'ml-auto bg-[#F5F7FA]' : 'mr-auto bg-white',
                ].join(' ')}
              >
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
              </div>
            ))
          )}
        </div>

        <div className="shrink-0 border-t border-zinc-100 p-3 bg-white">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Consultar I+D Marbella…"
              className="flex-1 min-h-[48px] max-h-28 resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-zinc-200"
              disabled={isSending}
            />
            <button
              type="button"
              onClick={() => void sendMessage()}
              disabled={isSending || !input.trim()}
              className="h-12 px-4 rounded-2xl bg-[#36606F] text-white text-[11px] font-black tracking-[0.18em] uppercase shadow-sm border border-zinc-100 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] transition"
            >
              {isSending ? 'Enviando' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}