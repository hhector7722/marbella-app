'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  consumeNavigationDirection,
  consumeSkipPageMotion,
  markNavigationBack,
} from '@/lib/motion/navigation-direction';
import { shouldSkipPageMotion } from '@/lib/motion/constants';
import { PAGE_PUSH_MS } from '@/lib/motion/tokens';
import { capturePageShellSnapshot } from '@/lib/navigation/tab-snapshot-cache';
import { DiscretePanelSpinner } from '@/components/navigation/DiscretePanelSpinner';

type MotionClass =
  | 'marbella-page-forward'
  | 'marbella-page-back'
  | 'marbella-page-fade'
  | '';

type StackDirection = 'forward' | 'back' | null;

export function AppPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const isFirstRenderRef = useRef(true);
  const [motionClass, setMotionClass] = useState<MotionClass>('');
  const [outgoingSnapshot, setOutgoingSnapshot] = useState<string | null>(null);
  const [stackDirection, setStackDirection] = useState<StackDirection>(null);
  const [awaitingContent, setAwaitingContent] = useState(false);

  useEffect(() => {
    const onPopState = () => {
      markNavigationBack();
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevPathRef.current = pathname;
      return;
    }

    if (prevPathRef.current === pathname) return;

    const prevPath = prevPathRef.current;

    if (shouldSkipPageMotion(pathname) && shouldSkipPageMotion(prevPath)) {
      prevPathRef.current = pathname;
      return;
    }

    if (consumeSkipPageMotion(prevPath, pathname)) {
      prevPathRef.current = pathname;
      setOutgoingSnapshot(null);
      setStackDirection(null);
      setMotionClass('');
      setAwaitingContent(false);
      return;
    }

    const direction = consumeNavigationDirection(prevPath, pathname);
    const snapshot = capturePageShellSnapshot();

    if (direction === 'forward') {
      setMotionClass('marbella-page-forward');
      setStackDirection('forward');
    } else if (direction === 'back') {
      setMotionClass('marbella-page-back');
      setStackDirection('back');
    } else {
      setMotionClass('marbella-page-fade');
      setStackDirection(null);
    }

    setOutgoingSnapshot(snapshot);
    setAwaitingContent(!snapshot);
    prevPathRef.current = pathname;

    const timer = window.setTimeout(() => {
      setMotionClass('');
      setOutgoingSnapshot(null);
      setStackDirection(null);
      setAwaitingContent(false);
    }, PAGE_PUSH_MS + 40);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  useEffect(() => {
    if (!awaitingContent) return;
    const timer = window.setTimeout(() => setAwaitingContent(false), 120);
    return () => window.clearTimeout(timer);
  }, [awaitingContent, children, pathname]);

  const showStack = Boolean(outgoingSnapshot && stackDirection);

  return (
    <div className="marbella-page-stack relative min-h-full">
      {showStack ? (
        <div
          className={cn(
            'marbella-page-outgoing pointer-events-none absolute inset-0 z-0 overflow-hidden bg-[#5B8FB9]',
            stackDirection === 'forward' && 'marbella-page-outgoing-forward',
            stackDirection === 'back' && 'marbella-page-outgoing-back'
          )}
          aria-hidden
          dangerouslySetInnerHTML={{ __html: outgoingSnapshot! }}
        />
      ) : null}

      <div
        className={cn(
          'marbella-page-shell relative z-10 min-h-full will-change-transform',
          showStack && 'marbella-page-incoming',
          showStack && stackDirection === 'forward' && 'marbella-page-incoming-forward',
          showStack && stackDirection === 'back' && 'marbella-page-incoming-back',
          !showStack && motionClass
        )}
      >
        {awaitingContent && showStack ? <DiscretePanelSpinner /> : null}
        {children}
      </div>
    </div>
  );
}
