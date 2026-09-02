import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as';

const COOKIE_MAX_AGE_S = 60 * 60 * 12;

export async function POST(request: Request) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user?.email || !isMasterDashboardUser(user.email)) {
        return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    let body: { userId?: string | null } = {};
    try {
        body = (await request.json()) as { userId?: string | null };
    } catch {
        return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
    }

    const userId = body.userId?.trim() || null;

    if (userId) {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();

        if (error || !profile) {
            return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }
    }

    const response = NextResponse.json({ ok: true, userId });

    if (userId) {
        response.cookies.set(MASTER_VIEW_AS_COOKIE, userId, {
            path: '/',
            sameSite: 'lax',
            maxAge: COOKIE_MAX_AGE_S,
        });
    } else {
        response.cookies.set(MASTER_VIEW_AS_COOKIE, '', {
            path: '/',
            sameSite: 'lax',
            maxAge: 0,
        });
    }

    return response;
}
