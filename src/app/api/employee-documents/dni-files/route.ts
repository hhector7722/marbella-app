import { NextResponse } from 'next/server';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@/utils/supabase/server';
import { canOpenPersonalDocument } from '@/lib/staff/personal-documents-access';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { ALTA_BUCKET } from '@/lib/alta-laboral/storage.ts';
import {
    PERSONAL_DOCUMENT_IMAGE_EXTS,
    personalDocumentFilePattern,
    personalDocumentSlug,
} from '@/lib/profile/personal-document-slug';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function openUrl(ownerUserId: string, storagePath: string): string {
    const params = new URLSearchParams({
        owner: ownerUserId,
        path: storagePath,
        tipo: 'dni',
    });
    return `/api/employee-documents/open?${params.toString()}`;
}

function sideFromName(name: string): 'delantera' | 'trasera' | null {
    const base = name.replace(/\.[^.]+$/, '').toLowerCase();
    if (base === 'delantera' || base.endsWith('-delantera')) return 'delantera';
    if (base === 'trasera' || base.endsWith('-trasera')) return 'trasera';
    if (base.startsWith('dni_')) return 'delantera';
    return null;
}

/**
 * Resuelve las imágenes del documento: primero el contenedor privado,
 * después el legado `/public/personal/` (D29).
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
    if (!canOpenPersonalDocument(me?.role, user.id, ownerUserId)) {
        return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
    }

    const bySide: Record<'delantera' | 'trasera', string | null> = { delantera: null, trasera: null };

    try {
        const admin = createAltaServiceClient();
        const { data: objects } = await admin.storage.from(ALTA_BUCKET).list(`${ownerUserId}/dni`, {
            limit: 50,
        });
        for (const object of objects ?? []) {
            const side = sideFromName(object.name);
            if (!side || bySide[side]) continue;
            bySide[side] = openUrl(ownerUserId, `${ownerUserId}/dni/${object.name}`);
        }
    } catch {
        // Sin servicio o sin carpeta: se cae al legado público.
    }

    if (bySide.delantera || bySide.trasera) {
        return NextResponse.json(bySide);
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
