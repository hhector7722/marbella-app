import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
    // 1. Configuramos la respuesta inicial
    let response = NextResponse.next({
        request: {
            headers: request.headers,
        },
    })

    // 2. Creamos el cliente de Supabase para el servidor
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    // Esto es crítico: actualiza las cookies en la respuesta y en la request
                    cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
                    response = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // 3. Verificamos el usuario
    // IMPORTANTE: getUser() valida el token contra Supabase Auth (seguro).
    // getSession() solo mira la cookie (inseguro). Usamos getUser.
    const {
        data: { user },
    } = await supabase.auth.getUser()

    // 4. Reglas de Protección (Firewall)

    // A. Si NO hay usuario y NO estamos en login -> Expulsar a login
    if (!user && !request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // B. Si HAY usuario y estamos en login -> Mandar a Home (evitar bucle)
    if (user && request.nextUrl.pathname.startsWith('/login')) {
        const url = request.nextUrl.clone()
        url.pathname = '/'
        return NextResponse.redirect(url)
    }

    return response
}