'use client';

import { useCallback, useMemo } from 'react';
import { useRouter as useNextRouter, usePathname, useSearchParams } from 'next/navigation';
import { useNavigation } from '@/lib/navigation/navigation-context';

type NextRouter = ReturnType<typeof useNextRouter>;
type RouterOptions = Parameters<NextRouter['push']>[1];

function buildRouteKey(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

function isSameRoute(pathname: string, search: string, href: string): boolean {
  try {
    const url = new URL(href, window.location.origin);
    const target = buildRouteKey(url.pathname, url.search.slice(1));
    const current = buildRouteKey(pathname, search);
    return target === current;
  } catch {
    return false;
  }
}

/**
 * Router con feedback solo cuando la ruta destino es distinta y la carga tarda.
 */
export function useAppRouter(): NextRouter {
  const router = useNextRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const { startNavigation } = useNavigation();

  const navigate = useCallback(
    (fn: () => void, href?: string) => {
      if (href && isSameRoute(pathname, search, href)) {
        return;
      }
      startNavigation();
      fn();
    },
    [pathname, search, startNavigation],
  );

  const push = useCallback(
    (href: string, options?: RouterOptions) => {
      navigate(() => router.push(href, options), href);
    },
    [router, navigate],
  );

  const replace = useCallback(
    (href: string, options?: RouterOptions) => {
      navigate(() => router.replace(href, options), href);
    },
    [router, navigate],
  );

  const back = useCallback(() => {
    startNavigation();
    router.back();
  }, [router, startNavigation]);

  return useMemo(
    () =>
      Object.assign(router, {
        push,
        replace,
        back,
      }),
    [router, push, replace, back],
  );
}
