import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function trimStr(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

function toUtcIso(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const ms = value < 1e12 ? value * 1000 : value
    const d = new Date(ms)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const s = trimStr(value)
  if (!s) return ''
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** Verdad única UTC en radiografia_completa (ISO-8601 con Z). */
function resolveTimestampTpv(mesa: Record<string, unknown>): string {
  const canonical = toUtcIso(mesa.timestamp_tpv)
  if (canonical) return canonical

  const candidates: unknown[] = [
    mesa.fecha_apertura,
    mesa.Fecha_Apertura,
    mesa.timestampTpv,
    mesa.fechaApertura,
    mesa.horaApertura,
    mesa.Hora_Apertura,
    mesa.Hora,
    mesa.timestamp,
    mesa.fecha_hora,
    mesa.FechaHora,
  ]
  for (const c of candidates) {
    const iso = toUtcIso(c)
    if (iso) return iso
  }
  return ''
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    
    const { total_mesas_vivas, sala } = await req.json()
    if (!sala) return NextResponse.json({ success: true })

    const salaDisfrazada = sala.map((mesa: any) => {
      const ts = resolveTimestampTpv(mesa as Record<string, unknown>)
      const mesaNorm = {
        ...mesa,
        ...(ts ? { timestamp_tpv: ts } : {}),
        // Fuente de verdad del ticket en nuestros triggers KDS v2
        id_ticket: mesa.numero_documento,
        // Notas generales de la comanda (cabecera). Acepta alias por robustez ante cambios del extractor.
        notas_comanda:
          (typeof mesa?.notas_comanda === 'string' && mesa.notas_comanda.trim() !== ''
            ? mesa.notas_comanda.trim()
            : typeof mesa?.nota_cabecera1 === 'string' && mesa.nota_cabecera1.trim() !== ''
              ? mesa.nota_cabecera1.trim()
              : typeof mesa?.Nota_Cabecera1 === 'string' && mesa.Nota_Cabecera1.trim() !== ''
                ? mesa.Nota_Cabecera1.trim()
                : ''),
        // Nombre cliente: aseguramos string limpio (evita falsos vacíos)
        nombre_cliente:
          mesa.nombre_cliente && String(mesa.nombre_cliente).trim() !== ''
            ? String(mesa.nombre_cliente).trim()
            : '',
      } as any

      // Notas por artículo: algunas integraciones pueden cambiar el campo.
      if (Array.isArray(mesaNorm.productos)) {
        mesaNorm.productos = mesaNorm.productos.map((p: any) => ({
          ...p,
          notas:
            (typeof p?.notas === 'string' && p.notas.trim() !== ''
              ? p.notas.trim()
              : typeof p?.nota === 'string' && p.nota.trim() !== ''
                ? p.nota.trim()
                : typeof p?.observaciones === 'string' && p.observaciones.trim() !== ''
                  ? p.observaciones.trim()
                  : typeof p?.descripcion_auxiliar === 'string' && p.descripcion_auxiliar.trim() !== ''
                    ? p.descripcion_auxiliar.trim()
                    : ''),
        }))
      }

      return mesaNorm
    })

    const { error } = await supabase.from('estado_sala').upsert([{
      id: 1,
      ultima_actualizacion: new Date().toISOString(),
      mesas_activas: parseInt(total_mesas_vivas) || 0,
      radiografia_completa: salaDisfrazada
    }], { onConflict: 'id' })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[BDP Webhook Telemetria] Error crítico:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
