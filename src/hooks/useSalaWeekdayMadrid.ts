'use client';

import { useEffect, useState } from 'react';

// Comparten el mismo calendario con la protección de Supabase y el gateway.
// La hora del equipo no influye en qué día es en Barcelona.
const dayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Madrid',
  weekday: 'short',
});

export function isSalaWeekdayMadrid(now: Date = new Date()): boolean {
  return !['Sat', 'Sun'].includes(dayFormatter.format(now));
}

export function useSalaWeekdayMadrid(): boolean {
  const [enabled, setEnabled] = useState(() => isSalaWeekdayMadrid());

  useEffect(() => {
    // Reactivar/desactivar aunque la pantalla siga abierta al pasar medianoche.
    const tick = () => setEnabled(isSalaWeekdayMadrid());
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  return enabled;
}
