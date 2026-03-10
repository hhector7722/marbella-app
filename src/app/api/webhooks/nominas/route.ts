import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
    try {
        // 1. Validación del Token de Google Apps Script
        const authHeader = req.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Cliente Supabase en Runtime (Service Role para saltar RLS en la subida)
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // 3. Recepción del payload crudo
        // Soporta dos métodos: codigo_empleado (legacy) o dni (extracción desde PDF)
        const body = await req.json();
        const { fileBase64, filename, codigo_empleado, dni, mes, year } = body;

        const has = (v: unknown) => v != null && String(v).trim() !== '';
        if (!has(fileBase64) || !has(filename) || !has(mes) || !has(year)) {
            return NextResponse.json({ error: 'Faltan parámetros requeridos (fileBase64, filename, mes, year). Además se necesita codigo_empleado O dni.' }, { status: 400 });
        }
        if (!has(codigo_empleado) && !has(dni)) {
            return NextResponse.json({ error: 'Se requiere codigo_empleado o dni para identificar al empleado.' }, { status: 400 });
        }

        // 4. Buscar perfil por codigo_empleado (prioridad) o por dni (extracción desde PDF)
        let profile: { id: string; codigo_empleado?: string | null } | null = null;

        if (has(codigo_empleado)) {
            const r = await supabase.from('profiles').select('id, codigo_empleado').eq('codigo_empleado', codigo_empleado).single();
            profile = r.data ?? null;
            if (r.error) return NextResponse.json({ error: `Empleado con código ${codigo_empleado} no encontrado.` }, { status: 404 });
        }
        if (!profile && has(dni)) {
            const dniNorm = String(dni).trim().toUpperCase().replace(/[\s\-\.]/g, '');
            const { data: profiles } = await supabase.from('profiles').select('id, codigo_empleado, dni');
            profile = (profiles ?? []).find(p => p.dni && String(p.dni).toUpperCase().replace(/[\s\-\.]/g, '') === dniNorm) ?? null;
            if (!profile) return NextResponse.json({ error: `Empleado con DNI ${dni} no encontrado. Verifica que profiles.dni coincida.` }, { status: 404 });
        }

        if (!profile) return NextResponse.json({ error: 'No se pudo identificar al empleado.' }, { status: 404 });

        const pathPrefix = has(codigo_empleado) ? codigo_empleado : (profile.codigo_empleado ?? profile.id);
        const buffer = Buffer.from(fileBase64, 'base64');
        const filePath = `${pathPrefix}/${year}/${mes}_${filename}`;

        const { error: uploadError } = await supabase.storage
            .from('nominas')
            .upload(filePath, buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // 6. Guardar referencia en BD (Sin publicUrl porque el bucket es privado)
        const codigoParaInsert = has(codigo_empleado) ? codigo_empleado : (profile.codigo_empleado ?? profile.id);
        const { error: dbError } = await supabase
            .from('employee_documents')
            .insert({
                user_id: profile.id,
                codigo_empleado: codigoParaInsert,
                tipo: 'nomina',
                mes: mes,
                year: Number(year),
                filename: filename,
                storage_path: filePath
            });

        if (dbError) throw dbError;

        return NextResponse.json({ success: true, message: 'Nómina procesada' });

    } catch (error: any) {
        console.error('Webhook Error Crítico:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
