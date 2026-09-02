import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getHomeHrefForUser, isMasterDashboardUser } from "@/lib/master-dashboard";
import { MASTER_VIEW_AS_COOKIE } from "@/lib/master-view-as";
import { withTimeout } from "@/lib/with-timeout";
import {
  preserveSessionOnFailedRefresh,
  readAuthUserFromCookies,
} from "@/lib/auth/cookie-user";
import {
  applyUsageTrackingCookies,
  enqueueUsageSessionRecord,
  getUsageTrackingFlags,
} from "@/lib/usage/middleware-track";

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

/**
 * POST de Server Action. Un redirect HTML (login/home) rompe Next:
 * "An unexpected response was received from the server" / fetchServerAction.
 */
function isServerActionRequest(request: NextRequest): boolean {
  return request.headers.has("next-action");
}

async function resolveEffectiveRole(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
  emailFromJwt: string,
  request: NextRequest
): Promise<{ role: string | null; email: string; viewAsActive: boolean }> {
  const viewAsId =
    isMasterDashboardUser(emailFromJwt) ?
      request.cookies.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null
    : null;

  if (viewAsId && viewAsId !== userId) {
    const viewAsProfile = await withTimeout(
      (async () => {
        try {
          return await supabase
            .from("profiles")
            .select("role, email")
            .eq("id", viewAsId)
            .maybeSingle();
        } catch {
          return { data: null, error: null };
        }
      })(),
      PROXY_PROFILE_TIMEOUT_MS,
      { data: null, error: null }
    );
    if (viewAsProfile.data) {
      return {
        role: viewAsProfile.data.role ?? "staff",
        email: viewAsProfile.data.email ?? emailFromJwt,
        viewAsActive: true,
      };
    }
  }

  const profileResult = await withTimeout(
    (async () => {
      try {
        return await supabase
          .from("profiles")
          .select("role, email")
          .eq("id", userId)
          .maybeSingle();
      } catch {
        return { data: null, error: null };
      }
    })(),
    PROXY_PROFILE_TIMEOUT_MS,
    { data: null, error: null }
  );

  return {
    role: profileResult.data?.role ?? null,
    email: profileResult.data?.email ?? emailFromJwt,
    viewAsActive: false,
  };
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

  const isAction = isServerActionRequest(request);

  if (path === "/staff" && !isAction) {
    return NextResponse.redirect(new URL("/staff/dashboard", request.url));
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const cookieList = request.cookies.getAll();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          const nextCookies = preserveSessionOnFailedRefresh(cookiesToSet);
          nextCookies.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: {
              headers: request.headers,
            },
          });
          nextCookies.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Solo cookies. getSession aquí pega a GoTrue, entra en 429 y borra la sesión.
  const user = readAuthUserFromCookies(cookieList);

  if (!user && !path.startsWith("/login") && !path.startsWith("/auth") && !isRecoveryProfileRoute) {
    // Nunca devolver HTML de /login a fetchServerAction.
    if (isAction) {
      return response;
    }
    const loginRedirect = NextResponse.redirect(new URL("/login", request.url));
    copyResponseCookies(response, loginRedirect);
    return loginRedirect;
  }

  if (user) {
    const emailFromJwt = user.email ?? "";

    // Con sesión, la acción sigue en su ruta. Un 302 a home/login es HTML, no payload.
    if (isAction) {
      attachUsageTracking(response, request, supabase, user.id, path);
      return response;
    }

    // Gates solo por email (JWT): sin round-trip a profiles.
    const viewAsCookie =
      isMasterDashboardUser(emailFromJwt) ?
        request.cookies.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null
      : null;
    const isViewingAsWorker = Boolean(viewAsCookie && viewAsCookie !== user.id);

    if (path.startsWith("/master") && (!isMasterDashboardUser(emailFromJwt) || isViewingAsWorker)) {
      const masterRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, masterRedirect);
      return masterRedirect;
    }

    if (path.startsWith("/playground") && !isMasterDashboardUser(emailFromJwt)) {
      const pgRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, pgRedirect);
      return pgRedirect;
    }

    if (path.startsWith("/design-system") && !isMasterDashboardUser(emailFromJwt)) {
      const dsRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, dsRedirect);
      return dsRedirect;
    }

    if (path.startsWith("/dashboard/uso") && (!isMasterDashboardUser(emailFromJwt) || isViewingAsWorker)) {
      const usoRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, usoRedirect);
      return usoRedirect;
    }

    if (path.startsWith("/dashboard/web") && (!isMasterDashboardUser(emailFromJwt) || isViewingAsWorker)) {
      const webRedirect = NextResponse.redirect(new URL("/dashboard", request.url));
      copyResponseCookies(response, webRedirect);
      return webRedirect;
    }

    if (path.startsWith("/profile/contrato") && (!isMasterDashboardUser(emailFromJwt) || isViewingAsWorker)) {
      const contratoRedirect = NextResponse.redirect(new URL("/profile", request.url));
      copyResponseCookies(response, contratoRedirect);
      return contratoRedirect;
    }

    // PWA start_url `/` → home. Master solo con email JWT (caso Héctor: sin profiles).
    if (path === "/" || path.startsWith("/login")) {
      if (isViewingAsWorker && viewAsCookie) {
        const effective = await resolveEffectiveRole(supabase, user.id, emailFromJwt, request);
        const home = getHomeHrefForUser(effective.email, effective.role ?? "staff");
        const homeRedirect = NextResponse.redirect(new URL(home, request.url));
        copyResponseCookies(response, homeRedirect);
        attachUsageTracking(homeRedirect, request, supabase, user.id, path);
        return homeRedirect;
      }

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
      const effective = await resolveEffectiveRole(supabase, user.id, emailFromJwt, request);
      const role = effective.role;

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
