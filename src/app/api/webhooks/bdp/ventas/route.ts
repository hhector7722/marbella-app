import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const timestampReal = new Date().toISOString()
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) throw new Error('Credenciales de base de datos faltantes')

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json()
    const ventas = body.ventas || []

    if (!ventas.length) return NextResponse.json({ error: 'Vacío' }, { status: 400 })

    for (const v of ventas) {
      // 1. Upsert Cabecera
      const { error: errCab } = await supabase.from('tickets_marbella').upsert([{
        numero_documento: v.numero_documento,
        mesa: v.mesa || 0,
        total_documento: v.total_documento,
        fecha: v.fecha, // Conservamos la de BDP por trazabilidad forense
        hora_cierre: v.fecha,
        fecha_real: timestampReal,
      }], { onConflict: 'numero_documento' })

      if (errCab) {
        console.error(`[BDP Webhook] Error cabecera ${v.numero_documento}:`, errCab.message)
        continue
      }

      // 2. Upsert Líneas
      if (v.lineas && v.lineas.length > 0) {
        const lineasTransformadas = v.lineas.map((l: any, index: number) => ({
          numero_documento: v.numero_documento,
          linea: index + 1,
          articulo_id: l.articulo_id,
          unidades: l.unidades,
          precio_unidad: l.precio,
          importe_total: l.unidades * l.precio,
          fecha_negocio: v.fecha,
          fecha_real: timestampReal,
        }))

        const { error: errLin } = await supabase.from('ticket_lines_marbella').upsert(
          lineasTransformadas,
          { onConflict: 'numero_documento, linea' }
        )
        if (errLin) console.error(`[BDP Webhook] Error líneas de ${v.numero_documento}:`, errLin.message)
      }

      // 3. 💥 DISPARO AL LEDGER DE INVENTARIO 💥
      const numeroDocStr = String(v.numero_documento)
      
      if (Number(v.total_documento) >= 0) {
        // Venta Normal: Deducir Stock
        const { error: ledgerErr } = await supabase.rpc('process_ticket_stock_deduction', {
          p_numero_documento: numeroDocStr
        })
        if (ledgerErr) console.error(`[LEDGER] Error deduciendo ticket ${numeroDocStr}:`, ledgerErr.message)
      } else {
        // Ticket Negativo (Abono/Anulación): Reintegrar Stock
        const { error: refundErr } = await supabase.rpc('revert_ticket_stock_deduction', {
          p_numero_documento: numeroDocStr
        })
        if (refundErr) console.error(`[LEDGER] Error reintegrando ticket ${numeroDocStr}:`, refundErr.message)
      }
    }

    return NextResponse.json({ success: true, processed: ventas.length })
  } catch (error: any) {
    console.error('[BDP Webhook Ventas] Error crítico:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
