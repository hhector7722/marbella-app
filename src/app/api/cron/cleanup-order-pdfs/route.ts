import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

const BUCKET = 'orders'
const CHUNK = 100

/** PDFs de pedidos a proveedores: se eliminan del bucket pasada 1 semana; `pdf_url` en BD se anula. */
export async function GET(request: NextRequest) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    console.error('[CRON_ORDERS_PDF] Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
    return NextResponse.json({ error: 'Configuración incompleta en el servidor' }, { status: 500 })
  }

  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[CRON_ORDERS_PDF] Petición no autorizada')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
    const cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS)

    const allFiles: { name: string; created_at?: string }[] = []
    let offset = 0
    const limit = 1000
    while (true) {
      const { data: page, error: listError } = await supabase.storage.from(BUCKET).list('', {
        limit,
        offset,
        sortBy: { column: 'created_at', order: 'asc' },
      })
      if (listError) throw listError
      if (!page?.length) break
      allFiles.push(...page.map((f) => ({ name: f.name, created_at: f.created_at })))
      if (page.length < limit) break
      offset += limit
    }

    const pathsToDelete: string[] = []
    const orderNumbers: string[] = []

    for (const file of allFiles) {
      if (!file.name.toLowerCase().endsWith('.pdf')) continue
      if (!file.created_at) continue
      const created = new Date(file.created_at)
      if (Number.isNaN(created.getTime()) || created >= cutoffDate) continue
      pathsToDelete.push(file.name)
      orderNumbers.push(file.name.replace(/\.pdf$/i, ''))
    }

    let deletedCount = 0
    for (let i = 0; i < pathsToDelete.length; i += CHUNK) {
      const chunkPaths = pathsToDelete.slice(i, i + CHUNK)
      const chunkOrders = orderNumbers.slice(i, i + CHUNK)
      const { error: removeError } = await supabase.storage.from(BUCKET).remove(chunkPaths)
      if (removeError) {
        console.error('[CRON_ORDERS_PDF] Error borrando Storage:', removeError)
        throw removeError
      }
      deletedCount += chunkPaths.length

      const { error: updateError } = await supabase
        .from('purchase_orders')
        .update({ pdf_url: null })
        .in('order_number', chunkOrders)
      if (updateError) {
        console.error('[CRON_ORDERS_PDF] Error actualizando purchase_orders:', updateError)
        throw updateError
      }
    }

    console.log(
      `[CRON_ORDERS_PDF] OK. Borrados ${deletedCount} PDF; corte ${cutoffDate.toISOString()}`
    )
    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      cutoff_date: cutoffDate.toISOString(),
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno'
    console.error('[CRON_ORDERS_PDF]', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
