"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Mic, Phone, Plus, FileText, Image as ImageIcon } from 'lucide-react';
import Image from 'next/image';
import { useAIStore } from '@/store/aiStore';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { cn } from '@/lib/utils';
import { Modal } from '@/components/ui/modal';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

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

export default function ChatMarbella() {
  const isOpen = useAIStore((s) => s.isOpen);
  const closeChat = useAIStore((s) => s.closeChat);
  const [showVoiceCall, setShowVoiceCall] = useState(false);

  return (
    <Modal
      open={isOpen}
      onClose={closeChat}
      title="Chat Marbella"
      variant="standard"
      layer="base"
      instance="chat-marbella"
      headerTone="petroleum"
      hideTitle
      scrollContent={false}
      headerTrailing={
        <div className="relative w-8 h-8 shrink-0">
          <Image src="/icons/logo-white.png" alt="Logo" fill className="object-contain" priority />
        </div>
      }
      className="h-[80vh]"
    >
      <div className="relative flex-1 flex flex-col min-h-0">
        <TextChatView onCallOpen={() => setShowVoiceCall(true)} />

        {showVoiceCall && (
          <div className="absolute inset-0 z-20 flex flex-col animate-in fade-in duration-200">
            <VoiceCallView onClose={() => setShowVoiceCall(false)} />
          </div>
        )}
      </div>
    </Modal>
  );
}

