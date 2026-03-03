import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
    try {
        const { ventas } = await request.json();

        for (const v of ventas) {
            // 1. INSERCIÓN DE CABECERA (Debe ser AWAIT total para cumplir la FK)
            const { error: headError } = await supabase.from('tickets_marbella').upsert({
                numero_documento: v.Numero_Documento, // PK
                fecha: v.Fecha,
                hora_cierre: v.Hora_Cierre,
                total_documento: parseFloat(v.Total_Documento)
            });

            if (headError) {
                console.error('❌ Error Cabecera:', headError.message);
                continue; // Si falla la cabecera, no intentamos las líneas
            }

            // 2. PREPARACIÓN Y LIMPIEZA DE LÍNEAS
            if (v.lineas && v.lineas.length > 0) {
                const lineasParaInsertar = v.lineas.map((l: any) => ({
                    numero_documento: v.Numero_Documento, // FK referenciada
                    linea: parseInt(l.Linea),             // integer
                    articulo_id: parseInt(l.Articulo),    // integer
                    unidades: parseFloat(l.Unidades),     // numeric
                    precio_unitario: parseFloat(l.Precio),// numeric
                    importe_total: parseFloat(l.Total),   // numeric
                    fecha_negocio: v.Fecha                // date
                }));

                // 3. INSERCIÓN DE LÍNEAS
                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .upsert(lineasParaInsertar, { onConflict: 'numero_documento, linea' });

                if (lineError) {
                    console.error('❌ Error Líneas:', lineError.message);
                } else {
                    console.log(`✅ Ticket ${v.Numero_Documento}: ${lineasParaInsertar.length} líneas guardadas.`);
                }
            }
        }
        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}