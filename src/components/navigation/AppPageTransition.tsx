'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  consumeNavigationDirection,
  markNavigationBack,
} from '@/lib/motion/navigation-direction';
import { shouldSkipPageMotion } from '@/lib/motion/constants';

type MotionClass =
  | 'marbella-page-forward'
  | 'marbella-page-back'
  | 'marbella-page-fade'
  | '';

export function AppPageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  const isFirstRenderRef = useRef(true);
  const [motionClass, setMotionClass] = useState<MotionClass>('');

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

    if (shouldSkipPageMotion(pathname) && shouldSkipPageMotion(prevPathRef.current)) {
      prevPathRef.current = pathname;
      return;
    }

    const direction = consumeNavigationDirection(prevPathRef.current, pathname);

    if (direction === 'forward') {
      setMotionClass('marbella-page-forward');
    } else if (direction === 'back') {
      setMotionClass('marbella-page-back');
    } else {
      setMotionClass('marbella-page-fade');
    }

    prevPathRef.current = pathname;

    const timer = window.setTimeout(() => {
      setMotionClass('');
    }, 380);

    return () => window.clearTimeout(timer);
  }, [pathname]);

  return (
    <div
      className={cn(
        'marbella-page-shell min-h-full will-change-transform',
        motionClass
      )}
    >
      {children}
    </div>
  );
}
