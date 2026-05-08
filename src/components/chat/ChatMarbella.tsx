"use client";
import { useMemo, useRef, useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Mic, Send, MessageSquareText, Phone } from 'lucide-react';
import Image from 'next/image';
import { useAIStore } from '@/store/aiStore';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { cn } from '@/lib/utils';

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
  const [activeTab, setActiveTab] = useState<'text' | 'voice'>('text');

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe"
      onClick={closeChat}
    >
      <div 
        className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[75vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#3F5E7A] p-4 flex flex-col gap-3 shrink-0 text-white relative">
          <div className="flex justify-between items-center relative z-10">
            <div className="relative w-8 h-8 md:w-9 md:h-9 shrink-0">
              <Image src="/icons/logo-white.png" alt="Logo" fill className="object-contain" priority />
            </div>
            
            {/* Tabs */}
            <div className="flex bg-black/20 rounded-xl p-1 gap-1 relative">
              <button
                onClick={() => setActiveTab('text')}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", activeTab === 'text' ? "bg-white text-[#3F5E7A] shadow-sm" : "text-white/80 hover:bg-white/10")}
              >
                <MessageSquareText size={14} />
                <span>Escribir</span>
              </button>
              <button
                onClick={() => setActiveTab('voice')}
                className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all", activeTab === 'voice' ? "bg-white text-[#3F5E7A] shadow-sm" : "text-white/80 hover:bg-white/10")}
              >
                <Phone size={14} />
                <span>Llamar</span>
              </button>
            </div>

            <button
              type="button"
              onClick={closeChat}
              className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
              aria-label="Cerrar chat"
            >
              <X className="w-5 h-5" strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {activeTab === 'text' ? <TextChatView /> : <VoiceCallView />}
      </div>
    </div>
  );
}

function TextChatView() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  sessionRef.current = sessionId;
  
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

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

  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport,
    onError: (err: Error) => {
      toast.error(`Error del copiloto: ${err.message}`);
    },
  });

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status]);

  // STT setup
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => (prev ? prev + ' ' + transcript : transcript));
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        toast.error('Error de micrófono: ' + event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleListen = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (e) {
        // usually already started
      }
    }
  };

  const busy = status !== 'ready' && status !== 'error';
  const canSend = input.trim().length > 0 && !busy;

  const handleSend = () => {
    const val = input.trim();
    if (!val || busy) return;
    sendMessage({ text: val }, { body: { sessionId: sessionRef.current ?? null } });
    setInput('');
  };

  const resetChat = () => {
    setSessionId(null);
    setMessages([]);
    setInput('');
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">


      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-[#f8f9fb]">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-3">
            <p className="text-sm">¿En que puedo ayudarte crack?</p>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("max-w-[90%] px-4 py-3 text-[13px] leading-relaxed shadow-sm", m.role === 'user' ? 'ml-auto bg-[#36606F] text-white rounded-2xl rounded-tr-sm' : 'mr-auto bg-white border border-zinc-100 text-zinc-800 rounded-2xl rounded-tl-sm')}
          >
            <div className="whitespace-pre-wrap break-words">{messageCombinedText(m.parts)}</div>
          </div>
        ))}
        {busy && (
          <div className="mr-auto bg-white border border-zinc-100 text-zinc-400 px-4 py-3 rounded-2xl rounded-tl-sm text-[13px] animate-pulse">
            Escribiendo...
          </div>
        )}
        {error && (
          <div className="mx-auto bg-red-50 text-red-600 px-4 py-2 rounded-2xl text-xs border border-red-100">
            Error de conexión.
          </div>
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
                handleSend();
              }
            }}
            placeholder="Escribe tu mensaje..."
            className="flex-1 min-h-[48px] max-h-24 resize-none rounded-2xl border border-zinc-200 px-4 py-3 text-[13px] outline-none focus:ring-2 focus:ring-[#36606F]/30"
            disabled={busy}
          />
          {recognitionRef.current && (
            <button
              type="button"
              onClick={toggleListen}
              className={cn("h-12 w-12 flex items-center justify-center rounded-2xl shrink-0 transition-colors", isListening ? "bg-red-100 text-red-600" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200")}
              title="Dictar por voz"
            >
              <Mic size={20} className={isListening ? "animate-pulse" : ""} />
            </button>
          )}
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="h-12 w-12 rounded-2xl bg-[#36606F] hover:bg-[#2a4d5a] text-white flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors shadow-sm"
          >
            <Send size={18} className="ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

type TranscriptEvent = { role: 'user' | 'assistant'; text: string };

function VoiceCallView() {
  const [isActive, setIsActive] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEvent[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
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
    setIsActive(true);
    setTranscripts([]);

    try {
      const tokenReq = await fetch('/api/copiloto/voice/token');

      if (!tokenReq.ok) {
        let msg = 'No se pudo obtener autorización.';
        try {
          const j = await tokenReq.json();
          if (typeof j?.error === 'string') msg = j.error;
        } catch {}
        throw new Error(msg);
      }

      const { client_secret: clientSecret } = await tokenReq.json();

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      const audioEl = document.createElement('audio');
      audioEl.autoplay = true;
      audioElRef.current = audioEl;
      pc.ontrack = (evt) => {
        audioEl.srcObject = evt.streams[0];
      };

      const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = ms;
      ms.getTracks().forEach((track) => pc.addTrack(track, ms));

      const dc = pc.createDataChannel('oai-events');
      dcRef.current = dc;

      dc.addEventListener('message', (e) => {
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
        } catch {}
      });

      dc.addEventListener('error', () => {
        toast.error('Error en el canal de datos de voz.');
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(
        'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
        {
          method: 'POST',
          body: offer.sdp,
          headers: {
            Authorization: `Bearer ${clientSecret}`,
            'Content-Type': 'application/sdp',
          },
        }
      );

      if (!sdpResponse.ok) throw new Error('Fallo en la negociación SDP.');

      const answerSdp = await sdpResponse.text();
      await pc.setRemoteDescription({
        type: 'answer',
        sdp: answerSdp,
      });
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
    dcRef.current = null;
    pcRef.current = null;
    localStreamRef.current = null;
    audioElRef.current = null;
  }

  return (
    <div className="flex-1 flex flex-col bg-[#f8f9fb]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {transcripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-zinc-400 space-y-5">
            <div className={cn("w-24 h-24 rounded-full flex items-center justify-center shadow-sm", isActive ? "bg-emerald-100 text-emerald-600 animate-pulse" : "bg-white text-zinc-300 border border-zinc-100")}>
              <Mic size={40} />
            </div>
            <p className="text-sm text-center px-6 max-w-[250px] leading-relaxed">
              {isActive ? 'Escuchando... Puedes hablar con naturalidad.' : 'Inicia la llamada para conversar por voz con tu copiloto.'}
            </p>
          </div>
        ) : (
          transcripts.map((t, i) => (
            <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={cn("inline-block px-4 py-3 rounded-2xl text-[13px] max-w-[85%] break-words shadow-sm text-left leading-relaxed", t.role === 'user' ? "bg-blue-50 text-blue-900 border border-blue-100 rounded-tr-sm" : "bg-white border border-zinc-100 text-zinc-800 rounded-tl-sm")}>
                <span className="block text-[10px] uppercase tracking-wider opacity-50 mb-1.5 font-bold">
                  {t.role === 'user' ? 'Tú' : 'Copiloto'}
                </span>
                {t.text}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="shrink-0 p-4 bg-white border-t border-zinc-100 flex justify-center">
        {isActive ? (
          <button
            onClick={stopCall}
            className="bg-red-50 text-red-600 border border-red-200 font-bold px-8 h-12 rounded-2xl hover:bg-red-100 transition-colors shadow-sm flex items-center gap-2 text-sm tracking-wide"
          >
            <Phone size={18} className="rotate-[135deg]" />
            Finalizar Llamada
          </button>
        ) : (
          <button
            onClick={startCall}
            className="bg-emerald-600 text-white font-bold px-8 h-12 rounded-2xl hover:bg-emerald-700 transition-colors shadow-sm flex items-center gap-2 text-sm tracking-wide"
          >
            <Phone size={18} />
            Iniciar Llamada
          </button>
        )}
      </div>
    </div>
  );
}