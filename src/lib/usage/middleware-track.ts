import type { NextRequest } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveUsageLabel } from '@/lib/usage/labels';
import { usageDeviceFromUserAgent } from '@/lib/usage/device';
import {
  isUsageTrackingId,
  USAGE_BROWSER_COOKIE,
  USAGE_BROWSER_SESSION_COOKIE,
} from '@/lib/usage/browser-context';

import { recordAppUsageEventWithClient } from '@/lib/usage/record';



export const USAGE_SESSION_COOKIE = 'mb_usage_session';

export const USAGE_PAGE_COOKIE = 'mb_usage_page';

export const USAGE_LAST_PATH_COOKIE = 'mb_usage_last_path';



const SESSION_IDLE_MS = 30 * 60 * 1000;

export type UsageTrackingFlags = {
  session: boolean;
  pageView: boolean;
  browserId: string | null;
  browserSessionId: string | null;
};



function shouldTrackPath(pathname: string): boolean {

  if (!pathname || pathname.startsWith('/api/') || pathname.startsWith('/_next')) {

    return false;

  }

  if (

    pathname.startsWith('/icon') ||

    pathname.startsWith('/sw.js') ||

    pathname.startsWith('/fonts/') ||

    pathname.startsWith('/images/') ||

    pathname.startsWith('/icons/')

  ) {

    return false;

  }

  if (pathname === '/carta' || pathname.startsWith('/carta/')) {

    return false;

  }

  if (pathname === '/eventos' || pathname.startsWith('/eventos/')) {

    return false;

  }

  return true;

}



function buildFullPath(pathname: string, search: string): string {

  return search ? `${pathname}${search}` : pathname;

}



/** Solo lectura de cookies — no bloquea en red/BD. */

export function getUsageTrackingFlags(

  request: NextRequest,

  pathname: string

): UsageTrackingFlags {

  if (!shouldTrackPath(pathname)) {
    return { session: false, pageView: false, browserId: null, browserSessionId: null };
  }

  const now = Date.now();
  const lastSession = Number(request.cookies.get(USAGE_SESSION_COOKIE)?.value ?? 0);
  const previousBrowserId = request.cookies.get(USAGE_BROWSER_COOKIE)?.value;
  const browserId = isUsageTrackingId(previousBrowserId) ? previousBrowserId : crypto.randomUUID();
  const previousSessionId = request.cookies.get(USAGE_BROWSER_SESSION_COOKIE)?.value;
  const validSessionId = isUsageTrackingId(previousSessionId) ? previousSessionId : null;

  // Reiniciar tras 30 minutos SIN peticiones. La cookie de actividad se
  // actualiza en cada solicitud (antes solo se actualizaba al abrir sesión).
  const isNewSession = !Number.isFinite(lastSession)
    || lastSession <= 0
    || now < lastSession
    || now - lastSession >= SESSION_IDLE_MS
    || !validSessionId;

  return {
    session: isNewSession,
    pageView: false,
    browserId,
    browserSessionId: isNewSession ? crypto.randomUUID() : validSessionId,
  };
}



/** Persiste sesión en BD sin bloquear la respuesta HTTP del proxy. */

export function enqueueUsageSessionRecord(

  supabase: SupabaseClient,

  profileId: string,

  pathname: string,

  search: string,

  userAgent: string | null = null,
  browserId: string | null = null,
  browserSessionId: string | null = null,

): void {

  const deviceType = usageDeviceFromUserAgent(userAgent);

  void recordAppUsageEventWithClient(supabase, profileId, {

    eventType: 'session',

    path: pathname,

    search: search || null,

    label: deriveUsageLabel(pathname),

    metadata: {
      source: 'middleware',
      ...(deviceType ? { deviceType } : {}),
      ...(browserId ? { usageBrowserId: browserId } : {}),
      ...(browserSessionId ? { usageBrowserSessionId: browserSessionId } : {}),
    },

  });

}



/** @deprecated Usar getUsageTrackingFlags + enqueueUsageSessionRecord (no bloqueante). */

export async function trackAppUsageInMiddleware(

  request: NextRequest,

  supabase: SupabaseClient,

  profileId: string,

  pathname: string

): Promise<{ session: boolean; pageView: boolean }> {

  const flags = getUsageTrackingFlags(request, pathname);

  if (flags.session) {

    enqueueUsageSessionRecord(
      supabase, profileId, pathname, request.nextUrl.search,
      request.headers.get('user-agent'), flags.browserId, flags.browserSessionId,
    );

  }

  return flags;

}



export function applyUsageTrackingCookies(

  response: import('next/server').NextResponse,

  pathname: string,

  search: string,

  flags: UsageTrackingFlags

): void {

  const now = Date.now();

  const fullPath = buildFullPath(pathname, search);

  const cookieBase = {

    httpOnly: true,

    sameSite: 'lax' as const,

    path: '/',

    maxAge: 60 * 60 * 24 * 30,

  };



  if (flags.browserId && flags.browserSessionId) {
    // Estos IDs son únicamente para seguimiento, NO para autenticación.
    // Necesitan ser legibles por el cliente para enlazar los registros.
    const browserCookie = { ...cookieBase, httpOnly: false };
    response.cookies.set(USAGE_BROWSER_COOKIE, flags.browserId, browserCookie);
    response.cookies.set(USAGE_BROWSER_SESSION_COOKIE, flags.browserSessionId, browserCookie);

    // Guardar la última actividad, no la hora de inicio.
    response.cookies.set(USAGE_SESSION_COOKIE, String(now), cookieBase);
  }

  response.cookies.set(USAGE_LAST_PATH_COOKIE, fullPath, cookieBase);

}


