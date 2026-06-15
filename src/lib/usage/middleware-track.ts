import type { NextRequest } from 'next/server';

import type { SupabaseClient } from '@supabase/supabase-js';

import { deriveUsageLabel } from '@/lib/usage/labels';

import { recordAppUsageEventWithClient } from '@/lib/usage/record';



export const USAGE_SESSION_COOKIE = 'mb_usage_session';

export const USAGE_PAGE_COOKIE = 'mb_usage_page';

export const USAGE_LAST_PATH_COOKIE = 'mb_usage_last_path';



const SESSION_IDLE_MS = 30 * 60 * 1000;



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

): { session: boolean; pageView: boolean } {

  if (!shouldTrackPath(pathname)) {

    return { session: false, pageView: false };

  }



  const now = Date.now();

  const lastSessionRaw = request.cookies.get(USAGE_SESSION_COOKIE)?.value;

  const lastSession = lastSessionRaw ? Number(lastSessionRaw) : 0;

  const isNewSession = !lastSession || now - lastSession >= SESSION_IDLE_MS;



  return { session: isNewSession, pageView: false };

}



/** Persiste sesión en BD sin bloquear la respuesta HTTP del proxy. */

export function enqueueUsageSessionRecord(

  supabase: SupabaseClient,

  profileId: string,

  pathname: string,

  search: string

): void {

  void recordAppUsageEventWithClient(supabase, profileId, {

    eventType: 'session',

    path: pathname,

    search: search || null,

    label: deriveUsageLabel(pathname),

    metadata: { source: 'middleware' },

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

    enqueueUsageSessionRecord(supabase, profileId, pathname, request.nextUrl.search);

  }

  return flags;

}



export function applyUsageTrackingCookies(

  response: import('next/server').NextResponse,

  pathname: string,

  search: string,

  flags: { session: boolean; pageView: boolean }

): void {

  const now = Date.now();

  const fullPath = buildFullPath(pathname, search);

  const cookieBase = {

    httpOnly: true,

    sameSite: 'lax' as const,

    path: '/',

    maxAge: 60 * 60 * 24 * 30,

  };



  if (flags.session) {

    response.cookies.set(USAGE_SESSION_COOKIE, String(now), cookieBase);

  }



  response.cookies.set(USAGE_LAST_PATH_COOKIE, fullPath, cookieBase);

}


