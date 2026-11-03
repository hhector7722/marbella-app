import { useEffect, useRef, useState } from 'react';

export type VoiceRecorderStatus = 'idle' | 'recording' | 'paused' | 'error';

export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startAtRef = useRef<number | null>(null);
  const pauseAtRef = useRef<number | null>(null);
  const pausedMsRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {}
      clearTimer();
      stopTracks();
      mediaRecorderRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  async function startRecording() {
    setError(null);
    setDurationMs(0);
    pauseAtRef.current = null;
    pausedMsRef.current = 0;

    if (typeof window === 'undefined') return;
    if (!navigator.mediaDevices || typeof window.MediaRecorder === 'undefined') {
      const message = 'Este navegador no soporta grabación de audio (MediaRecorder).';
      setError(message);
      setStatus('error');
      throw new Error(message);
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // iOS Safari suele admitir MP4/AAC, no WebM. Elegir el contenedor
      // realmente soportado evita grabaciones silenciosas en iPhone.
      const supportedMime = [
        'audio/webm;codecs=opus',
        'audio/mp4',
        'audio/webm',
        'audio/mp4;codecs=mp4a.40.2',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const mr = new MediaRecorder(stream, supportedMime ? { mimeType: supportedMime } : undefined);
      mediaRecorderRef.current = mr;
      chunksRef.current = [];

      mr.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstart = () => {
        startAtRef.current = Date.now();
        setStatus('recording');
        clearTimer();
        timerRef.current = window.setInterval(() => {
          const startAt = startAtRef.current;
          if (startAt) {
            const now = pauseAtRef.current ?? Date.now();
            setDurationMs(Math.max(0, now - startAt - pausedMsRef.current));
          }
        }, 200);
      };
      mr.onpause = () => {
        pauseAtRef.current = Date.now();
        setStatus('paused');
      };
      mr.onresume = () => {
        if (pauseAtRef.current !== null) pausedMsRef.current += Date.now() - pauseAtRef.current;
        pauseAtRef.current = null;
        setStatus('recording');
      };
      mr.onerror = () => {
        setError('Error interno del grabador.');
        setStatus('error');
      };

      mr.start();
    } catch (e: unknown) {
      const msg =
        e instanceof Error && e.name === 'NotAllowedError'
          ? 'Permiso de micrófono denegado.'
          : e instanceof Error ? e.message : 'Error solicitando micrófono.';
      setError(msg);
      setStatus('error');
      stopTracks();
      throw new Error(msg);
    }
  }

  function pauseRecording() {
    const mr = mediaRecorderRef.current;
    if (mr?.state === 'recording') mr.pause();
  }

  function resumeRecording() {
    const mr = mediaRecorderRef.current;
    if (mr?.state === 'paused') mr.resume();
  }

  function stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      const mr = mediaRecorderRef.current;
      if (!mr) {
        resolve(null);
        return;
      }

      mr.onstop = () => {
        clearTimer();
        setDurationMs(0);
        pauseAtRef.current = null;
        pausedMsRef.current = 0;

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/mp4' });
        chunksRef.current = [];
        mediaRecorderRef.current = null;
        stopTracks();
        setStatus('idle');
        resolve(blob);
      };

      try {
        mr.stop();
      } catch {
        clearTimer();
        stopTracks();
        mediaRecorderRef.current = null;
        chunksRef.current = [];
        setStatus('idle');
        resolve(null);
      }
    });
  }

  function cancelRecording() {
    try {
      mediaRecorderRef.current?.stop();
    } catch {}
    clearTimer();
    stopTracks();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    setDurationMs(0);
    pauseAtRef.current = null;
    pausedMsRef.current = 0;
    setStatus('idle');
  }

  return {
    status,
    error,
    durationMs,
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    cancelRecording,
    getStream: () => streamRef.current,
  };
}

