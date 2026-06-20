'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { markNavigationBack } from '@/lib/motion/navigation-direction';
import { shouldSkipPageMotion } from '@/lib/motion/constants';
import {
  SWIPE_BACK_COMMIT_RATIO,
  SWIPE_BACK_EDGE_PX,
} from '@/lib/motion/tokens';
import { capturePageShellSnapshot } from '@/lib/navigation/tab-snapshot-cache';
import { isStaffSwipeableTabRoot } from '@/lib/navigation/main-tab-roots';

const MIN_DRAG_PX = 12;
const VELOCITY_COMMIT_PX_MS = 0.45;

export function SwipeBackGesture() {
  const router = useRouter();
  const pathname = usePathname();
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    locked: boolean | null;
    pointerId: number;
    committed: boolean;
    lastX: number;
    lastTime: number;
  } | null>(null);
  const underlayRef = useRef<HTMLDivElement | null>(null);

  const clearSwipeStyles = useCallback(() => {
    const html = document.documentElement;
    html.removeAttribute('data-swipe-back');
    html.style.removeProperty('--marbella-swipe-x');
    html.style.removeProperty('--marbella-swipe-shadow');
    html.style.removeProperty('--marbella-swipe-underlay');

    underlayRef.current?.remove();
    underlayRef.current = null;
  }, []);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    clearSwipeStyles();
  }, [clearSwipeStyles]);

  const canSwipeBack = useCallback(() => {
    if (typeof window === 'undefined') return false;
    if (isStaffSwipeableTabRoot(pathname)) return false;
    if (shouldSkipPageMotion(pathname)) return false;
    if (document.documentElement.getAttribute('data-modal-open') === 'true') {
      return false;
    }
    if (document.documentElement.getAttribute('data-tab-swipe') === 'true') {
      return false;
    }
    if (window.history.length <= 1) return false;
    return true;
  }, [pathname]);

  const mountUnderlay = useCallback(() => {
    if (underlayRef.current) return;

    const snapshot = capturePageShellSnapshot();
    if (!snapshot) return;

    const host = document.querySelector('.marbella-page-stack') ?? document.body;
    const underlay = document.createElement('div');
    underlay.className = 'marbella-swipe-back-underlay';
    underlay.setAttribute('aria-hidden', 'true');
    underlay.innerHTML = snapshot;
    host.appendChild(underlay);
    underlayRef.current = underlay;
  }, []);

  useEffect(() => {
    resetDrag();
  }, [pathname, resetDrag]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!canSwipeBack()) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (event.clientX > SWIPE_BACK_EDGE_PX) return;

      dragRef.current = {
        active: true,
        startX: event.clientX,
        startY: event.clientY,
        locked: null,
        pointerId: event.pointerId,
        committed: false,
        lastX: event.clientX,
        lastTime: event.timeStamp,
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
      mountUnderlay();

      const width = window.innerWidth || 1;
      const damped = Math.min(dx, width * 0.92);
      const progress = damped / width;
      const html = document.documentElement;

      html.setAttribute('data-swipe-back', 'true');
      html.style.setProperty('--marbella-swipe-x', `${damped}px`);
      html.style.setProperty('--marbella-swipe-shadow', String(progress * 0.35));
      html.style.setProperty('--marbella-swipe-underlay', `${Math.max(0, damped - width * 0.18)}px`);

      const dt = Math.max(event.timeStamp - drag.lastTime, 1);
      const velocity = (event.clientX - drag.lastX) / dt;
      drag.lastX = event.clientX;
      drag.lastTime = event.timeStamp;

      if (drag.committed) return;

      const passedDistance = progress >= SWIPE_BACK_COMMIT_RATIO;
      const passedVelocity = velocity >= VELOCITY_COMMIT_PX_MS;

      if (passedDistance || passedVelocity) {
        drag.committed = true;
        markNavigationBack();
        router.back();
      }
    };

    const finishDrag = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag?.active || drag.pointerId !== event.pointerId) return;
      resetDrag();
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
  }, [canSwipeBack, clearSwipeStyles, mountUnderlay, resetDrag, router]);

  return null;
}
