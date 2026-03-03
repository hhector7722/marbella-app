import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Usa la Service Role para bypass de RLS
);

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { ventas } = body;

        if (!ventas || !Array.isArray(ventas)) {
            return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
        }

        for (const v of ventas) {
            // 1. Insertar o actualizar la cabecera
            await supabase.from('ticket_cabecera_marbella').upsert({
                id: v.Numero_Documento,
                fecha: v.Fecha,
                total: v.Total_Documento,
                tpv: v.Numero_Documento.startsWith('00001') ? 1 : 2
            });

            // 2. Insertar las líneas
            if (v.lineas && v.lineas.length > 0) {
                const lineasParaInsertar = v.lineas.map((l: any) => ({
                    ticket_id: v.Numero_Documento,
                    articulo_id: parseInt(l.Articulo), // El PLU que extraemos
                    unidades: l.Unidades,
                    precio_unitario: l.Precio,
                    total_linea: l.Total
                }));

                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .insert(lineasParaInsertar);

                if (lineError) throw lineError;
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error('ERROR EN API VENTAS:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}