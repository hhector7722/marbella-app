import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const getClient = () => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'mock-url',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'mock-key' // BYPASS DE RLS
);

export async function POST(request: Request) {
    try {
        const supabase = getClient();
        const body = await request.json();
        const ventas = body.ventas || [];

        for (const v of ventas) {
            // 1. Insertar Cabecera (Soportamos minúsculas del nuevo agente)
            const numeroDoc = v.numero_documento || v.Numero_Documento;
            const totalDoc = parseFloat(v.total_documento || v.Total_Documento || 0);

            // Si el agente no manda la fecha (porque la quitamos del SELECT), usamos la del servidor
            const fechaDoc = v.fecha || v.Fecha || new Date().toISOString().split('T')[0];

            const { error: headError } = await supabase.from('tickets_marbella').upsert({
                numero_documento: numeroDoc,
                fecha: fechaDoc,
                hora_cierre: v.hora_cierre || v.Hora_Cierre || null,
                total_documento: totalDoc
            }, { onConflict: 'numero_documento' });

            if (headError) {
                console.error(`❌ Error Cabecera [${numeroDoc}]:`, headError.message);
                continue; // Abortar este ticket si la cabecera falla
            }

            // 2. Insertar Líneas: AGRUPACIÓN ESTRICTA
            const lineasCrudas = v.lineas || [];
            if (lineasCrudas.length > 0) {

                // Diccionario para consolidar productos repetidos y evitar el error "second time"
                const lineasAgrupadas: Record<string, any> = {};

                lineasCrudas.forEach((l: any) => {
                    const idArticulo = l.articulo_id || l.Articulo;
                    const cantidad = parseFloat(l.unidades || l.Unidades || 0);
                    const precioUnitario = parseFloat(l.precio || l.Precio || 0);

                    if (!lineasAgrupadas[idArticulo]) {
                        lineasAgrupadas[idArticulo] = {
                            articulo_id: parseInt(idArticulo),
                            unidades: cantidad,
                            precio_unidad: precioUnitario
                        };
                    } else {
                        // Si el camarero picó 2 veces el mismo producto, sumamos las unidades
                        lineasAgrupadas[idArticulo].unidades += cantidad;
                    }
                });

                // 3. Mapeo final a Supabase generando un secuencial de línea puro
                const lineasParaInsertar = Object.values(lineasAgrupadas).map((l: any, index: number) => ({
                    numero_documento: numeroDoc,
                    linea: index + 1, // Garantiza unicidad en Postgres (1, 2, 3...)
                    articulo_id: l.articulo_id,
                    unidades: l.unidades,
                    precio_unidad: l.precio_unidad,
                    importe_total: l.unidades * l.precio_unidad, // Calculado en backend
                    fecha_negocio: fechaDoc
                }));

                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .upsert(lineasParaInsertar, { onConflict: 'numero_documento, linea' });

                if (lineError) {
                    console.error(`❌ Error Líneas [${numeroDoc}]:`, lineError.message);
                }
            }
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error: any) {
        console.error('🔥 Error General API Ventas:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}