import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

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

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isRecoveryProfileRoute = isPasswordRecoveryProfileRequest(request);

  if (path.startsWith("/api/")) {
    return NextResponse.next();
  }

  if (path === "/carta" || path.startsWith("/carta/")) {
    return NextResponse.next();
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !path.startsWith("/login") && !path.startsWith("/auth") && !isRecoveryProfileRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role;

    if (
      (role === "staff" || role === "supervisor") &&
      path.startsWith("/dashboard") &&
      !path.startsWith("/dashboard/propinas") &&
      !path.startsWith("/dashboard/kds")
    ) {
      return NextResponse.redirect(new URL("/staff/dashboard", request.url));
    }

    if (path.startsWith("/login")) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|site\\.webmanifest|icons/.*).*)",
  ],
};
