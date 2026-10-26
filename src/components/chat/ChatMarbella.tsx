"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Mic, Phone, Plus, Send, FileText, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useAIStore } from '@/store/aiStore';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useChatVisualViewport } from '@/hooks/useChatVisualViewport';
import { useFreezeChatBackground } from '@/hooks/useFreezeChatBackground';
import VoiceConversation from '@/components/chat/VoiceConversation';

// Helper para extraer texto del Vercel AI SDK
function messageCombinedText(parts: unknown): string {
  if (!Array.isArray(parts)) return '';
  let out = '';
  for (const p of parts) {
    if (
      typeof p === 'object' &&
      p !== null &&
      (p as { type?: string }).type === 'text' &&
      typeof (p as { text?: string }).text === 'string'
    ) {
      out += (p as { text: string }).text;
    }
  }
  return out.trim();
}

/**
 * Sesión del copiloto vigente. Vive fuera de React para que el `fetch` del
 * transporte (creado en render) pueda leerla sin tocar refs durante render.
 * Cada montaje abre una "vida" con su propio id de generación: así una respuesta
 * en vuelo que llega tras el desmontaje no contamina al montaje siguiente.
 */
type SessionLifetime = { id: string | null; generation: number };

let currentSession: SessionLifetime = { id: null, generation: 0 };

function beginSessionLifetime(): () => void {
  const lifetime: SessionLifetime = { id: null, generation: currentSession.generation + 1 };
  currentSession = lifetime;
  return () => {
    if (currentSession === lifetime) {
      currentSession = { id: null, generation: lifetime.generation + 1 };
    }
  };
}

function getActiveSessionId(): string | null {
  return currentSession.id;
}

function getActiveSessionGeneration(): number {
  return currentSession.generation;
}

function setActiveSessionIdForGeneration(generation: number, id: string): void {
  if (currentSession.generation !== generation) return;
  currentSession.id = id;
}

