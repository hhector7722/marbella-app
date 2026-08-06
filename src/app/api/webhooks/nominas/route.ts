import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { processIndividualPayroll } from '@/lib/payroll/individual-payroll-service';

function getServiceSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
        throw new Error('supabaseKey is required.');
    }
    return createClient(url, key);
}

export async function POST(request: Request) {
    try {
        const supabase = getServiceSupabase();
        const authHeader = request.headers.get('authorization');
        if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { fileBase64, filename, emailDate, extractedDni } = await request.json();

        if (!fileBase64 || !filename) {
            return NextResponse.json({ error: 'Payload incompleto' }, { status: 400 });
        }

        const pdfBuffer = Buffer.from(fileBase64, 'base64');
        
        const result = await processIndividualPayroll(
            pdfBuffer,
            filename,
            emailDate,
            extractedDni,
            supabase
        );

        if (!result.success) {
            // Mapping existing status codes based on error message
            let status = 422;
            if (result.error?.includes('DNI')) status = 422;
            if (result.error?.includes('en perfiles activos')) status = 404;
            if (result.error?.includes('Internal') || result.error?.includes('Fallo')) status = 500;
            
            return NextResponse.json(
                { error: result.error, details: result.details }, 
                { status }
            );
        }

        return NextResponse.json({
            success: true,
            empleado: result.empleado,
            dni: result.dni,
            periodo: result.periodo
        }, { status: 200 });

    } catch (error: any) {
        console.error('Error procesando nómina:', error);
        return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
    }
}