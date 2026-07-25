import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getHomeHrefForUser, isMasterDashboardUser } from "@/lib/master-dashboard";
import { withTimeout } from "@/lib/with-timeout";
import {
  applyUsageTrackingCookies,
  enqueueUsageSessionRecord,
  getUsageTrackingFlags,
} from "@/lib/usage/middleware-track";

const PROXY_AUTH_TIMEOUT_MS = 1500;
const PROXY_PROFILE_TIMEOUT_MS = 1200;

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

/** Rutas /dashboard/* abiertas a staff/supervisor (sin consultar role). */
function isStaffDashboardAllowed(path: string): boolean {
  return (
    path.startsWith("/dashboard/propinas") ||
    path.startsWith("/dashboard/albaranes") ||
    path.startsWith("/dashboard/scanner") ||
    path.startsWith("/dashboard/eventos")
  );
}

/**
 * Solo estas rutas necesitan `profiles.role` en el proxy.
 * El resto basta con JWT (email) o sesión presente → evita PostgREST en cada navegación.
 */
function pathNeedsProfileRole(path: string): boolean {
  if (path === "/" || path.startsWith("/login")) return true;
  if (!path.startsWith("/dashboard")) return false;
  if (isStaffDashboardAllowed(path)) return false;
  // /dashboard/uso y /dashboard/web se resuelven solo con email master.
  if (path.startsWith("/dashboard/uso") || path.startsWith("/dashboard/web")) return false;
  return true;
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

  // Pedido privado por token (edición cliente, sin login).
  if (path === "/pedido" || path.startsWith("/pedido/")) {
    return NextResponse.next();
  }

  // Formulario público de reporte de actividades (sin login)
  if (path === "/reporte" || path.startsWith("/reporte/")) {
    return NextResponse.next();
  }

  // Propuestas comerciales estáticas (sin login)
  if (path === "/propuestas" || path.startsWith("/propuestas/")) {
    return NextResponse.next();
  }

  // API vales: access check público (devuelve false si no hay sesión);
  // la descarga valida email en el handler.
  if (path.startsWith("/api/propuestas/")) {
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

  // `getUser()` hace round-trip a GoTrue y puede COLGAR el proxy.
  // Para el guard de rutas basta la sesión del JWT en cookies.
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
    const emailFromJwt = user.email ?? "";

    // Gates solo por email (JWT): sin round-trip a profiles.
    if (path.startsWith("/master") && !isMasterDashboardUser(emailFromJwt)) {
      const masterRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, masterRedirect);
      return masterRedirect;
    }

    if (path.startsWith("/dashboard/uso") && !isMasterDashboardUser(emailFromJwt)) {
      const usoRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, usoRedirect);
      return usoRedirect;
    }

    if (path.startsWith("/dashboard/web") && !isMasterDashboardUser(emailFromJwt)) {
      const webRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, webRedirect);
      return webRedirect;
    }

    if (path.startsWith("/profile/contrato") && !isMasterDashboardUser(emailFromJwt)) {
      const contratoRedirect = NextResponse.redirect(new URL("/profile", request.url));
      copyResponseCookies(response, contratoRedirect);
      return contratoRedirect;
    }

    // PWA start_url `/` → home. Master solo con email JWT (caso Héctor: sin profiles).
    if (path === "/" || path.startsWith("/login")) {
      if (isMasterDashboardUser(emailFromJwt)) {
        const home = getHomeHrefForUser(emailFromJwt);
        const homeRedirect = NextResponse.redirect(new URL(home, request.url));
        copyResponseCookies(response, homeRedirect);
        attachUsageTracking(homeRedirect, request, supabase, user.id, path);
        return homeRedirect;
      }

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
      const role = profileResult.data?.role;
      const email = profileResult.data?.email ?? emailFromJwt;
      // Sin perfil a tiempo → staff home (fail-open; evita blanco eterno).
      const home = getHomeHrefForUser(email, role ?? "staff");
      const homeRedirect = NextResponse.redirect(new URL(home, request.url));
      copyResponseCookies(response, homeRedirect);
      attachUsageTracking(homeRedirect, request, supabase, user.id, path);
      return homeRedirect;
    }

    if (pathNeedsProfileRole(path)) {
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
      const role = profileResult.data?.role;

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
        !isStaffDashboardAllowed(path)
      ) {
        const staffRedirect = NextResponse.redirect(new URL("/staff/dashboard", request.url));
        copyResponseCookies(response, staffRedirect);
        return staffRedirect;
      }
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
