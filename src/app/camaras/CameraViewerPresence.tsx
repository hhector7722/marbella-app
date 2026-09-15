'use client';

import { useEffect, useRef } from 'react';

const HEARTBEAT_MS = 5_000;

export default function CameraViewerPresence() {
  const sessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    const sessionId = crypto.randomUUID();
    sessionIdRef.current = sessionId;
    let timer: ReturnType<typeof setInterval> | null = null;

    const heartbeat = () => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/cameras/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        cache: 'no-store',
      }).catch(() => undefined);
    };

    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
      void fetch('/api/cameras/presence', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
        keepalive: true,
      }).catch(() => undefined);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        heartbeat();
      }
    };

    heartbeat();
    timer = setInterval(heartbeat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stop();
    };
  }, []);

  return null;
}
