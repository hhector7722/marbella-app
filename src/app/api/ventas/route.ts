import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Inicialización del cliente de Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { ventas } = await request.json();

        for (const v of ventas) {
            // 1. Insertar Cabecera
            await supabase.from('tickets_marbella').upsert({
                numero_documento: v.Numero_Documento,
                fecha: v.Fecha,
                hora_cierre: v.Hora_Cierre,
                total_documento: v.Total_Documento
            });

            // 2. Insertar Líneas mapeando a tu esquema SQL real
            if (v.lineas && v.lineas.length > 0) {
                const lineasParaInsertar = v.lineas.map((l: any) => ({
                    numero_documento: v.Numero_Documento,
                    linea: l.Linea,
                    articulo_id: parseInt(l.Articulo),
                    unidades: l.Unidades,
                    precio_unitario: l.Precio,      // Columna de tu SQL
                    importe_total: l.Total,         // Columna de tu SQL
                    fecha_negocio: v.Fecha
                }));

                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .upsert(lineasParaInsertar, { onConflict: 'numero_documento, linea' });

                if (lineError) throw lineError;
            }
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('ERROR API:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}