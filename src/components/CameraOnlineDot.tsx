'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export function CameraOnlineDot({ className }: { className?: string }) {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let active = true;
    let loading = false;
    let timer: number | undefined;
    let controller: AbortController | null = null;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (active && !document.hidden) timer = window.setTimeout(() => void load(), delay);
    };
    const load = async () => {
      if (!active || document.hidden || loading) return;
      window.clearTimeout(timer);
      loading = true;
      controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller?.abort(), 8000);
      let succeeded = false;
      try {
        const response = await fetch('/api/cameras/status', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Camera status unavailable');
        const data = await response.json();
        const fresh = data.checkedAt && Date.now() - new Date(data.checkedAt).getTime() < 20000;
        if (active) setOnline(Boolean(data.externalOnline && fresh));
        succeeded = true;
      } catch {
        if (active && !document.hidden) setOnline(false);
      } finally {
        window.clearTimeout(requestTimeout);
        controller = null;
        loading = false;
        schedule(succeeded ? 5000 : 60000);
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        window.clearTimeout(timer);
        controller?.abort();
      } else void load();
    };
    void load();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      window.clearTimeout(timer);
      controller?.abort();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  if (!online) return null;
  return <span
    aria-label="Conexión externa activa"
    title="Conexión externa activa"
    className={cn('block h-2.5 w-2.5 shrink-0 rounded-full bg-green-400', className)}
  />;
}
