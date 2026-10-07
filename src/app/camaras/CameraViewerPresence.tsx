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
      if (document.visibilityState === 'visible') heartbeat();
    };
    const handleFocus = () => heartbeat();
    const handlePageShow = () => heartbeat();

    heartbeat();
    timer = setInterval(heartbeat, HEARTBEAT_MS);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('pageshow', handlePageShow);
      stop();
    };
  }, []);

  return null;
}
