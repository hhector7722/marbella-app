'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markNavigationBack } from '@/lib/motion/navigation-direction';
import { shouldSkipPageMotion } from '@/lib/motion/constants';

const EDGE_WIDTH_PX = 28;
const COMMIT_RATIO = 0.34;
const MIN_DRAG_PX = 12;

export function SwipeBackGesture() {
  const router = useRouter();
  const pathname = usePathname();
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    locked: boolean | null;
    pointerId: number;
  } | null>(null);

  const clearSwipeStyles = useCallback(() => {
    const html = document.documentElement;
    html.removeAttribute('data-swipe-back');
    html.style.removeProperty('--marbella-swipe-x');
    html.style.removeProperty('--marbella-swipe-shadow');
  }, []);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    clearSwipeStyles();
  }, [clearSwipeStyles]);

  const canSwipeBack = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (shouldSkipPageMotion(pathname)) return false;
    if (document.documentElement.getAttribute('data-modal-open') === 'true') return false;
    if (window.history.length <= 1) return false;
    return true;
  }, [pathname]);

  useEffect(() => {
    resetDrag();
  }, [pathname, resetDrag]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!canSwipeBack()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.clientX > EDGE_WIDTH_PX) return;

      dragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        locked: null,
        pointerId: event.pointerId,
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active || drag.pointerId !== event.pointerId) return;

      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;

      if (drag.locked == null) {
        if (Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) return;
        drag.locked = Math.abs(dx) > Math.abs(dy);
        if (!drag.locked) {
          dragRef.current = null;
          return;
        }
      }

      if (!drag.locked || dx <= 0) {
        clearSwipeStyles();
        return;
      }

      event.preventDefault();
      const width = window.innerWidth || 1;
      const damped = Math.min(dx, width * 0.92);
      const progress = damped / width;
      const html = document.documentElement;

      html.setAttribute('data-swipe-back', 'true');
      html.style.setProperty('--marbella-swipe-x', `${damped}px`);
      html.style.setProperty('--marbella-swipe-shadow', String(progress * 0.35));
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active || drag.pointerId !== event.pointerId) return;

      const dx = Math.max(0, event.clientX - drag.startX);
      const width = window.innerWidth || 1;
      const shouldGoBack = drag.locked === true && dx / width >= COMMIT_RATIO;

      resetDrag();

      if (shouldGoBack) {
        markNavigationBack();
        router.back();
      }
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
      clearSwipeStyles();
    };
  }, [canSwipeBack, clearSwipeStyles, resetDrag, router]);

  return null;
}
