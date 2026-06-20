'use client';

import { useEffect, useRef, useState } from 'react';

type MotionPhase = 'closed' | 'entering' | 'open' | 'exiting';

type UsePresenceMotionOptions = {
  open: boolean;
  durationMs: number;
};

export function usePresenceMotion({ open, durationMs }: UsePresenceMotionOptions) {
  const [phase, setPhase] = useState<MotionPhase>(open ? 'entering' : 'closed');
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (timeoutRef.current != null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (open) {
      setPhase((current) => (current === 'open' ? 'open' : 'entering'));
      timeoutRef.current = window.setTimeout(() => {
        setPhase('open');
        timeoutRef.current = null;
      }, durationMs);
      return;
    }

    setPhase((current) => {
      if (current === 'closed') return 'closed';
      return 'exiting';
    });

    timeoutRef.current = window.setTimeout(() => {
      setPhase('closed');
      timeoutRef.current = null;
    }, durationMs);
  }, [open, durationMs]);

  useEffect(
    () => () => {
      if (timeoutRef.current != null) {
        window.clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  const mounted = phase !== 'closed';
  const isEntering = phase === 'entering';
  const isExiting = phase === 'exiting';
  const isVisible = phase === 'entering' || phase === 'open';

  return { mounted, isEntering, isExiting, isVisible, phase };
}
