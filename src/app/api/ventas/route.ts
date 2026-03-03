import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { ventas } = body;

        for (const v of ventas) {
            // 1. CABECERAS: Mapeo exacto a public.tickets_marbella
            const { error: headError } = await supabase
                .from('tickets_marbella')
                .upsert({
                    numero_documento: v.Numero_Documento, // PK
                    fecha: v.Fecha,
                    hora_cierre: v.Hora_Cierre,
                    total_documento: v.Total_Documento
                });

            if (headError) throw headError;

            // 2. LÍNEAS: Mapeo exacto a public.ticket_lines_marbella
            if (v.lineas && v.lineas.length > 0) {
                const lineasParaInsertar = v.lineas.map((l: any) => ({
                    numero_documento: v.Numero_Documento, // FK
                    linea: l.Linea,
                    articulo_id: parseInt(l.Articulo), // PLU -> articulo_id
                    unidades: l.Unidades,
                    precio_unidad: l.Precio,
                    importe_total: (l.Unidades || 0) * (l.Precio || 0),
                    fecha_negocio: v.Fecha
                }));

                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .upsert(lineasParaInsertar, { onConflict: 'numero_documento, linea' });

                if (lineError) throw lineError;
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });

    } catch (error: any) {
        console.error('🔥 ERROR ESQUEMA:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function GET() {
    return NextResponse.json({ message: "Endpoint activo" });
}