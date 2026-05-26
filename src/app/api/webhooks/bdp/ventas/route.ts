import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const TZ_MADRID = 'Europe/Madrid'

function parseIso(value: unknown): Date | null {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  return Number.isNaN(d.getTime()) ? null : d
}

function ymdMadrid(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_MADRID,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/** UTC puro en Supabase; diaNegocio solo para logs (Madrid). */
function resolveVentaTimestamps(v: {
  fecha?: string
  fecha_sistema?: string
  hora_cierre?: string
}) {
  const instant = parseIso(v.fecha_sistema) || parseIso(v.fecha) || new Date()

  return {
    fecha: instant.toISOString(),
    hora_cierre: new Date().toISOString(),
    fecha_real: new Date().toISOString(),
    diaNegocio: ymdMadrid(instant),
  }
}

export async function POST(req: Request) {
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
      const ts = resolveVentaTimestamps(v)
      const cobroEfectivo = roundMoney(Number(v.cobro_efectivo) || 0)
      const cobroTarjeta = roundMoney(Number(v.cobro_tarjeta) || 0)
      const cobroPendiente = roundMoney(Number(v.cobro_pendiente) || 0)

      const { error: errCab } = await supabase.from('tickets_marbella').upsert(
        [
          {
            numero_documento: v.numero_documento,
            mesa: v.mesa || 0,
            total_documento: v.total_documento,
            cobro_efectivo: cobroEfectivo,
            cobro_tarjeta: cobroTarjeta,
            cobro_pendiente: cobroPendiente,
            fecha: ts.fecha,
            hora_cierre: ts.hora_cierre,
            fecha_real: ts.fecha_real,
          },
        ],
        { onConflict: 'numero_documento' }
      )

      if (errCab) {
        console.error(`[BDP Webhook] Error cabecera ${v.numero_documento}:`, errCab.message)
        continue
      }

      if (v.lineas && v.lineas.length > 0) {
        const lineasTransformadas = v.lineas.map(
          (
            l: {
              articulo_id: number
              nombre: string
              unidades: number
              precio: number
            },
            index: number
          ) => ({
            numero_documento: v.numero_documento,
            linea: index + 1,
            articulo_id: l.articulo_id,
            nombre: l.nombre,
            unidades: l.unidades,
            precio_unidad: l.precio,
            importe_total: l.unidades * l.precio,
            fecha_negocio: ts.fecha,
            fecha_real: ts.fecha_real,
          })
        )

        const { error: errLin } = await supabase.from('ticket_lines_marbella').upsert(
          lineasTransformadas,
          { onConflict: 'numero_documento, linea' }
        )
        if (errLin) {
          console.error(`[BDP Webhook] Error líneas de ${v.numero_documento}:`, errLin.message)
        }
      }

      const numeroDocStr = String(v.numero_documento)

      if (Number(v.total_documento) >= 0) {
        const { error: ledgerErr } = await supabase.rpc('process_ticket_stock_deduction', {
          p_numero_documento: numeroDocStr,
        })
        if (ledgerErr) {
          console.error(`[LEDGER] Error deduciendo ticket ${numeroDocStr}:`, ledgerErr.message)
        }
      } else {
        const { error: refundErr } = await supabase.rpc('revert_ticket_stock_deduction', {
          p_numero_documento: numeroDocStr,
        })
        if (refundErr) {
          console.error(`[LEDGER] Error reintegrando ticket ${numeroDocStr}:`, refundErr.message)
        }
      }
    }

    return NextResponse.json({ success: true, processed: ventas.length })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[BDP Webhook Ventas] Error crítico:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
