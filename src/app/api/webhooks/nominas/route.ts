import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// ENDPOINT: POST /api/webhooks/nominas
// PROPÓSITO: Recibe desde Google Apps Script un PDF en Base64
//            junto al codigo_empleado extraído del nombre del
//            archivo. Sube el PDF a Supabase Storage y crea
//            el registro de documento en la base de datos.
//
// SEGURIDAD: Un bearer token secreto (WEBHOOK_SECRET) en la
//            cabecera Authorization protege este endpoint para
//            que solo GAS pueda llamarlo (no es público).
// ============================================================

const ALLOWED_ORIGINS = ['https://script.google.com']

interface NominaPayload {
    codigo_empleado: string   // ej. "01"
    mes: string               // ej. "febrero"
    year: number              // ej. 2025
    filename: string          // nombre original del archivo
    pdf_base64: string        // contenido del PDF en Base64
}

// Cliente admin — usa el Service Role Key para ignorar RLS
// solo en este webhook (la seguridad se delega al bearer token)
function getAdminSupabase() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
    if (!url || !key) throw new Error('Supabase env vars not set')
    return createClient(url, key, {
        auth: { persistSession: false },
    })
}

function validateBearerToken(req: NextRequest): boolean {
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace('Bearer ', '').trim()
    const secret = process.env.WEBHOOK_SECRET ?? ''
    return secret.length > 0 && token === secret
}

export async function POST(req: NextRequest) {
    // --- 1. Validar token ---
    if (!validateBearerToken(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // --- 2. Parsear payload ---
    let payload: NominaPayload
    try {
        payload = await req.json()
    } catch {
        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
    }

    const { codigo_empleado, mes, year, filename, pdf_base64 } = payload

    if (!codigo_empleado || !mes || !year || !filename || !pdf_base64) {
        return NextResponse.json(
            { error: 'Missing required fields: codigo_empleado, mes, year, filename, pdf_base64' },
            { status: 422 }
        )
    }

    // --- 3. Buscar el perfil del empleado ---
    const supabase = getAdminSupabase()

    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('codigo_empleado', codigo_empleado)
        .single()

    if (profileError || !profile) {
        console.error('[/api/webhooks/nominas] Profile not found:', profileError?.message)
        return NextResponse.json(
            { error: `No se encontró empleado con codigo_empleado="${codigo_empleado}"` },
            { status: 404 }
        )
    }

    // --- 4. Decodificar Base64 → Buffer ---
    let pdfBuffer: Buffer
    try {
        pdfBuffer = Buffer.from(pdf_base64, 'base64')
    } catch {
        return NextResponse.json({ error: 'Invalid Base64 data' }, { status: 400 })
    }

    // --- 5. Subir a Supabase Storage ---
    // Bucket: "nominas"  |  Path: {codigo_empleado}/{year}/{filename}
    const storagePath = `${codigo_empleado}/${year}/${filename}`

    const { data: storageData, error: storageError } = await supabase
        .storage
        .from('nominas')
        .upload(storagePath, pdfBuffer, {
            contentType: 'application/pdf',
            upsert: true,       // sobreescribir si ya existe (re-envíos del gestor)
        })

    if (storageError) {
        console.error('[/api/webhooks/nominas] Storage upload failed:', storageError.message)
        return NextResponse.json({ error: `Storage error: ${storageError.message}` }, { status: 500 })
    }

    // Obtener la URL pública del archivo
    const { data: publicUrlData } = supabase
        .storage
        .from('nominas')
        .getPublicUrl(storagePath)

    const publicUrl = publicUrlData?.publicUrl ?? ''

    // --- 6. Insertar registro en la tabla employee_documents ---
    const { error: insertError } = await supabase
        .from('employee_documents')
        .upsert(
            {
                user_id: profile.id,
                codigo_empleado: codigo_empleado,
                tipo: 'nomina',
                mes: mes.toLowerCase(),
                year: year,
                filename: filename,
                storage_path: storagePath,
                public_url: publicUrl,
            },
            { onConflict: 'codigo_empleado,mes,year,tipo' }  // evitar duplicados si se reenvía
        )

    if (insertError) {
        console.error('[/api/webhooks/nominas] DB insert failed:', insertError.message)
        return NextResponse.json({ error: `DB error: ${insertError.message}` }, { status: 500 })
    }

    console.log(`[/api/webhooks/nominas] ✅ Nómina procesada OK: empleado ${codigo_empleado} | ${mes} ${year}`)

    return NextResponse.json({
        ok: true,
        empleado: profile.full_name,
        storage_path: storagePath,
        public_url: publicUrl,
    })
}