export default function ChatMarbella() {
  const isOpen = useAIStore((s) => s.isOpen);
  const closeChat = useAIStore((s) => s.closeChat);
  const [showVoiceCall, setShowVoiceCall] = useState(false);
  useFreezeChatBackground(isOpen);
  useChatVisualViewport(isOpen);

  return (
    <Modal
      open={isOpen}
      onClose={closeChat}
      title={<Image src="/icons/logo-white.png" alt="Bar La Marbella" width={28} height={28} className="object-contain" priority />}
      variant="standard"
      layer="base"
      scheme="dark"
      instance="chat-marbella"
      hideHeaderDivider
      scrollContent={false}
    >
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <TextChatView onCallOpen={() => setShowVoiceCall(true)} />

        {showVoiceCall && (
          <div className="absolute inset-0 z-20 flex flex-col animate-in fade-in duration-200">
            <VoiceConversation onClose={() => setShowVoiceCall(false)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextChatView({ onCallOpen }: { onCallOpen: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const [input, setInput] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileContextRef = useRef('');
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [pressingMic, setPressingMic] = useState(false);
  const micHeldRef = useRef(false);
  const micStartingRef = useRef(false);
  const micReadyRef = useRef(false);
  const micStoppingRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { status: voiceStatus, startRecording, stopRecording } = useVoiceRecorder();
  const isRecording = voiceStatus === 'recording';

  useEffect(() => beginSessionLifetime(), []);

  const fetchWithSession = useCallback(
    async (url: RequestInfo | URL, opts?: RequestInit) => {
      const generation = getActiveSessionGeneration();
      let mergedBody: BodyInit | null | undefined = opts?.body;
      if (typeof opts?.body === 'string') {
        try {
          const j = JSON.parse(opts.body) as Record<string, unknown>;
          mergedBody = JSON.stringify({
            ...j,
            sessionId: getActiveSessionId(),
          });
        } catch {
          mergedBody = opts.body;
        }
      }
      const res = await fetch(url as RequestInfo, {
        ...opts,
        body: mergedBody,
        credentials: 'same-origin',
      });
      const sid = res.headers.get('X-Session-Id');
      if (sid) setActiveSessionIdForGeneration(generation, sid);
      return res;
    },
    []
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/copiloto',
        fetch: fetchWithSession,
      }),
    [fetchWithSession]
  );

  const { messages, sendMessage, status, error } = useChat({
    transport,
    onError: (err: Error) => {
      toast.error(`Error: ${err.message}`);
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const handleTranscription = async (audioBlob: Blob) => {
    if (!audioBlob || audioBlob.size < 500) {
      toast.info('Mantén pulsado el micrófono un momento para dictar.');
      return;
    }
    setIsTranscribing(true);
    const toastId = toast.loading('Transcribiendo...');
    try {
      const formData = new FormData();
      const extension = /mp4|m4a|aac/i.test(audioBlob.type) ? 'mp4' : 'webm';
      formData.append('file', audioBlob, `audio.${extension}`);
      const res = await fetch('/api/copiloto/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok || !data.text) throw new Error(data.error || 'No se pudo transcribir el audio');
      if (!input.trim() && !selectedFile && status === 'ready') {
        void sendMessage({text:data.text.trim()}, {
          body:{sessionId:getActiveSessionId(),attachmentContext:fileContextRef.current},
        });
        toast.success('Audio transcrito y enviado', { id: toastId });
      } else {
        setInput((prev) => (prev ? prev + ' ' + data.text : data.text));
        toast.success('Audio añadido a tu mensaje', { id: toastId });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Error: ' + msg, { id: toastId });
    } finally {
      setIsTranscribing(false);
    }
  };

  // Push-to-talk: mismo micrófono pequeño para iniciar y terminar la captura.
  // Si la persona suelta durante el diálogo de permiso, paramos tan pronto
  // como el grabador quede preparado; no dejamos el micrófono abierto.
  const stopMicAndTranscribe = async () => {
    if (micStoppingRef.current || !micReadyRef.current) return;
    micStoppingRef.current = true;
    micReadyRef.current = false;
    try {
      const audioBlob = await stopRecording();
      if (audioBlob) await handleTranscription(audioBlob);
    } finally {
      micStoppingRef.current = false;
    }
  };

  const startMicOnHold = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || micStartingRef.current || micReadyRef.current || micStoppingRef.current || isTranscribing) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    micHeldRef.current = true;
    micStartingRef.current = true;
    setPressingMic(true);
    void startRecording().then(() => {
      micReadyRef.current = true;
      if (!micHeldRef.current) void stopMicAndTranscribe();
    }).catch((err: unknown) => {
      toast.error('Error de micrófono: ' + (err instanceof Error ? err.message : String(err)));
    }).finally(() => {
      micStartingRef.current = false;
      if (!micHeldRef.current && micReadyRef.current) void stopMicAndTranscribe();
    });
  };

  const releaseMic = () => {
    if (!micHeldRef.current) return;
    micHeldRef.current = false;
    setPressingMic(false);
    if (micReadyRef.current) void stopMicAndTranscribe();
  };

  const busy = (status !== 'ready' && status !== 'error') || uploadingFile;
  const handleSend = async () => {
    const value = input.trim();
    if ((!value && !selectedFile) || busy) return;
    let context = fileContextRef.current;
    let fileLabel = '';
    if (selectedFile) {
      setUploadingFile(true);
      const toastId = toast.loading(`Analizando ${selectedFile.name}…`);
      try {
        const fd = new FormData();
        fd.append('file', selectedFile);
        const response = await fetch('/api/copiloto/attachments', {
          method:'POST',body:fd,credentials:'same-origin',
        });
        const data = await response.json() as {error?:string;name?:string;kind?:string;content?:string;pages?:number;truncated?:boolean};
        if(!response.ok || !data.content)throw new Error(data.error||'No se pudo adjuntar el archivo.');
        context = `Archivo temporal adjunto: ${data.name} (${data.kind}${data.pages?`, ${data.pages} páginas`:''}).\n${data.content}`;
        fileContextRef.current=context;
        fileLabel=`📎 ${data.name}${data.truncated?' (texto abreviado)':''}`;
        setSelectedFile(null);
        toast.success('Archivo analizado y añadido a la consulta.',{id:toastId});
      } catch (cause) {
        toast.error(cause instanceof Error?cause.message:'Error al adjuntar el archivo.',{id:toastId});
        return;
      } finally {
        setUploadingFile(false);
      }
    }
    const visibleText=[value || (selectedFile?'Analiza el archivo adjunto.':''),fileLabel].filter(Boolean).join('\n');
    if(!visibleText)return;
    void sendMessage({text:visibleText}, {body:{sessionId:getActiveSessionId(),attachmentContext:context}});
    setInput('');
  };

  const handleFileAttach = (event:React.ChangeEvent<HTMLInputElement>)=>{
    const file=event.target.files?.[0];
    event.target.value='';
    setShowAttachMenu(false);
    if(!file)return;
    if(!(/\.pdf$/i.test(file.name)||file.type.startsWith('image/'))){
      toast.error('Selecciona una imagen o PDF válido.');return;
    }
    if(file.size>(/\.pdf$/i.test(file.name)?20:10)*1024*1024){
      toast.error('Archivo demasiado grande (PDF 20 MB, imagen 10 MB).');return;
    }
    setSelectedFile(file);
  };

  return (
    <div data-element="chat-view" className="flex h-full w-full min-h-0 min-w-0 flex-1 flex-col bg-[var(--color-envolvente-bajo)] text-white">
      {/* Messages */}
      <div ref={scrollRef} data-element="chat-messages" className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-4 sm:px-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <span className="text-sm font-semibold tracking-wide text-white/90">¿Qué necesitas crack?</span>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[88%] rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed shadow-[0_6px_18px_rgba(3,12,30,0.16)]",
              m.role === 'user'
                ? 'ml-auto rounded-tr-sm border-sky-300/20 bg-[#315a86] text-white'
                : 'mr-auto rounded-tl-sm border-white/15 bg-[#192b52] text-slate-100'
            )}
          >
            <div className="whitespace-pre-wrap break-words">{
              m.role === 'assistant'
                ? messageCombinedText(m.parts).replace(/\*\*(.*?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
                : messageCombinedText(m.parts)
            }</div>
          </div>
        ))}

        {busy && (
          <div className="mr-auto rounded-xl rounded-tl-sm border border-white/15 bg-[#192b52] px-4 py-2.5 text-sm text-sky-200/65">
            <span className="inline-flex gap-1">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
            </span>
          </div>
        )}
        {error && (
          <div className="mx-auto rounded-xl border border-rose-400/30 bg-rose-950/60 px-4 py-2 text-xs text-rose-200">
            Error de conexión.
          </div>
        )}
      </div>

      {/* Input bar — no top border */}
      <div data-element="chat-composer" className="box-border w-full min-w-0 shrink-0 bg-[var(--color-envolvente-bajo)] px-2 pb-3 pt-2">
        {selectedFile && (
          <div className="mb-1.5 flex min-w-0 items-center justify-between gap-2 rounded-xl bg-[#192b52] px-3 py-2 text-xs text-sky-100">
            <span className="min-w-0 truncate">📎 {selectedFile.name}</span>
            <button type="button" aria-label="Quitar adjunto" className="shrink-0 text-white/70" onClick={()=>setSelectedFile(null)}>✕</button>
          </div>
        )}
        <div className="flex min-w-0 items-end gap-1.5">
          {/* + button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAttachMenu((v) => !v)}
              className="flex h-10 w-7 items-center justify-start rounded-xl text-sky-200/80 transition-all hover:text-white active:scale-95"
              title="Adjuntar archivo"
            >
              <Plus size={21} />
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-14 left-0 z-10 min-w-[160px] overflow-hidden rounded-xl border border-white/20 bg-[#192b52] shadow-[0_14px_40px_rgba(3,12,30,0.55)]">
                <button
                  onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-slate-100 hover:bg-white/10"
                >
                  <ImageIcon size={16} className="text-sky-300" />
                  Imagen
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                  className="flex w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-sm text-slate-100 hover:bg-white/10"
                >
                  <FileText size={16} className="text-sky-300" />
                  PDF
                </button>
              </div>
            )}
          </div>

          {/* Hidden file inputs */}
          <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileAttach} />
          <input ref={fileInputRef} type="file" accept=".pdf" className="hidden" onChange={handleFileAttach} />

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // No dejar que el editor crezca hasta cortar los mensajes.
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 112)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Escribe tu mensaje"
            rows={1}
            className="min-h-[42px] max-h-28 min-w-0 flex-1 resize-none overflow-y-auto rounded-xl border border-white/20 bg-[#192b52] px-2.5 py-[9px] text-base leading-6 text-white outline-none placeholder:text-[11px] placeholder:tracking-tight placeholder:text-slate-400 focus:border-sky-300/65 focus:ring-2 focus:ring-sky-300/20"
            disabled={busy}
          />

          {/* Enviar con botón o Intro, sin ocultar parte del editor. */}
          <button
            type="button"
            onClick={()=>void handleSend()}
            disabled={busy || (!input.trim() && !selectedFile)}
            className="flex h-10 w-8 shrink-0 items-center justify-center rounded-xl text-sky-300 transition-colors hover:bg-white/10 disabled:text-white/25"
            aria-label="Enviar mensaje"
            title={uploadingFile?'Analizando archivo…':'Enviar mensaje o adjunto'}
          >
            <Send size={18} />
          </button>

          {/* Mantener pulsado para hablar; soltar para transcribir. */}
          <button
            type="button"
            onPointerDown={startMicOnHold}
            onPointerUp={releaseMic}
            onPointerCancel={releaseMic}
            onLostPointerCapture={releaseMic}
            onContextMenu={(e) => e.preventDefault()}
            disabled={isTranscribing}
            className={cn(
              "flex h-10 w-8 shrink-0 touch-none select-none items-center justify-center rounded-xl transition-colors disabled:opacity-40",
              pressingMic || isRecording ? "bg-rose-400/15 text-rose-300" : "text-sky-100/75 hover:bg-white/10 hover:text-white"
            )}
            aria-label="Mantener pulsado para dictar, soltar para transcribir"
            aria-pressed={pressingMic || isRecording}
            title="Mantén pulsado para hablar"
          >
            <Mic size={18} />
          </button>

          {/* Llamada más discreta en el extremo derecho. */}
          <button
            type="button"
            onClick={onCallOpen}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
            aria-label="Iniciar llamada de voz"
            title="Llamada de voz"
          >
            <Phone size={16} />
          </button>
        </div>
      </div>


    </div>
  );
}
