import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

const PRIVATE_MANUAL_PATHS = new Set(['operacion/cobros.mp4']);

export async function GET(request: Request) {
    const path = new URL(request.url).searchParams.get('path');

    if (!path || !PRIVATE_MANUAL_PATHS.has(path)) {
        return NextResponse.json({ error: 'Vídeo no encontrado' }, { status: 404 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data, error } = await supabase.storage
        .from('manuales-privados')
        .createSignedUrl(path, 5 * 60);

    if (error || !data?.signedUrl) {
        console.error('manuales/video signed URL:', error);
        return NextResponse.json({ error: 'No se pudo abrir el vídeo' }, { status: 500 });
    }

    return NextResponse.redirect(data.signedUrl, {
        status: 307,
        headers: {
            'Cache-Control': 'private, no-store, max-age=0',
        },
    });
}
