import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export default async function middleware(request: NextRequest) {
    const path = request.nextUrl.pathname;

    // --- 1. BYPASS CRÍTICO PARA EL TPV (Añadido) ---
    // Si la ruta es de la API, dejamos pasar sin ejecutar nada de auth.
    // Esto evita los Redirects 307 al login que vacían tus tablas.
    if (path.startsWith('/api/')) {
        return NextResponse.next();
    }

    // --- 2. INICIALIZACIÓN (Tu código original) ---
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
                    cookiesToSet.forEach(({ name, value }) =>
                        request.cookies.set(name, value)
                    );
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

    // Refrescar token
    const { data: { user } } = await supabase.auth.getUser();

    // --- 3. PROTECCIÓN DE RUTAS (Tu código original) ---

    // Protección Global: Si no hay usuario y no es login/auth, mandar a Login
    if (!user && !path.startsWith('/login') && !path.startsWith('/auth')) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    if (user) {
        // Obtener rol
        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        const role = profile?.role;

        // Bloquear STAFF y SUPERVISOR entrando a MANAGER (/dashboard),
        // PERO permitir acceso específico a `/dashboard/propinas` y `/dashboard/kds`.
        if ((role === 'staff' || role === 'supervisor') && path.startsWith('/dashboard') && !path.startsWith('/dashboard/propinas') && !path.startsWith('/dashboard/kds')) {
            return NextResponse.redirect(new URL("/staff/dashboard", request.url));
        }

        // Si está logueado e intenta ir a Login, mandar a Home
        if (path.startsWith('/login')) {
            return NextResponse.redirect(new URL("/", request.url));
        }
    }

    return response;
}

// Configuración del matcher simplificada para evitar bloqueos accidentales
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|workbox-.*\\.js|manifest\\.json|site\\.webmanifest|icons/.*).*)',
    ],
};