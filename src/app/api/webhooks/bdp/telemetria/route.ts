import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

    const salaDisfrazada = sala.map((mesa: any) => ({
      ...mesa,
      id_ticket: mesa.numero_documento,
      nombre_cliente: mesa.nombre_cliente && String(mesa.nombre_cliente).trim() !== '' 
        ? String(mesa.nombre_cliente).trim() 
        : '',
    }))

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
