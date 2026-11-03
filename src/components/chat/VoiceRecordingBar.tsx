"use client";

import { useEffect, useState } from 'react';
import { Pause, Play, Send, Trash2 } from 'lucide-react';

const WAVE_BARS = 14;

function Waveform({ stream, paused }: { stream: MediaStream | null; paused: boolean }) {
  const [levels, setLevels] = useState<number[]>(Array(WAVE_BARS).fill(5));

  useEffect(() => {
    if (!stream || paused) return;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    const frequencies = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last > 85) {
        analyser.getByteFrequencyData(frequencies);
        const next = Array.from({ length: WAVE_BARS }, (_, i) => {
          const start = Math.floor((i * frequencies.length) / WAVE_BARS);
          const end = Math.floor(((i + 1) * frequencies.length) / WAVE_BARS);
          let peak = 0;
          for (let j = start; j < end; j++) peak = Math.max(peak, frequencies[j]);
          return Math.max(5, Math.min(27, 5 + peak * 0.18));
        });
        setLevels(next);
        last = now;
      }
      frame = requestAnimationFrame(tick);
    };
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream, paused]);

  return (
    <div aria-hidden="true" className="flex h-8 min-w-0 flex-1 items-center justify-center gap-[3px] overflow-hidden">
      {levels.map((height, i) => (
        <span key={i} className="w-[3px] shrink-0 rounded-full bg-sky-300 transition-[height] duration-75"
          style={{ height: paused ? 5 : height, opacity: paused ? 0.35 : 0.9 }} />
      ))}
    </div>
  );
}

export default function VoiceRecordingBar({
  stream, paused, durationMs, onCancel, onTogglePause, onSend, disabled,
}: {
  stream: MediaStream | null;
  paused: boolean;
  durationMs: number;
  onCancel: () => void;
  onTogglePause: () => void;
  onSend: () => void;
  disabled: boolean;
}) {
  const seconds = Math.floor(durationMs / 1000);
  const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div role="group" aria-label="Grabadora de mensaje de voz"
      className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-rose-400/35 bg-[#192b52] px-2 text-slate-100">
      <span className={`h-2 w-2 shrink-0 rounded-full bg-rose-400 ${paused ? '' : 'animate-pulse'}`} />
      <div className="flex shrink-0 flex-col">
        <span className="text-[10px] font-semibold leading-3 text-rose-300">{paused ? 'En pausa' : 'Grabando'}</span>
        <span className="font-mono text-xs tabular-nums">{clock}</span>
      </div>
      <Waveform stream={stream} paused={paused} />
      <button type="button" onClick={onCancel} disabled={disabled}
        aria-label="Eliminar grabación" title="Eliminar grabación"
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-rose-400 hover:bg-rose-400/15 disabled:opacity-50">
        <Trash2 size={18}/>
      </button>
      <button type="button" onClick={onTogglePause} disabled={disabled}
        aria-label={paused ? 'Reanudar grabación' : 'Pausar grabación'}
        title={paused ? 'Reanudar' : 'Pausar'}
        className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-sky-100 hover:bg-white/10 disabled:opacity-50">
        {paused ? <Play size={18}/> : <Pause size={18}/>}
      </button>
      <button type="button" onClick={onSend} disabled={disabled}
        aria-label="Enviar mensaje de voz" title="Enviar mensaje de voz"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50">
        <Send size={17}/>
      </button>
    </div>
  );
}
