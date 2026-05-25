'use client';

import { useCallback, useMemo, useTransition } from 'react';
import { useRouter as useNextRouter } from 'next/navigation';
import { useNavigation } from '@/lib/navigation/navigation-context';

type NextRouter = ReturnType<typeof useNextRouter>;
type RouterOptions = Parameters<NextRouter['push']>[1];

/**
 * Router de la app con feedback visual inmediato en push/replace/back.
 * Sustituye `useRouter` de next/navigation en handlers programáticos.
 */
export function useAppRouter(): NextRouter & { isPending: boolean } {
  const router = useNextRouter();
  const { startNavigation } = useNavigation();
  const [isPending, startTransition] = useTransition();

  const push = useCallback(
    (href: string, options?: RouterOptions) => {
      startNavigation();
      startTransition(() => {
        router.push(href, options);
      });
    },
    [router, startNavigation],
  );

  const replace = useCallback(
    (href: string, options?: RouterOptions) => {
      startNavigation();
      startTransition(() => {
        router.replace(href, options);
      });
    },
    [router, startNavigation],
  );

  const back = useCallback(() => {
    startNavigation();
    startTransition(() => {
      router.back();
    });
  }, [router, startNavigation]);

  return useMemo(
    () =>
      Object.assign(router, {
        push,
        replace,
        back,
        isPending,
      }),
    [router, push, replace, back, isPending],
  );
}
