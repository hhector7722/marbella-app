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
        const body = await req.json();
        const { fileBase64, filename, codigo_empleado, mes, year } = body;

        const has = (v: unknown) => v != null && String(v).trim() !== '';
        if (!has(fileBase64) || !has(filename) || !has(codigo_empleado) || !has(mes) || !has(year)) {
            return NextResponse.json({ error: 'Faltan parámetros requeridos (fileBase64, filename, codigo_empleado, mes, year)' }, { status: 400 });
        }

        // 4. Validar que el perfil existe en BDP
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('codigo_empleado', codigo_empleado)
            .single();

        if (profileError || !profile) {
            return NextResponse.json({ error: `Empleado con código ${codigo_empleado} no encontrado.` }, { status: 404 });
        }

        // 5. Decodificar Base64 y subir a Supabase Storage
        const buffer = Buffer.from(fileBase64, 'base64');
        const filePath = `${codigo_empleado}/${year}/${mes}_${filename}`;

        const { error: uploadError } = await supabase.storage
            .from('nominas')
            .upload(filePath, buffer, {
                contentType: 'application/pdf',
                upsert: true
            });

        if (uploadError) throw uploadError;

        // 6. Generar URL Pública y guardar referencia en BD
        const { data: { publicUrl } } = supabase.storage.from('nominas').getPublicUrl(filePath);

        const { error: dbError } = await supabase
            .from('employee_documents')
            .insert({
                user_id: profile.id,
                type: 'payroll',
                file_name: filename,
                file_path: filePath,
                period: `${mes} ${year}`
            });

        if (dbError) throw dbError;

        return NextResponse.json({ success: true, message: 'Nómina procesada' });

    } catch (error: any) {
        console.error('Webhook Error Crítico:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
