import { useEffect, useRef, useState } from 'react';

export type VoiceRecorderStatus = 'idle' | 'recording' | 'error';

export function useVoiceRecorder() {
  const [status, setStatus] = useState<VoiceRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [durationMs, setDurationMs] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startAtRef = useRef<number | null>(null);
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
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
        .find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const mr = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
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
          if (startAt) setDurationMs(Date.now() - startAt);
        }, 200);
      };
      mr.onerror = () => {
        setError('Error interno del grabador.');
        setStatus('error');
      };

      mr.start();
    } catch (error: unknown) {
      const e = error instanceof Error ? error : null;
      const msg = e?.name === 'NotAllowedError'
        ? 'Permiso de micrófono denegado.'
        : e?.message || 'Error solicitando micrófono.';
      setError(msg);
      setStatus('error');
      stopTracks();
      throw new Error(msg);
    }
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

        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
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
    setStatus('idle');
  }

  return {
    status,
    error,
    durationMs,
    startRecording,
    stopRecording,
    cancelRecording,
  };
}

