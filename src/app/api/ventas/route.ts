import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// 1. Inicialización del cliente (Asegúrate de tener estas variables en Vercel)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // USA ESTA PARA BYPASS DE RLS
);

export async function POST(request: Request) {
  try {
    const { ventas } = await request.json();

    for (const v of ventas) {
      // 2. Insertar Cabecera (tickets_marbella)
      const { error: headError } = await supabase.from('tickets_marbella').upsert({
        numero_documento: v.Numero_Documento,
        fecha: v.Fecha,
        hora_cierre: v.Hora_Cierre,
        total_documento: parseFloat(v.Total_Documento)
      });

      if (headError) {
        console.error('❌ Error Cabecera:', headError.message);
        continue;
      }

      // 3. Insertar Líneas (ticket_lines_marbella)
      if (v.lineas && v.lineas.length > 0) {
        const lineasParaInsertar = v.lineas.map((l: any) => ({
          numero_documento: v.Numero_Documento,
          linea: parseInt(l.Linea),
          articulo_id: parseInt(l.Articulo),
          unidades: parseFloat(l.Unidades),
          precio_unidad: parseFloat(l.Precio),
          importe_total: parseFloat(l.Total),
          fecha_negocio: v.Fecha
        }));

        const { error: lineError } = await supabase
          .from('ticket_lines_marbella')
          .upsert(lineasParaInsertar, { onConflict: 'numero_documento, linea' });
        
        if (lineError) console.error('❌ Error Líneas:', lineError.message);
      }
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error('🔥 Error General API:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}