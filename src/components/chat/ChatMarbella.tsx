"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Mic, Phone, Plus, Send, FileText, Image as ImageIcon, X } from 'lucide-react';
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
import VoiceRecordingBar from '@/components/chat/VoiceRecordingBar';
import WeekendNoteApproval, { weekendNoteFromToolPart } from '@/components/chat/WeekendNoteApproval';
import { prepareChatImage, readLargeChatPdfInBrowser } from '@/lib/copilot/browser-attachment';

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
  const [selectedImagePreview, setSelectedImagePreview] = useState<string | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const changeSelectedFile = useCallback((file: File | null) => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    const url = file?.type.startsWith('image/') ? URL.createObjectURL(file) : null;
    previewUrlRef.current = url;
    setSelectedImagePreview(url);
    setSelectedFile(file);
  }, []);

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileContextRef = useRef('');
  // URL temporal local: no se envía el binario de la miniatura al chat.
  const imagePreviewUrlsRef = useRef<string[]>([]);
  useEffect(() => () => {
    for (const url of imagePreviewUrlsRef.current) URL.revokeObjectURL(url);
    imagePreviewUrlsRef.current = [];
  }, []);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micStarting, setMicStarting] = useState(false);
  const micStartingRef = useRef(false);
  const micStoppingRef = useRef(false);
  const activeRecordingRef = useRef(false);
  const suppressMicClickRef = useRef(false);
  const holdRef = useRef<{
    pointerId: number;
    timer: number | null;
    released: boolean;
    cancelled: boolean;
    started: boolean;
    finalized: boolean;
    onRelease: (() => void) | null;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { status: voiceStatus, durationMs, startRecording, stopRecording, pauseRecording,
    resumeRecording, cancelRecording, getStream } = useVoiceRecorder();
  const isVoiceActive = voiceStatus === 'recording' || voiceStatus === 'paused';

  useEffect(() => beginSessionLifetime(), []);

  const fetchWithSession = useCallback(
    async (url: RequestInfo | URL, opts?: RequestInit) => {
      const generation = getActiveSessionGeneration();
      let mergedBody: BodyInit | null | undefined = opts?.body;
      if (typeof opts?.body === 'string') {
        try {
          const j = JSON.parse(opts.body) as Record<string, unknown>;
          const supplierName = window.location.pathname === '/orders/new'
            ? new URLSearchParams(window.location.search).get('supplier')?.trim()
            : null;
          mergedBody = JSON.stringify({
            ...j,
            sessionId: getActiveSessionId(),
            pageContext: supplierName
              ? { kind: 'supplier_draft', supplier: supplierName.slice(0, 120) }
              : null,
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
    onError: () => {
      toast.error('No se ha podido obtener respuesta del servicio de IA.');
    },
  });

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const handleTranscription = async (audioBlob: Blob) => {
    if (!audioBlob || audioBlob.size < 500) {
      toast.info('Graba un mensaje de voz un poco más largo.');
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

  // Toque corto: grabación manual. Pulsación larga: grabar hasta soltar.
  const startVoiceNote = async (): Promise<boolean> => {
    if (micStartingRef.current || isVoiceActive || isTranscribing || micStoppingRef.current) return false;
    micStartingRef.current = true;
    setMicStarting(true);
    try {
      await startRecording();
      activeRecordingRef.current = true;
      return true;
    } catch (cause) {
      toast.error('Error de micrófono: ' + (cause instanceof Error ? cause.message : String(cause)));
      return false;
    } finally {
      micStartingRef.current = false;
      setMicStarting(false);
    }
  };

  const sendVoiceNote = async () => {
    if (micStoppingRef.current || (!isVoiceActive && !activeRecordingRef.current)) return;
    micStoppingRef.current = true;
    activeRecordingRef.current = false;
    try {
      const audioBlob = await stopRecording();
      if (audioBlob) await handleTranscription(audioBlob);
    } finally {
      micStoppingRef.current = false;
    }
  };

  // Los eventos se escuchan en window: el botón desaparece al iniciar la
  // grabación y un onPointerUp en el propio botón no llegaría a ejecutarse.
  useEffect(() => {
    const finishHold = (event: PointerEvent, cancelled: boolean) => {
      const hold = holdRef.current;
      if (!hold || hold.pointerId !== event.pointerId) return;
      hold.released = true;
      hold.cancelled = cancelled;
      if (hold.timer !== null) {
        window.clearTimeout(hold.timer);
        holdRef.current = null; // Toque corto: onClick conserva el flujo manual.
      } else {
        hold.onRelease?.(); // En una pulsación larga ya iniciada, finalizar aquí.
      }
    };
    const release = (event: PointerEvent) => finishHold(event, false);
    const cancel = (event: PointerEvent) => finishHold(event, true);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', cancel);
      if (holdRef.current?.timer != null) window.clearTimeout(holdRef.current.timer);
      holdRef.current = null;
    };
  }, []);

  const handleMicPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || micStartingRef.current || isVoiceActive || busy) return;
    suppressMicClickRef.current = false;
    const previous = holdRef.current;
    if (previous?.timer != null) window.clearTimeout(previous.timer);
    const hold = {
      pointerId: event.pointerId,
      timer: null as number | null,
      released: false,
      cancelled: false,
      started: false,
      finalized: false,
      onRelease: null as (() => void) | null,
    };
    hold.onRelease = () => {
      if (!hold.released || !hold.started || hold.finalized) return;
      hold.finalized = true;
      if (hold.cancelled) {
        activeRecordingRef.current = false;
        cancelRecording();
      } else {
        void sendVoiceNote();
      }
      if (holdRef.current === hold) holdRef.current = null;
    };
    holdRef.current = hold;
    hold.timer = window.setTimeout(async () => {
      hold.timer = null;
      suppressMicClickRef.current = true;
      hold.started = await startVoiceNote();
      if (!hold.started && holdRef.current === hold) holdRef.current = null;
      else hold.onRelease?.(); // Cubrir el permiso de micro concedido después de soltar.
    }, 320);
  };

  const busy = (status !== 'ready' && status !== 'error') || uploadingFile || isTranscribing;
  const handleSend = async () => {
    const value = input.trim();
    if ((!value && !selectedFile) || busy) return;
    let context = fileContextRef.current;
    let fileLabel = '';
    let imagePreviewFile: File | null = null;
    if (selectedFile) {
      setUploadingFile(true);
      const toastId = toast.loading(`Analizando ${selectedFile.name}…`);
      try {
        let data: {error?:string;name?:string;kind?:string;content?:string;pages?:number;truncated?:boolean};
        if(/\.pdf$/i.test(selectedFile.name) && selectedFile.size>3_800_000){
          // Evita 413 en Vercel: sólo sube al chat el texto del PDF local.
          const extracted=await readLargeChatPdfInBrowser(selectedFile);
          data={name:selectedFile.name,kind:'pdf',pages:extracted.pages,content:extracted.content,truncated:extracted.truncated};
        }else{
          // Las fotos del iPhone suelen pesar >4,5MB. Convertir/limitar a JPG.
          const upload=selectedFile.type.startsWith('image/')
            ? await prepareChatImage(selectedFile) : selectedFile;
          if(upload.type.startsWith('image/')) imagePreviewFile=upload;
          const fd=new FormData();
          fd.append('file',upload);
          const response=await fetch('/api/copiloto/attachments',{
            method:'POST',body:fd,credentials:'same-origin',
          });
          data=await response.json() as typeof data;
          if(!response.ok)throw new Error(data.error||'No se pudo adjuntar el archivo.');
        }
        if(!data.content)throw new Error(data.error||'No se pudo interpretar el adjunto.');
        context = `Archivo temporal adjunto: ${data.name} (${data.kind}${data.pages?`, ${data.pages} páginas`:''}).\n${data.content}`;
        fileContextRef.current=context;
        if(data.kind!=='image') fileLabel=`📎 ${data.name}${data.truncated?' (texto abreviado)':''}`;
        changeSelectedFile(null);
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
    const previewUrl=imagePreviewFile ? URL.createObjectURL(imagePreviewFile) : null;
    if(previewUrl) imagePreviewUrlsRef.current.push(previewUrl);
    void sendMessage({
      text:visibleText,
      ...(previewUrl ? {metadata:{imagePreviewUrl:previewUrl}} : {}),
    }, {body:{sessionId:getActiveSessionId(),attachmentContext:context}});
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
    changeSelectedFile(file);
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
            {m.role === 'user' && typeof (m.metadata as {imagePreviewUrl?:unknown}|undefined)?.imagePreviewUrl === 'string'
              && (m.metadata as {imagePreviewUrl:string}).imagePreviewUrl.startsWith('blob:') && (
                <Image
                  unoptimized
                  src={(m.metadata as {imagePreviewUrl:string}).imagePreviewUrl}
                  alt="Imagen adjunta"
                  width={112}
                  height={112}
                  className="mb-2 h-28 w-28 rounded-lg object-cover"
                />
              )}
            <div className="whitespace-pre-wrap break-words">{
              m.role === 'assistant'
                ? messageCombinedText(m.parts).replace(/\*\*(.*?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
                : messageCombinedText(m.parts)
            }</div>
            {m.role === 'assistant' && (m.parts ?? []).map((part, index) => {
              const proposal = weekendNoteFromToolPart(part);
              return proposal ? <WeekendNoteApproval key={index} proposal={proposal} /> : null;
            })}
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
            No se ha podido obtener una respuesta del asistente. No necesariamente es un problema de Internet.
          </div>
        )}
      </div>

      {/* Input bar — no top border */}
      <div data-element="chat-composer" className="box-border w-full min-w-0 shrink-0 bg-[var(--color-envolvente-bajo)] px-2 pb-3 pt-2">
        {selectedFile && (
          <div className="mb-2 flex min-w-0 items-start">
            {selectedImagePreview ? (
              <div className="relative mr-2">
                <Image src={selectedImagePreview} alt={selectedFile.name}
                  width={72} height={72} unoptimized
                  className="h-[72px] w-[72px] rounded-lg border border-white/15 object-cover" />
                <button type="button" aria-label="Quitar imagen adjunta" title="Eliminar imagen"
                  onClick={() => changeSelectedFile(null)}
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white shadow-lg hover:bg-rose-600">
                  <X size={14} strokeWidth={3} />
                </button>
              </div>
            ) : (
              <div className="relative flex max-w-full items-center gap-2 rounded-xl bg-[#192b52] px-3 py-2 text-xs text-sky-100">
                <FileText size={16} className="shrink-0 text-sky-300" />
                <span className="truncate">{selectedFile.name}</span>
                <button type="button" aria-label="Quitar adjunto" title="Eliminar adjunto"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600"
                  onClick={() => changeSelectedFile(null)}><X size={13}/></button>
              </div>
            )}
          </div>
        )}
        <div className="flex min-w-0 items-end gap-1.5">
          {isVoiceActive ? (
            <VoiceRecordingBar stream={getStream()} paused={voiceStatus === 'paused'}
              durationMs={durationMs} disabled={isTranscribing}
              onCancel={() => { if (!micStoppingRef.current) { activeRecordingRef.current = false; cancelRecording(); } }}
              onTogglePause={() => {
                if (micStoppingRef.current) return;
                if (voiceStatus === 'paused') resumeRecording(); else pauseRecording();
              }}
              onSend={() => void sendVoiceNote()}/>
          ) : micStarting ? (
            <div role="status" className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-xl bg-[#192b52] text-sm text-sky-100">
              Activando micrófono…
            </div>
          ) : (
          <>
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

          {/* Toque corto: grabadora manual. Mantener pulsado: grabar y enviar al soltar. */}
          <button type="button"
            onPointerDown={handleMicPointerDown}
            onContextMenu={(event) => event.preventDefault()}
            onClick={() => {
              if (suppressMicClickRef.current) {
                suppressMicClickRef.current = false;
                return;
              }
              void startVoiceNote();
            }}
            disabled={isTranscribing || busy}
            className="flex h-10 w-8 shrink-0 touch-none select-none items-center justify-center rounded-xl text-sky-100/75 transition-colors hover:bg-white/10 hover:text-white disabled:opacity-40"
            aria-label="Grabar mensaje de voz" title="Toca para grabar o mantén pulsado y suelta para enviar">
            <Mic size={18} />
          </button>
          </>
          )}

          {/* Llamada más discreta en el extremo derecho. */}
          <button
            type="button"
            onClick={onCallOpen}
            disabled={isVoiceActive || micStarting || isTranscribing}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
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
