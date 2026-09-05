import { NextResponse } from 'next/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@/utils/supabase/server';
import {
    PERSONAL_DOCUMENT_IMAGE_EXTS,
    personalDocumentFilePattern,
    personalDocumentSlug,
} from '@/lib/profile/personal-document-slug';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resuelve las imágenes del documento de un empleado ubicadas en `/public/personal/`.
 *
 * El nombre del archivo es `<slug>-delantera.<ext>` y opcionalmente `<slug>-trasera.<ext>`,
 * donde el slug deriva del nombre completo del empleado (ver `personal-document-slug.ts`).
 * Puede haber una sola imagen (solo "delantera") o dos (delantera + trasera); un "trasera"
 * ausente no es un error.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ownerUserId = searchParams.get('owner');

    if (!ownerUserId || !UUID_RE.test(ownerUserId)) {
        return NextResponse.json({ error: 'Parámetro no válido' }, { status: 400 });
    }

    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    const isElevated = me?.role === 'manager' || me?.role === 'supervisor';
    const isOwn = user.id === ownerUserId;
    if (!isOwn && !isElevated) {
        return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    const { data: ownerProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name')
        .eq('id', ownerUserId)
        .single();

    if (!ownerProfile) {
        return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    const slug = personalDocumentSlug(ownerProfile.first_name ?? '', ownerProfile.last_name ?? '');
    const patterns = personalDocumentFilePattern(slug);

    const dir = join(process.cwd(), 'public', 'personal');
    let files: string[] = [];
    try {
        files = readdirSync(dir);
    } catch {
        return NextResponse.json({ delantera: null, trasera: null });
    }

    const bySide: Record<string, string | null> = { delantera: null, trasera: null };
    for (const pattern of patterns) {
        const hit = files.find((f) => {
            const dot = f.lastIndexOf('.');
            if (dot <= 0) return false;
            const name = f.slice(0, dot);
            const ext = f.slice(dot + 1).toLowerCase();
            return name === pattern.base && PERSONAL_DOCUMENT_IMAGE_EXTS.has(ext);
        });
        if (hit) bySide[pattern.side] = `/personal/${hit}`;
    }

    return NextResponse.json({ delantera: bySide.delantera, trasera: bySide.trasera });
}