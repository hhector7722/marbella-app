import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TIPOS = new Set(['comunicado', 'contrato', 'sancion']);

function bucketForPath(storagePath: string): 'nominas' | 'employee-documents' {
    if (storagePath.includes('/nominas/')) return 'employee-documents';
    return 'nominas';
}

function mimeForFilename(name: string): { contentType: string; inline: boolean } {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    switch (ext) {
        case 'pdf':
            return { contentType: 'application/pdf', inline: true };
        case 'jpg':
        case 'jpeg':
            return { contentType: 'image/jpeg', inline: true };
        case 'png':
            return { contentType: 'image/png', inline: true };
        case 'webp':
            return { contentType: 'image/webp', inline: true };
        case 'gif':
            return { contentType: 'image/gif', inline: true };
        case 'doc':
            return { contentType: 'application/msword', inline: true };
        case 'docx':
            return {
                contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                inline: true,
            };
        default:
            return { contentType: 'application/octet-stream', inline: false };
    }
}

/**
 * Sirve comunicados, contratos o sanciones desde el dominio de la app (nueva pestaña),
 * sin exponer la URL de Supabase Storage en la barra de direcciones.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ownerUserId = searchParams.get('owner');
    const storagePath = searchParams.get('path');
    const tipo = searchParams.get('tipo');

    if (!ownerUserId || !storagePath || !tipo) {
        return NextResponse.json({ error: 'Parámetros incompletos' }, { status: 400 });
    }
    if (!UUID_RE.test(ownerUserId)) {
        return NextResponse.json({ error: 'Parámetro no válido' }, { status: 400 });
    }
    if (!ALLOWED_TIPOS.has(tipo)) {
        return NextResponse.json({ error: 'Tipo no válido' }, { status: 400 });
    }
    if (storagePath.includes('..') || storagePath.startsWith('/')) {
        return NextResponse.json({ error: 'Ruta no permitida' }, { status: 400 });
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

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return NextResponse.json({ error: 'Configuración incompleta' }, { status: 500 });
    }

    const admin = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { persistSession: false } }
    );

    const { data: row, error: rowErr } = await admin
        .from('employee_documents')
        .select('id')
        .eq('user_id', ownerUserId)
        .eq('storage_path', storagePath)
        .eq('tipo', tipo)
        .maybeSingle();

    if (rowErr || !row) {
        return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const bucket = bucketForPath(storagePath);
    const { data: fileData, error: dlError } = await admin.storage.from(bucket).download(storagePath);

    if (dlError || !fileData) {
        console.error('employee-documents/open download:', dlError);
        return NextResponse.json({ error: dlError?.message ?? 'No se pudo leer el archivo' }, { status: 500 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const baseName = storagePath.split('/').pop() || 'documento';
    const safeName = baseName.replace(/[^\w.\-]/g, '_');
    const { contentType, inline } = mimeForFilename(baseName);

    return new NextResponse(arrayBuffer, {
        status: 200,
        headers: {
            'Content-Type': contentType,
            'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
