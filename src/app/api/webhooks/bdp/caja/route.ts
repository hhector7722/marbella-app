import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import type { Json } from '@/types/supabase'

type CajaMovementPayload = {
  fecha_negocio?: string
  movement_date?: string
  concept_code?: number
  amount?: number
  raw_json?: Record<string, unknown>
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Credenciales de base de datos faltantes')
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const body = await req.json()
    const movimientos: CajaMovementPayload[] = body.movimientos || body.movements || []

    if (!movimientos.length) {
      return NextResponse.json({ error: 'Vacío' }, { status: 400 })
    }

    const rows = movimientos
      .map((m) => {
        const amount = roundMoney(Number(m.amount) || 0)
        const conceptCode = Number(m.concept_code)
        const movementDate = m.movement_date
        const fechaNegocio = m.fecha_negocio
        if (!movementDate || !fechaNegocio || !Number.isFinite(conceptCode) || amount === 0) {
          return null
        }
        return {
          fecha_negocio: fechaNegocio,
          movement_date: movementDate,
          concept_code: conceptCode,
          amount,
          raw_json: (m.raw_json ?? m) as Json,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    if (!rows.length) {
      return NextResponse.json({ error: 'Sin filas válidas' }, { status: 400 })
    }

    const { error } = await supabase.from('bdp_cash_movements').upsert(rows, {
      onConflict: 'movement_date,concept_code,amount',
      ignoreDuplicates: true,
    })

    if (error) {
      console.error('[BDP Webhook Caja] Error insert:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      received: movimientos.length,
      inserted_candidates: rows.length,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[BDP Webhook Caja] Error crítico:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