function TextChatView({ onCallOpen }: { onCallOpen: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;

  const [input, setInput] = useState('');
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showBigMic, setShowBigMic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRecordingRef = useRef(false);

  const { status: voiceStatus, startRecording, stopRecording } = useVoiceRecorder();
  const isRecording = voiceStatus === 'recording';
  isRecordingRef.current = isRecording;

  const onSessionHeader = useCallback((res: Response) => {
    const sid = res.headers.get('X-Session-Id');
    if (sid) {
      sessionRef.current = sid;
      setSessionId((prev) => prev ?? sid);
    }
    return res;
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/copiloto',
        fetch: async (url, opts) => {
          let mergedBody: BodyInit | null | undefined = opts?.body;
          if (typeof opts?.body === 'string') {
            try {
              const j = JSON.parse(opts.body) as Record<string, unknown>;
              mergedBody = JSON.stringify({
                ...j,
                sessionId: sessionRef.current ?? null,
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
          return onSessionHeader(res);
        },
      }),
    [onSessionHeader]
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
    if (!audioBlob || audioBlob.size < 500) return;
    const toastId = toast.loading('Transcribiendo...');
    try {
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      const res = await fetch('/api/copiloto/transcribe', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.text) {
        setInput((prev) => (prev ? prev + ' ' + data.text : data.text));
        toast.success('Listo', { id: toastId });
        setShowBigMic(false);
        setTimeout(() => textareaRef.current?.focus(), 100);
      } else {
        throw new Error(data.error || 'Sin texto');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error('Error: ' + msg, { id: toastId });
    }
  };

  const busy = status !== 'ready' && status !== 'error';
  const handleSend = useCallback(() => {
    const val = input.trim();
    if (!val || busy) return;
    sendMessage({ text: val }, { body: { sessionId: sessionRef.current ?? null } });
    setInput('');
  }, [input, busy, sendMessage]);

  const handleFileAttach = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    toast.info(`Adjunto "${file.name}" recibido (próximamente compatible)`);
    e.target.value = '';
    setShowAttachMenu(false);
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 bg-white">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-2">
            <p className="text-sm">¿Qué necesitas crack?</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[88%] px-4 py-2.5 text-[13px] leading-relaxed rounded-2xl",
              m.role === 'user'
                ? 'ml-auto bg-[#3F5E7A] text-white rounded-tr-sm shadow-sm'
                : 'mr-auto bg-zinc-100 text-zinc-800 rounded-tl-sm'
            )}
          >
            <div className="whitespace-pre-wrap break-words">{messageCombinedText(m.parts)}</div>
          </div>
        ))}

        {busy && (
          <div className="mr-auto bg-zinc-100 text-zinc-400 px-4 py-2.5 rounded-2xl rounded-tl-sm text-[13px]">
            <span className="inline-flex gap-1">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>·</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>·</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>·</span>
            </span>
          </div>
        )}
        {error && (
          <div className="mx-auto bg-red-50 text-red-600 px-4 py-2 rounded-2xl text-xs border border-red-100">
            Error de conexión.
          </div>
        )}
      </div>

      {/* Input bar — no top border */}
      <div className="shrink-0 px-3 pb-3 pt-2 bg-white">
        <div className="flex items-end gap-2">
          {/* + button */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setShowAttachMenu((v) => !v)}
              className="h-11 w-11 flex items-center justify-center rounded-2xl text-zinc-400 hover:text-zinc-600 active:scale-95 transition-all"
              title="Adjuntar archivo"
            >
              <Plus size={20} />
            </button>
            {showAttachMenu && (
              <div className="absolute bottom-14 left-0 bg-white rounded-2xl shadow-xl border border-zinc-100 overflow-hidden z-10 min-w-[160px]">
                <button
                  onClick={() => { imageInputRef.current?.click(); setShowAttachMenu(false); }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-700 hover:bg-zinc-50 w-full text-left"
                >
                  <ImageIcon size={16} className="text-[#3F5E7A]" />
                  Imagen
                </button>
                <button
                  onClick={() => { fileInputRef.current?.click(); setShowAttachMenu(false); }}
                  className="flex items-center gap-3 px-4 py-3 text-sm text-zinc-700 hover:bg-zinc-50 w-full text-left border-t border-zinc-100"
                >
                  <FileText size={16} className="text-[#3F5E7A]" />
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
              // Auto-expand
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Escribe tu mensaje..."
            rows={1}
            className="flex-1 min-h-[44px] max-h-48 resize-none rounded-2xl border border-zinc-200 px-3 py-[10px] text-[13px] outline-none focus:ring-2 focus:ring-[#3F5E7A]/30 bg-white overflow-hidden"
            disabled={busy}
          />

          {/* Mic button — Opens big mic overlay */}
          <button
            type="button"
            onClick={() => setShowBigMic(true)}
            className="h-11 w-11 flex items-center justify-center rounded-2xl shrink-0 text-zinc-400 hover:text-zinc-600 active:scale-95 transition-all"
            title="Grabar mensaje de voz"
          >
            <Mic size={18} />
          </button>

          {/* Phone button */}
          <button
            type="button"
            onClick={onCallOpen}
            className="h-11 w-11 flex items-center justify-center rounded-2xl shrink-0 bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition-all shadow-sm"
            title="Llamada de voz"
          >
            <Phone size={18} className="text-white" />
          </button>
        </div>
      </div>

      {/* Big Mic Overlay */}
      {showBigMic && (
        <BigMicOverlay 
          onClose={() => setShowBigMic(false)}
          onFinish={handleTranscription}
          isRecording={isRecording}
          startRecording={startRecording}
          stopRecording={stopRecording}
        />
      )}
    </div>
  );
}

function BigMicOverlay({ 
  onClose, onFinish, isRecording, startRecording, stopRecording 
}: { 
  onClose: () => void, 
  onFinish: (blob: Blob) => void,
  isRecording: boolean,
  startRecording: () => Promise<void>,
  stopRecording: () => Promise<Blob | null>
}) {
  const isRecordingRef = useRef(isRecording);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  const toggleRecording = async () => {
    if (isRecordingRef.current) {
      const blob = await stopRecording();
      if (blob) onFinish(blob);
    } else {
      try {
        await startRecording();
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        toast.error('Error de microfono: ' + msg);
      }
    }
  };

  return (
    <div className="absolute inset-0 z-30 bg-white flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 flex items-center justify-center rounded-full bg-zinc-100 text-zinc-500 hover:bg-zinc-200"
      >
        <X size={20} />
      </button>

      <div className="flex flex-col items-center gap-8">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold text-[#3F5E7A]">Mensaje de voz</h3>
          <p className="text-sm text-zinc-400">
            {isRecording ? 'pulsa para detener' : 'pulsa para grabar'}
          </p>
        </div>

        <div className="relative flex items-center justify-center w-64 h-64">
          {/* Animated rings when recording */}
          {isRecording && (
            <>
              <div className="absolute inset-0 bg-red-500/10 rounded-full animate-ping" />
              <div className="absolute inset-4 bg-red-500/20 rounded-full animate-pulse" />
            </>
          )}

          <button
            onClick={toggleRecording}
            className={cn(
              "relative z-10 w-32 h-32 rounded-full flex items-center justify-center transition-all duration-150 select-none shadow-xl",
              isRecording 
                ? "bg-red-500 scale-110 text-white shadow-red-200" 
                : "bg-[#3F5E7A] text-white active:scale-95 shadow-zinc-200"
            )}
          >
            <Mic size={48} strokeWidth={1.5} />
          </button>
        </div>

        <div className={cn(
          "h-6 flex items-center gap-2 transition-opacity",
          isRecording ? "opacity-100" : "opacity-0"
        )}>
          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="text-red-500 text-sm font-medium">Grabando...</span>
        </div>
      </div>
    </div>
  );
}

type TranscriptEvent = { role: 'user' | 'assistant'; text: string };

function VoiceCallView({ onClose }: { onClose: () => void }) {
  const trackVoiceCallStart = useTrackModalApply('chat-voice-call', 'Llamada voz chat');
  const [isActive, setIsActive] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [transcripts]);

  useEffect(() => {
    return () => stopCall();
  }, []);

  async function startCall() {
    trackVoiceCallStart('Iniciar llamada');
    setIsActive(true);
    setTranscripts([]);
    try {
      const tokenReq = await fetch('/api/copiloto/voice/token');
      if (!tokenReq.ok) {
        let msg = 'No se pudo obtener autorización.';
        try { const j = await tokenReq.json(); if (typeof j?.error === 'string') msg = j.error; } catch {}
        throw new Error(msg);
      }

      const { client_secret: clientSecret, session_id: sessionId } = await tokenReq.json();
      sessionIdRef.current = typeof sessionId === 'string' ? sessionId : null;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (evt) => { audioEl.srcObject = evt.streams[0]; };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = ms;
      ms.getTracks().forEach((track) => pc.addTrack(track, ms));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.addEventListener('message', async (e) => {
        try {
          const event = JSON.parse(e.data as string);
          if (event.type === 'response.audio_transcript.done') {
            const tx = typeof event.transcript === 'string' ? event.transcript.trim() : '';
            if (tx) setTranscripts((prev) => [...prev, { role: 'assistant', text: tx }]);
          }
          if (event.type === 'conversation.item.input_audio_transcription.completed') {
            const tx = typeof event.transcript === 'string' ? event.transcript.trim() : '';
            if (tx) setTranscripts((prev) => [...prev, { role: 'user', text: tx }]);
          }
          if (event.type === 'response.function_call_arguments.done') {
            try {
              const { call_id, name, arguments: argsString } = event;
              const args = JSON.parse(argsString);
              const res = await fetch('/api/copiloto/tools', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ toolName: name, args, sessionId: sessionIdRef.current }),
              });
              let data: unknown;
              try {
                data = await res.json();
              } catch {
                data = { error: res.statusText || 'Respuesta de herramienta invalida' };
              }
              const output = res.ok ? data : { error: 'tool_execution_failed', status: res.status, detail: data };
              dcRef.current?.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id, output: JSON.stringify(output) } }));
              dcRef.current?.send(JSON.stringify({ type: 'response.create' }));
            } catch (err) {
              console.error('Error tool voz', err);
              const callId = typeof event.call_id === 'string' ? event.call_id : '';
              if (callId) {
                dcRef.current?.send(JSON.stringify({
                  type: 'conversation.item.create',
                  item: {
                    type: 'function_call_output',
                    call_id: callId,
                    output: JSON.stringify({ error: 'tool_execution_failed', detail: err instanceof Error ? err.message : String(err) }),
                  },
                }));
                dcRef.current?.send(JSON.stringify({ type: 'response.create' }));
              }
            }
          }
        } catch {}
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17', {
        method: 'POST', body: offer.sdp,
        headers: { Authorization: `Bearer ${clientSecret}`, 'Content-Type': 'application/sdp' },
      });
      if (!sdpRes.ok) throw new Error('Fallo en la negociación SDP.');
      const answerSdp = await sdpRes.text();
      await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`No se pudo iniciar la llamada: ${msg}`);
      stopCall();
    }
  }

  function stopCall() {
    setIsActive(false);
    dcRef.current?.close();
    pcRef.current?.close();
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    if (audioElRef.current) audioElRef.current.srcObject = null;
    sessionIdRef.current = null;
    dcRef.current = null; pcRef.current = null; localStreamRef.current = null; audioElRef.current = null;
  }

  return (
    <div className="flex-1 flex flex-col w-full h-full bg-white">
      {/* Voice header */}
      <div className="bg-[#3F5E7A] px-4 py-3 flex items-center justify-between shrink-0 text-white">
        <span className="text-sm font-semibold">Llamada de voz</span>
        <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors">
          <X size={16} strokeWidth={2.5} />
        </button>
      </div>

      {!isActive ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <button
            onClick={startCall}
            className="bg-emerald-500 text-white font-bold px-10 h-14 py-3 rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-200 flex items-center gap-3 text-sm uppercase tracking-wide"
          >
            <Phone size={20} fill="currentColor" />
            Iniciar Llamada
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {transcripts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full space-y-4">
                <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center animate-pulse">
                  <Mic size={28} className="text-emerald-600" />
                </div>
                <p className="text-sm text-zinc-500">Escuchando...</p>
              </div>
            ) : (
              transcripts.map((t, i) => (
                <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                  <span className={cn(
                    "inline-block px-4 py-2.5 rounded-2xl text-[13px] max-w-[85%] break-words leading-relaxed",
                    t.role === 'user' ? "bg-[#3F5E7A] text-white rounded-tr-sm" : "bg-zinc-100 text-zinc-800 rounded-tl-sm"
                  )}>
                    {t.text}
                  </span>
                </div>
              ))
            )}
          </div>
          <div className="shrink-0 p-4 flex justify-center">
            <button
              onClick={stopCall}
              className="bg-red-50 text-red-600 border border-red-200 font-semibold px-8 h-12 rounded-2xl hover:bg-red-100 transition-colors flex items-center gap-2 text-sm"
            >
              <Phone size={16} className="rotate-[135deg]" />
              Finalizar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
