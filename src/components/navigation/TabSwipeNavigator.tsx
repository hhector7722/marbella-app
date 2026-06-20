'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { trackUsageTabSwitch } from '@/lib/usage/client';
import {
  getAdjacentStaffTabRoot,
  isStaffSwipeableTabRoot,
} from '@/lib/navigation/main-tab-roots';
import {
  captureTabSnapshot,
  getTabSnapshot,
} from '@/lib/navigation/tab-snapshot-cache';
import { markTabSwipeTransition } from '@/lib/motion/navigation-direction';
import {
  PAGE_PUSH_MS,
  TAB_SWIPE_COMMIT_RATIO,
} from '@/lib/motion/tokens';
import { DiscretePanelSpinner } from '@/components/navigation/DiscretePanelSpinner';

const MIN_DRAG_PX = 10;
const VELOCITY_COMMIT_PX_MS = 0.45;

type TabSwipePhase = 'idle' | 'dragging' | 'animating';

type TabSwipeTransition = {
  fromPath: string;
  toPath: string;
  direction: 'left' | 'right';
  outgoingHtml: string;
  incomingHtml: string | null;
  incomingHasSnapshot: boolean;
};

const TAB_LABELS: Record<string, string> = {
  '/staff/history': 'Asistencia',
  '/staff/dashboard': 'Inicio',
  '/profile': 'Perfil',
};

