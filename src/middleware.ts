import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
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
                    // 1. Actualizar cookies en la REQUEST (para que el middleware las vea)
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );

                    // 2. Actualizar respuesta (para mantener la sesión)
                    response = NextResponse.next({
                        request: {
                            headers: request.headers,
                        },
                    });

                    // 3. Actualizar cookies en la RESPONSE (Corrección del error setAll)
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    );
                },
            },
        }
    );

    // IMPORTANTE: Ejecutar getUser para refrescar token si es necesario
    const { data: { user } } = await supabase.auth.getUser();

    // --- LÓGICA DE PROTECCIÓN DE RUTAS ---

    // 1. Protección Global: Si no hay usuario y no es login/auth, mandar a Login
    if (!user && !request.nextUrl.pathname.startsWith('/login') && !request.nextUrl.pathname.startsWith('/auth')) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (user) {
        // Obtener rol (Consulta rápida)
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const role = profile?.role;
        const path = request.nextUrl.pathname;

        // 3. Bloquear STAFF y SUPERVISOR entrando a MANAGER (/dashboard)
        // Solo permitir a 'manager' entrar a /dashboard
        if ((role === 'staff' || role === 'supervisor') && path.startsWith('/dashboard')) {
            return NextResponse.redirect(new URL("/staff/dashboard", request.url));
        }

        // 4. Bloquear acceso a /staff si no es manager o supervisor (opcional, pero staff debe poder entrar a su zona)
        // Si un manager entra a /staff, está bien (es el modo staff)
        // 5. Si está logueado e intenta ir a Login, mandar a Home (que redirige solo)
        if (path.startsWith('/login')) {
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};