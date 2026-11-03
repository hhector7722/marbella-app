'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Volume2 } from 'lucide-react';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';

type Stage = 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';

type VoiceEvent = {
  type?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  transcript?: string;
  error?: { message?: string };
};

const MAX_CALL_SECONDS = 5 * 60;

/**
 * Llamada WebRTC auténtica: entrada de micrófono continua, audio de salida
 * remoto, turnos automáticos e interrupciones del usuario. No MediaRecorder,
 * no envíos de segmentos a Whisper, no speechSynthesis.
 *
 * La sesión necesita aceptación expresa del coste y feature flag en servidor.
 */
export default function VoiceConversation({ onClose }: { onClose: () => void }) {
  const trackStart = useTrackModalApply('chat-voice-call', 'Llamada en tiempo real');
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState('');
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [lastAnswer, setLastAnswer] = useState('');
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    void fetch('/api/copiloto/voice/token', { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as { enabled?: boolean };
        return response.ok && data.enabled === true;
      })
      .then(enabled => { if (mounted) setAvailable(enabled); })
      .catch(() => { if (mounted) setAvailable(false); });
    return () => { mounted = false; };
  }, []);


  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const ongoingRef = useRef(false);
  const startMsRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function cleanup() {
    ongoingRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
    channelRef.current?.close();
    channelRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    mediaRef.current?.getTracks().forEach(track => track.stop());
    mediaRef.current = null;
    sessionIdRef.current = null;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.srcObject = null;
    }
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }

  useEffect(() => () => cleanup(), []);

  function hangup() {
    cleanup();
    onClose();
  }

  async function handleFunctionCall(event: VoiceEvent, channel: RTCDataChannel) {
    if (!ongoingRef.current || !event.call_id || !event.name) return;
    let args: unknown = {};
    try {
      args = JSON.parse(event.arguments || '{}');
    } catch {
      args = {};
    }
    let result: unknown;
    try {
      const response = await fetch('/api/copiloto/voice/tools', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionIdRef.current,
          toolName: event.name,
          args,
        }),
      });
      const data = await response.json() as { result?: unknown; error?: string };
      result = response.ok ? data.result : { error: data.error ?? 'Consulta no disponible' };
    } catch {
      result = { error: 'No se pudo consultar Marbella.' };
    }
    if (!ongoingRef.current || channel.readyState !== 'open') return;
    channel.send(JSON.stringify({
      type: 'conversation.item.create',
      item: { type: 'function_call_output', call_id: event.call_id, output: JSON.stringify(result ?? null) },
    }));
    channel.send(JSON.stringify({ type: 'response.create' }));
  }

  function handleServerEvent(raw: string, channel: RTCDataChannel) {
    let event: VoiceEvent;
    try { event = JSON.parse(raw) as VoiceEvent; } catch { return; }
    if (!ongoingRef.current) return;
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        setStage('listening');
        break;
      case 'response.output_audio.delta':
      case 'output_audio_buffer.started':
        setStage('speaking');
        break;
      case 'response.output_audio_transcript.done':
        if (event.transcript) setLastAnswer(event.transcript.slice(0, 2500));
        break;
      case 'response.done':
        setStage(prev => prev === 'speaking' ? 'listening' : prev);
        break;
      case 'response.function_call_arguments.done':
        void handleFunctionCall(event, channel);
        break;
      case 'error':
        // No mostrar errores internos del proveedor ni secretos al usuario.
        setError('La llamada ha encontrado un problema de comunicación.');
        break;
    }
  }

  async function startCall() {
    if (ongoingRef.current) return;
    trackStart('Iniciar llamada WebRTC');
    ongoingRef.current = true;
    setStage('connecting');
    setError('');
    setLastAnswer('');
    setMuted(false);
    setSeconds(0);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const tokenResponse = await fetch('/api/copiloto/voice/token', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptPaidRealtime: true }),
        signal: abort.signal,
      });
      const token = await tokenResponse.json() as { client_secret?: string; sessionId?: string; error?: string };
      if (!tokenResponse.ok || !token.client_secret || !token.sessionId) {
        throw new Error(token.error || 'No se pudo autorizar la llamada.');
      }
      if (!ongoingRef.current) return;
      sessionIdRef.current = token.sessionId;

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (!ongoingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      mediaRef.current = stream;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      stream.getAudioTracks().forEach(track => pc.addTrack(track, stream));
      pc.ontrack = (event) => {
        if (!ongoingRef.current || !audioRef.current) return;
        audioRef.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
        void audioRef.current.play().catch(() => {
          if (ongoingRef.current) setError('Toca el altavoz para activar el sonido.');
        });
      };
      pc.onconnectionstatechange = () => {
        if (!ongoingRef.current) return;
        if (pc.connectionState === 'connected') setStage('listening');
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setError('Conexión de voz interrumpida.');
          cleanup();
          setStage('error');
        }
      };
      const channel = pc.createDataChannel('oai-events');
      channelRef.current = channel;
      channel.onopen = () => {
        if (!ongoingRef.current) return;
        setStage('listening');
        startMsRef.current = Date.now();
        timerRef.current = setInterval(() => {
          const elapsed = Math.floor((Date.now() - startMsRef.current) / 1000);
          setSeconds(elapsed);
          if (elapsed >= MAX_CALL_SECONDS) {
            cleanup();
            setError('La llamada ha finalizado al alcanzar los 5 minutos de seguridad.');
            setStage('error');
          }
        }, 1000);
      };
      channel.onmessage = (event: MessageEvent<string>) => handleServerEvent(event.data, channel);
      channel.onclose = () => {
        if (ongoingRef.current) {
          cleanup();
          setError('Se ha cerrado la conexión de voz.');
          setStage('error');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answer = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
        signal: abort.signal,
      });
      if (!answer.ok) throw new Error('El servicio de voz no ha aceptado la conexión WebRTC.');
      const sdp = await answer.text();
      if (!ongoingRef.current) return;
      await pc.setRemoteDescription({ type: 'answer', sdp });
    } catch (cause) {
      if (!ongoingRef.current) return;
      const message = cause instanceof Error ? cause.message : 'No se pudo iniciar la llamada.';
      cleanup();
      setError(message);
      setStage('error');
    }
  }

  function toggleMute() {
    const next = !muted;
    mediaRef.current?.getAudioTracks().forEach(track => { track.enabled = !next; });
    setMuted(next);
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[var(--color-envolvente-bajo)] text-white">
      <div className="flex shrink-0 items-center justify-between px-4 py-3">
        <span className="text-sm font-medium">Llamada en tiempo real</span>
        <button type="button" onClick={hangup} aria-label="Cerrar llamada"
          className="rounded-xl p-2 text-white/65 hover:bg-white/10">✕</button>
      </div>
      <audio ref={audioRef} autoPlay playsInline />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-auto px-6 text-center">
        <div className={`flex h-24 w-24 items-center justify-center rounded-full ${stage === 'listening'
          ? 'animate-pulse bg-emerald-500/20 text-emerald-300' : stage === 'speaking'
            ? 'animate-pulse bg-sky-400/20 text-sky-300' : 'bg-white/10 text-sky-100'}`}>
          {stage === 'speaking' ? <Volume2 size={35}/> : muted ? <MicOff size={35}/> : <Mic size={35}/>}
        </div>
        <p className="text-base font-semibold" aria-live="polite">
          {{ idle: 'Llamada preparada', connecting: 'Conectando…',
            listening: muted ? 'Micrófono silenciado' : 'Te escucho',
            speaking: 'Marbella está hablando', error: 'Llamada no disponible' }[stage]}
        </p>
        {(stage === 'listening' || stage === 'speaking') &&
          <span className="font-mono text-sm tabular-nums text-sky-200/85">
            {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
          </span>}
        {lastAnswer && (stage === 'listening' || stage === 'speaking') && (
          <p className="max-h-32 w-full overflow-y-auto rounded-xl bg-[#192b52] px-4 py-3 text-left text-sm leading-relaxed text-slate-200">
            {lastAnswer}
          </p>
        )}
        {error && <p className="max-w-sm text-sm text-rose-300" role="alert">{error}</p>}
        {stage === 'idle' && (
          <div className="max-w-sm space-y-3">
            <p className="text-xs leading-relaxed text-slate-300">
              Conversación de voz continua: puedes hablar sin pulsar para grabar e interrumpir al asistente.
            </p>
            <p className="text-xs leading-relaxed text-amber-200">
              El servicio de voz en tiempo real es de pago y necesita activación en el servidor.
              Al pulsar iniciar, autorizas esta llamada. Límite automático: 5 minutos.
            </p>
            {available === false && (
              <p role="status" className="text-xs leading-relaxed text-sky-200">
                La llamada real aún no está activada en Vercel. No se generará ningún cargo.
              </p>
            )}
            <button type="button" onClick={() => void startCall()}
              disabled={available !== true}
              className="rounded-xl bg-emerald-500 px-6 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">
              {available === null ? 'Comprobando disponibilidad…' : 'Iniciar llamada en tiempo real'}
            </button>
          </div>
        )}
        {stage === 'error' && (
          <button type="button" onClick={() => void startCall()}
            className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium">
            Reintentar conexión
          </button>
        )}
        {(stage === 'listening' || stage === 'speaking') && (
          <button type="button" onClick={toggleMute} aria-label={muted ? 'Activar micrófono' : 'Silenciar micrófono'}
            className="flex items-center gap-2 rounded-xl border border-white/20 px-5 py-2.5 text-sm">
            {muted ? <MicOff size={18}/> : <Mic size={18}/>}
            {muted ? 'Activar micrófono' : 'Silenciar'}
          </button>
        )}
        {stage === 'listening' && error.includes('altavoz') && (
          <button type="button" className="rounded-xl bg-sky-500/20 px-4 py-2 text-sm"
            onClick={() => void audioRef.current?.play()}>Activar altavoz</button>
        )}
      </div>
      <div className="flex shrink-0 justify-center px-4 py-4">
        <button type="button" onClick={hangup}
          className="flex items-center gap-2 rounded-xl bg-rose-500/20 px-5 py-3 text-sm text-rose-200">
          <PhoneOff size={17}/> Colgar
        </button>
      </div>
    </div>
  );
}