export function TabSwipeNavigator({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const shellRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    locked: boolean | null;
    pointerId: number;
    committed: boolean;
    targetPath: string | null;
    lastX: number;
    lastTime: number;
  } | null>(null);

  const [phase, setPhase] = useState<TabSwipePhase>('idle');
  const [transition, setTransition] = useState<TabSwipeTransition | null>(null);

  const enabled = isStaffSwipeableTabRoot(pathname);

  const clearDragStyles = useCallback(() => {
    const html = document.documentElement;
    html.removeAttribute('data-tab-swipe');
    html.style.removeProperty('--marbella-tab-swipe-x');
    html.style.removeProperty('--marbella-tab-swipe-progress');
  }, []);

  const resetDrag = useCallback(() => {
    dragRef.current = null;
    clearDragStyles();
    if (phase === 'dragging') setPhase('idle');
  }, [clearDragStyles, phase]);

  const finishTransition = useCallback(() => {
    setTransition(null);
    setPhase('idle');
    clearDragStyles();
  }, [clearDragStyles]);

  const canSwipe = useCallback(() => {
    if (!enabled) return false;
    if (typeof window === 'undefined') return false;
    if (document.documentElement.getAttribute('data-modal-open') === 'true') {
      return false;
    }
    if (phase === 'animating') return false;
    return true;
  }, [enabled, phase]);

  const commitTabSwipe = useCallback(
    (targetPath: string, direction: 'left' | 'right') => {
      const drag = dragRef.current;
      if (!drag || drag.committed) return;

      drag.committed = true;
      drag.targetPath = targetPath;

      const container = shellRef.current;
      const outgoingHtml = container?.innerHTML ?? '';

      if (container) {
        captureTabSnapshot(pathname, container);
      }

      const incomingSnapshot = getTabSnapshot(targetPath);
      markTabSwipeTransition();
      trackUsageTabSwitch(pathname, targetPath, TAB_LABELS[targetPath] ?? targetPath);

      setTransition({
        fromPath: pathname,
        toPath: targetPath,
        direction,
        outgoingHtml,
        incomingHtml: incomingSnapshot?.html ?? null,
        incomingHasSnapshot: Boolean(incomingSnapshot),
      });
      setPhase('animating');
      clearDragStyles();

      router.push(targetPath);
    },
    [clearDragStyles, pathname, router]
  );

  useEffect(() => {
    if (!enabled) {
      resetDrag();
      finishTransition();
    }
  }, [enabled, finishTransition, resetDrag]);

  useEffect(() => {
    if (phase !== 'animating' || !transition) return;
    if (pathname !== transition.toPath) return;

    const timer = window.setTimeout(finishTransition, PAGE_PUSH_MS + 40);
    return () => window.clearTimeout(timer);
  }, [finishTransition, pathname, phase, transition]);

  useEffect(() => {
    if (enabled && shellRef.current) {
      captureTabSnapshot(pathname, shellRef.current);
    }
  }, [enabled, pathname]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!canSwipe()) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    dragRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      locked: null,
      pointerId: event.pointerId,
      committed: false,
      targetPath: null,
      lastX: event.clientX,
      lastTime: event.timeStamp,
    };
    setPhase('dragging');
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.active || drag.pointerId !== event.pointerId) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (drag.locked == null) {
      if (Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) return;
      drag.locked = Math.abs(dx) > Math.abs(dy);
      if (!drag.locked) {
        resetDrag();
        return;
      }
    }

    if (!drag.locked) return;

    const width = window.innerWidth || 1;
    const nextTab = dx < 0 ? getAdjacentStaffTabRoot(pathname, 'next') : getAdjacentStaffTabRoot(pathname, 'prev');
    const atEdge = !nextTab && Math.abs(dx) > MIN_DRAG_PX;

    let progress = dx / width;
    if (atEdge) {
      progress = progress * 0.28;
    } else if (!nextTab) {
      progress = 0;
    }

    const absProgress = Math.min(Math.abs(progress), 0.92);

    const html = document.documentElement;
    html.setAttribute('data-tab-swipe', 'true');
    html.style.setProperty('--marbella-tab-swipe-x', `${progress * width}px`);
    html.style.setProperty('--marbella-tab-swipe-progress', String(absProgress));

    const dt = Math.max(event.timeStamp - drag.lastTime, 1);
    const velocity = (event.clientX - drag.lastX) / dt;
    drag.lastX = event.clientX;
    drag.lastTime = event.timeStamp;

    if (!nextTab || drag.committed) return;

    const passedDistance = absProgress >= TAB_SWIPE_COMMIT_RATIO;
    const passedVelocity =
      Math.abs(velocity) >= VELOCITY_COMMIT_PX_MS &&
      ((velocity < 0 && dx < 0) || (velocity > 0 && dx > 0));

    if (passedDistance || passedVelocity) {
      commitTabSwipe(nextTab, dx < 0 ? 'left' : 'right');
    }
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag?.active || drag.pointerId !== event.pointerId) return;

    if (!drag.committed) {
      resetDrag();
      return;
    }

    dragRef.current = null;
  };

  const showDualLayer = phase === 'animating' && transition;
  const incomingWaiting =
    showDualLayer &&
    transition &&
    pathname !== transition.toPath &&
    !transition.incomingHasSnapshot;

  return (
    <div
      ref={shellRef}
      className="relative min-h-full touch-pan-y"
      data-marbella-scroll-root
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      {showDualLayer && transition ? (
        <div className="marbella-tab-stack relative min-h-full overflow-hidden">
          <div
            className={cn(
              'marbella-tab-outgoing absolute inset-0 z-10 overflow-hidden bg-[#5B8FB9]',
              transition.direction === 'left'
                ? 'marbella-tab-outgoing-left'
                : 'marbella-tab-outgoing-right'
            )}
            aria-hidden
            dangerouslySetInnerHTML={{ __html: transition.outgoingHtml }}
          />

          <div
            className={cn(
              'marbella-tab-incoming relative z-20 min-h-full bg-[#5B8FB9]',
              transition.direction === 'left'
                ? 'marbella-tab-incoming-left'
                : 'marbella-tab-incoming-right'
            )}
          >
            {transition.incomingHtml ? (
              <div
                className="min-h-full"
                aria-hidden={pathname !== transition.toPath}
                dangerouslySetInnerHTML={{ __html: transition.incomingHtml }}
              />
            ) : null}

            {incomingWaiting ? <DiscretePanelSpinner /> : null}

            <div
              className={cn(
                'min-h-full',
                transition.incomingHtml && pathname !== transition.toPath
                  ? 'opacity-0'
                  : 'opacity-100'
              )}
            >
              {children}
            </div>
          </div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}
