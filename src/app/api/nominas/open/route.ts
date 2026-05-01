import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bucketForStoragePath(storagePath: string, hasLegacyRow: boolean): 'nominas' | 'employee-documents' {
    // Fuente de verdad:
    // - Si existe fila en tabla legacy `public.nominas`, el PDF está en bucket `nominas`.
    // - Si solo existe en `employee_documents`, puede estar en `employee-documents` (manual) o `nominas` (espejo del webhook).
    // Heurística consistente con `fetchNominasListForUser`:
    // - Subidas manuales usan "<userId>/nominas/..." en bucket `employee-documents`.
    if (hasLegacyRow) return 'nominas';
    if (storagePath.includes('/nominas/')) return 'employee-documents';
    return 'nominas';
}

/**
 * Sirve el PDF de una nómina en el dominio de la app (visor nativo del navegador en nueva pestaña),
 * sin redirigir a la URL firmada de Supabase en la barra de direcciones.
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const ownerUserId = searchParams.get('owner');
    const storagePath = searchParams.get('path');

    if (!ownerUserId || !storagePath) {
        return NextResponse.json({ error: 'Parámetros incompletos' }, { status: 400 });
    }
    if (!UUID_RE.test(ownerUserId)) {
        return NextResponse.json({ error: 'Parámetro no válido' }, { status: 400 });
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

    const { data: ed } = await admin
        .from('employee_documents')
        .select('id')
        .eq('user_id', ownerUserId)
        .eq('storage_path', storagePath)
        .eq('tipo', 'nomina')
        .maybeSingle();

    const { data: leg } = await admin
        .from('nominas')
        .select('id')
        .eq('empleado_id', ownerUserId)
        .eq('file_path', storagePath)
        .maybeSingle();

    if (!ed && !leg) {
        return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
    }

    const bucket = bucketForStoragePath(storagePath, Boolean(leg));
    const { data: fileData, error: dlError } = await admin.storage.from(bucket).download(storagePath);

    if (dlError || !fileData) {
        console.error('nominas/open download:', dlError);
        return NextResponse.json({ error: dlError?.message ?? 'No se pudo leer el archivo' }, { status: 500 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const baseName = storagePath.split('/').pop() || 'nomina.pdf';
    const safeName = baseName.replace(/[^\w.\-]/g, '_');

    return new NextResponse(arrayBuffer, {
        status: 200,
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `inline; filename="${safeName}"`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
