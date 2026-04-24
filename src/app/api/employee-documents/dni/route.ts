import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
    try {
        const supabase = await createClient();
        const {
            data: { user },
        } = await supabase.auth.getUser();
        if (!user) return NextResponse.json({ success: false, error: 'No autenticado' }, { status: 401 });

        const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (me?.role !== 'manager') {
            return NextResponse.json({ success: false, error: 'Sin permiso' }, { status: 403 });
        }

        const formData = await req.formData();
        const ownerUserId = String(formData.get('ownerUserId') ?? '');
        const file = formData.get('dni_image') as File | null;

        if (!UUID_RE.test(ownerUserId)) {
            return NextResponse.json({ success: false, error: 'Empleado no válido' }, { status: 400 });
        }
        if (!file || typeof file.size !== 'number' || file.size === 0) {
            return NextResponse.json({ success: false, error: 'No se ha seleccionado ninguna imagen' }, { status: 400 });
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
            return NextResponse.json({ success: false, error: 'Formato no permitido' }, { status: 400 });
        }
        if (file.size > 5 * 1024 * 1024) {
            return NextResponse.json({ success: false, error: 'La imagen no puede superar 5 MB' }, { status: 400 });
        }

        const ts = Date.now();
        const storagePath = `${ownerUserId}/dni/dni_${ts}.${ext}`;
        const bucket = 'employee-documents';

        // 1) Subir archivo (sin upsert) y borrar anteriores.
        const { error: uploadError } = await supabase.storage.from(bucket).upload(storagePath, file, { upsert: false });
        if (uploadError) {
            console.error('dni upload error:', uploadError);
            return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
        }

        const { data: existingObjects } = await supabase.storage.from(bucket).list(`${ownerUserId}/dni`, { limit: 100 });
        const toRemove =
            existingObjects
                ?.filter((o) => o.name !== `dni_${ts}.${ext}`)
                .map((o) => `${ownerUserId}/dni/${o.name}`) ?? [];
        if (toRemove.length > 0) {
            await supabase.storage.from(bucket).remove(toRemove);
        }

        // 2) Guardar metadata en DB (service role para evitar sorpresas de RLS).
        if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
            return NextResponse.json({ success: false, error: 'Configuración incompleta' }, { status: 500 });
        }

        const admin = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { persistSession: false },
        });

        const { data: targetProfile, error: targetErr } = await admin
            .from('profiles')
            .select('codigo_empleado')
            .eq('id', ownerUserId)
            .single();

        if (targetErr) {
            console.error('dni doc target profile error:', targetErr);
            return NextResponse.json({ success: false, error: 'Empleado no encontrado' }, { status: 404 });
        }

        const codigoEmpleado = (targetProfile as any)?.codigo_empleado ?? ownerUserId;

        // Mantener 1 fila "actual": borrar la última referencia si existía (idempotencia).
        const { data: oldRows } = await admin
            .from('employee_documents')
            .select('id, storage_path')
            .eq('user_id', ownerUserId)
            .eq('tipo', 'dni')
            .order('created_at', { ascending: false })
            .limit(10);

        if (oldRows?.length) {
            await admin.from('employee_documents').delete().in('id', oldRows.map((r: any) => r.id));
        }

        const filename = file.name || `dni_${ts}.${ext}`;
        const { data: inserted, error: insErr } = await admin
            .from('employee_documents')
            .insert({
                user_id: ownerUserId,
                codigo_empleado: codigoEmpleado,
                tipo: 'dni',
                mes: null,
                year: null,
                filename,
                storage_path: storagePath,
                public_url: null,
            })
            .select('id, storage_path, filename')
            .single();

        if (insErr || !inserted) {
            console.error('dni doc insert error:', insErr);
            return NextResponse.json({ success: false, error: insErr?.message ?? 'Error guardando el documento' }, { status: 500 });
        }

        return NextResponse.json({ success: true, doc: inserted });
    } catch (e) {
        console.error('dni upload route error:', e);
        return NextResponse.json({ success: false, error: 'Error al subir' }, { status: 500 });
    }
}

