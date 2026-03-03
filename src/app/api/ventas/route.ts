import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Inicialización de Supabase
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// EL NOMBRE DEBE SER "POST" EN MAYÚSCULAS
export async function POST(request: Request) {
    console.log("📥 Petición POST recibida en /api/ventas");

    try {
        const body = await request.json();
        const { ventas } = body;

        if (!ventas || !Array.isArray(ventas)) {
            return NextResponse.json({ error: 'Body malformado' }, { status: 400 });
        }

        for (const v of ventas) {
            // 1. Cabecera
            const { error: headError } = await supabase
                .from('ticket_cabecera_marbella')
                .upsert({
                    id: v.Numero_Documento,
                    fecha: v.Fecha,
                    total: v.Total_Documento,
                    tpv: v.Numero_Documento.startsWith('00001') ? 1 : 2
                });

            if (headError) throw headError;

            // 2. Líneas
            if (v.lineas && v.lineas.length > 0) {
                const lineasParaInsertar = v.lineas.map((l: any) => ({
                    ticket_id: v.Numero_Documento,
                    articulo_id: parseInt(l.Articulo),
                    unidades: l.Unidades,
                    precio_unitario: l.Precio,
                    total_linea: (l.Unidades || 0) * (l.Precio || 0)
                }));

                const { error: lineError } = await supabase
                    .from('ticket_lines_marbella')
                    .insert(lineasParaInsertar);

                if (lineError) throw lineError;
            }
        }

        return NextResponse.json({ success: true, message: "Tickets procesados" }, { status: 200 });

    } catch (error: any) {
        console.error('🔥 ERROR CRÍTICO API:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

// Opcional: Para evitar errores 405 si alguien entra por navegador
export async function GET() {
    return NextResponse.json({ message: "Endpoint activo. Esperando POST." });
}