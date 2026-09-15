'use client';

import { useEffect, useState } from 'react';

export function CameraOnlineDot() {
  const [online, setOnline] = useState(false);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/cameras/status', { cache: 'no-store' });
        if (!response.ok) return;
        const data = await response.json();
        const fresh = data.checkedAt && Date.now() - new Date(data.checkedAt).getTime() < 20000;
        if (active) setOnline(Boolean(data.externalOnline && fresh));
      } catch {
        if (active) setOnline(false);
      }
    };
    load();
    const timer = window.setInterval(load, 5000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!online) return null;
  return <span aria-label="Conexión externa activa" title="Conexión externa activa" className="block h-2.5 w-2.5 shrink-0 rounded-full bg-green-400" />;
}
