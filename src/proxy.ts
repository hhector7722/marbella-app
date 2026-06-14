import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getHomeHrefForUser, isMasterDashboardUser } from "@/lib/master-dashboard";
import { withTimeout } from "@/lib/with-timeout";
import {
  applyUsageTrackingCookies,
  enqueueUsageSessionRecord,
  getUsageTrackingFlags,
} from "@/lib/usage/middleware-track";

const PROXY_AUTH_TIMEOUT_MS = 2500;
const PROXY_PROFILE_TIMEOUT_MS = 2500;

function isPasswordRecoveryProfileRequest(request: NextRequest) {
  if (request.nextUrl.pathname !== "/profile") return false;

  const searchParams = request.nextUrl.searchParams;
  return (
    searchParams.get("type") === "recovery" ||
    searchParams.has("code") ||
    searchParams.has("token") ||
    searchParams.has("token_hash") ||
    searchParams.has("access_token") ||
    searchParams.has("refresh_token")
  );
}

/** Copia cookies de refresco de sesión Supabase al redirect. */
function copyResponseCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie.name, cookie.value);
  });
}

function attachUsageTracking(
  response: NextResponse,
  request: NextRequest,
  supabase: ReturnType<typeof createServerClient>,
  profileId: string,
  pathname: string
): void {
  const flags = getUsageTrackingFlags(request, pathname);
  applyUsageTrackingCookies(response, pathname, request.nextUrl.search, flags);
  if (flags.session) {
    enqueueUsageSessionRecord(supabase, profileId, pathname, request.nextUrl.search);
  }
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isRecoveryProfileRoute = isPasswordRecoveryProfileRequest(request);

  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (path === "/carta" || path.startsWith("/carta/")) {
    return NextResponse.next();
  }

  // Formulario público de pedidos por eventos (sin login), igual que `/carta`.
  if (path === "/eventos" || path.startsWith("/eventos/")) {
    return NextResponse.next();
  }

  if (path === "/staff") {
    return NextResponse.redirect(new URL("/staff/dashboard", request.url));
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // `getUser()` hace round-trip a GoTrue y puede COLGAR el proxy
  // (el navegador queda en "cargando" infinito). Para el guard de rutas
  // basta la sesión del JWT en cookies — PostgREST/RLS siguen validando.
  const sessionResult = await withTimeout(
    supabase.auth.getSession(),
    PROXY_AUTH_TIMEOUT_MS,
    { data: { session: null }, error: null }
  );
  const user = sessionResult.data.session?.user ?? null;

  if (!user && !path.startsWith("/login") && !path.startsWith("/auth") && !isRecoveryProfileRoute) {
    const loginRedirect = NextResponse.redirect(new URL("/login", request.url));
    copyResponseCookies(response, loginRedirect);
    return loginRedirect;
  }

  if (user) {
    const profileResult = await withTimeout(
      (async () => {
        try {
          return await supabase
            .from("profiles")
            .select("role, email")
            .eq("id", user.id)
            .maybeSingle();
        } catch {
          return { data: null, error: null };
        }
      })(),
      PROXY_PROFILE_TIMEOUT_MS,
      { data: null, error: null }
    );
    const profile = profileResult.data;

    const role = profile?.role;
    const email = profile?.email ?? user.email ?? "";

    // PWA abre `start_url: /` — redirect aquí evita RSC extra en page.tsx.
    if (path === "/") {
      const home = getHomeHrefForUser(email, role);
      const homeRedirect = NextResponse.redirect(new URL(home, request.url));
      copyResponseCookies(response, homeRedirect);
      attachUsageTracking(homeRedirect, request, supabase, user.id, path);
      return homeRedirect;
    }

    // Staff/supervisor solo pueden un subconjunto de `/dashboard/*`.
    // IMPORTANTE: incluir albaranes + scanner (subida) — antes quedaban
    // fuera y el proxy redirigía a `/staff/dashboard` o colgaba en getUser.
    const staffDashboardAllowed =
      path.startsWith("/dashboard/propinas") ||
      path.startsWith("/dashboard/albaranes") ||
      path.startsWith("/dashboard/scanner") ||
      path.startsWith("/dashboard/eventos");

    // Insights: solo manager/admin (supervisor excluido explícitamente).
    if (
      path.startsWith("/dashboard/insights") &&
      role !== "manager" &&
      role !== "admin"
    ) {
      const dest =
        role === "staff" || role === "supervisor"
          ? "/staff/dashboard"
          : "/dashboard";
      const insightsRedirect = NextResponse.redirect(new URL(dest, request.url));
      copyResponseCookies(response, insightsRedirect);
      return insightsRedirect;
    }

    if (
      (role === "staff" || role === "supervisor") &&
      path.startsWith("/dashboard") &&
      !staffDashboardAllowed
    ) {
      const staffRedirect = NextResponse.redirect(new URL("/staff/dashboard", request.url));
      copyResponseCookies(response, staffRedirect);
      return staffRedirect;
    }

    if (path.startsWith("/master")) {
      if (!isMasterDashboardUser(email)) {
        const masterRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
        copyResponseCookies(response, masterRedirect);
        return masterRedirect;
      }
    }

    if (path.startsWith("/dashboard/uso") && !isMasterDashboardUser(email)) {
      const usoRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, usoRedirect);
      return usoRedirect;
    }

    if (path.startsWith("/login")) {
      const home = getHomeHrefForUser(email, role);
      const loginHomeRedirect = NextResponse.redirect(new URL(home, request.url));
      copyResponseCookies(response, loginHomeRedirect);
      return loginHomeRedirect;
    }

    attachUsageTracking(response, request, supabase, user.id, path);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|site\\.webmanifest|icons/.*).*)",
  ],
};
