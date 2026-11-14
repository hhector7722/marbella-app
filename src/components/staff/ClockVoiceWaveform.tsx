'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Pause, Play } from 'lucide-react';

const WAVE_BARS = 44;
const SILENCE = Array.from({ length: WAVE_BARS }, () => 0.16);

/** Visualización real de la amplitud de un audio ya grabado. */
function getAudioPeaks(buffer: AudioBuffer): number[] {
  const channel = buffer.getChannelData(0);
  if (!channel.length) return SILENCE;
  const framesPerBar = Math.max(1, Math.ceil(channel.length / WAVE_BARS));
  const amplitudes = Array.from({ length: WAVE_BARS }, (_, index) => {
    const start = index * framesPerBar;
    const end = Math.min(start + framesPerBar, channel.length);
    if (end <= start) return 0;
    const stride = Math.max(1, Math.floor((end - start) / 400));
    let sum = 0;
    let count = 0;
    for (let offset = start; offset < end; offset += stride) {
      const value = channel[offset];
      sum += value * value;
      count++;
    }
    return Math.sqrt(sum / Math.max(1, count));
  });
  const ceiling = Math.max(0.005, ...amplitudes);
  return amplitudes.map((rms) => Math.max(0.14, Math.min(1, Math.sqrt(rms / ceiling))));
}

function WaveBars({ values, progress = 0, live = false }: {
  values: number[];
  progress?: number;
  live?: boolean;
}) {
  return (
    <div aria-hidden="true" className="flex h-10 w-full min-w-0 items-center justify-between gap-[2px]">
      {values.map((amplitude, index) => (
        <span
          key={index}
          className={'block min-w-[2px] flex-1 rounded-full transition-colors ' +
            (live ? 'bg-rose-500' : index / values.length <= progress ? 'bg-sky-400' : 'bg-slate-400/55')}
          style={{ height: `${Math.round(5 + Math.max(0, Math.min(1, amplitude)) * 29)}px` }}
        />
      ))}
    </div>
  );
}

/** Audio sin tarjetas, títulos ni reproductor nativo; permite play/pausa y avanzar por la onda. */
export function ClockVoicePlayer({ src, name }: { src: string; name: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [peaks, setPeaks] = useState<number[]>(SILENCE);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let context: AudioContext | null = null;

    const analyze = async () => {
      try {
        if (typeof AudioContext === 'undefined') return;
        const response = await fetch(src);
        if (!response.ok) return;
        const bytes = await response.arrayBuffer();
        if (cancelled) return;
        context = new AudioContext();
        const decoded = await context.decodeAudioData(bytes);
        if (!cancelled) setPeaks(getAudioPeaks(decoded));
      } catch {
        // Los formatos que el navegador reproduce pero no decodifica conservan
        // el play y una línea discreta de barras; nunca se bloquea el audio.
      } finally {
        if (context) void context.close().catch(() => undefined);
      }
    };

    void analyze();
    const audio = audioRef.current;
    return () => {
      cancelled = true;
      audio?.pause();
    };
  }, [src]);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      await audio.play();
    } catch {
      setPlaying(false);
    }
  };

  const seek = (event: MouseEvent<HTMLButtonElement>) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const fraction = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    audio.currentTime = fraction * audio.duration;
    setProgress(fraction);
  };

  return (
    <div data-element="clock-message-audio-waveform" className="flex min-h-11 w-full max-w-[340px] min-w-0 items-center gap-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(1); }}
        onTimeUpdate={(event) => {
          const audio = event.currentTarget;
          if (Number.isFinite(audio.duration) && audio.duration > 0) {
            setProgress(audio.currentTime / audio.duration);
          }
        }}
        aria-label={name}
        className="hidden"
      />
      <button type="button" onClick={() => void toggle()}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-500/15 text-sky-500 active:bg-sky-500/25"
        aria-label={(playing ? 'Pausar' : 'Reproducir') + ' mensaje de voz'}>
        {playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor"/>}
      </button>
      <button type="button" className="min-w-0 flex-1 touch-pan-x py-1"
        aria-label="Avanzar por el mensaje de voz" onClick={seek}>
        <WaveBars values={peaks} progress={progress} />
      </button>
    </div>
  );
}

/** Forma de onda del micrófono, calculada en tiempo real mientras MediaRecorder graba. */
export function ClockRecordingWaveform({ stream }: { stream: MediaStream }) {
  const [levels, setLevels] = useState<number[]>(SILENCE);

  useEffect(() => {
    if (typeof AudioContext === 'undefined') return;
    let frame = 0;
    let lastSampleAt = 0;
    let cancelled = false;
    let context: AudioContext;
    let source: MediaStreamAudioSourceNode;

    try {
      context = new AudioContext();
      source = context.createMediaStreamSource(stream);
      const analyzer = context.createAnalyser();
      analyzer.fftSize = 1024;
      analyzer.smoothingTimeConstant = 0.65;
      source.connect(analyzer);
      const samples = new Uint8Array(analyzer.fftSize);

      const tick = (now: number) => {
        if (cancelled) return;
        if (now - lastSampleAt >= 45) {
          analyzer.getByteTimeDomainData(samples);
          let sum = 0;
          for (let i = 0; i < samples.length; i++) {
            const value = (samples[i] - 128) / 128;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / samples.length);
          const level = Math.max(0.14, Math.min(1, rms * 9));
          setLevels((previous) => [...previous.slice(1), level]);
          lastSampleAt = now;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
      void context.resume().catch(() => undefined);
    } catch {
      return;
    }
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      source.disconnect();
      void context.close().catch(() => undefined);
    };
  }, [stream]);

  return (
    <div data-element="clock-message-live-waveform"
      role="status" aria-label="Grabando audio; forma de onda del micrófono"
      className="flex w-full max-w-[300px] min-w-[120px] flex-1 items-center gap-2">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red-500"/>
      <WaveBars values={levels} live />
    </div>
  );
}
