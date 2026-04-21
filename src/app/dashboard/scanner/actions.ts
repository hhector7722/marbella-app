'use server'

import { createHash } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function gateManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'No autenticado', supabase: null }

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'manager' && profile?.role !== 'admin') {
    return { ok: false as const, message: 'Sin permiso (solo gestión)', supabase: null }
  }

  return { ok: true as const, supabase }
}

export async function processScannerImage(base64DataUri: string, filename: string) {
  const gate = await gateManager()
  if (!gate.ok || !gate.supabase) throw new Error(gate.message)
  const supabase = gate.supabase

  // Separar el mime_type y los datos raw
  const matches = base64DataUri.match(/^data:([A-Za-z0-9.+-\/]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) throw new Error('Formato de imagen inválido')

  const mimeType = matches[1]
  const rawBase64 = matches[2]
  const buffer = Buffer.from(rawBase64, 'base64')
  const contentSha256 = createHash('sha256').update(buffer).digest('hex')

  const { data: dupByHash } = await supabase
    .from('purchase_invoices')
    .select('id')
    .eq('content_sha256', contentSha256)
    .maybeSingle()
  if (dupByHash?.id) {
    throw new Error('Este documento ya fue subido (misma imagen). No se duplica el stock.')
  }

  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) throw new Error('GEMINI_API_KEY no configurada')

  // 1. Llamada a Gemini 2.5 Flash
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const geminiPrompt = `
Eres un auditor contable de hostelería. Analiza esta imagen de un albarán o factura y extrae los datos.
Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
    "proveedor": "Nombre del proveedor",
    "numero_factura": "Identificador",
    "fecha": "YYYY-MM-DD",
    "total": 0.00,
    "lineas": [
        { "nombre": "Nombre del artículo", "cantidad": 0.000, "precio_unidad": 0.0000, "total_linea": 0.00 }
    ]
}`

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: geminiPrompt }, { inline_data: { mime_type: mimeType, data: rawBase64 } }],
        },
      ],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '')
    console.error('Scanner Gemini error:', errText)
    throw new Error('Fallo en la extracción de Gemini')
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText || typeof rawText !== 'string') throw new Error('Respuesta vacía de Gemini')

  let aiData: any
  try {
    aiData = JSON.parse(rawText)
  } catch {
    throw new Error('JSON inválido de Gemini')
  }

  // 2. Duplicado lógico (mismo proveedor + número + fecha) — antes de gastar Storage
  const d = new Date()
  const invoiceDateStr = typeof aiData?.fecha === 'string' && aiData.fecha.trim() ? aiData.fecha.trim() : d.toISOString().split('T')[0]
  const invoiceNumRaw = String(aiData?.numero_factura ?? '').trim()
  const invoiceNum = invoiceNumRaw || 'DESCONOCIDO'

  let matchedSupplierId: number | null = null
  if (aiData?.proveedor) {
    const searchTerm = String(aiData.proveedor).substring(0, 10).trim()
    if (searchTerm) {
      const { data: supplierMatch } = await supabase
        .from('suppliers')
        .select('id')
        .ilike('name', `%${searchTerm}%`)
        .limit(1)
        .maybeSingle()
      if (supplierMatch) matchedSupplierId = supplierMatch.id
    }
  }

  if (matchedSupplierId != null && invoiceNum !== 'DESCONOCIDO') {
    const { data: dupLogical } = await supabase
      .from('purchase_invoices')
      .select('id')
      .eq('supplier_id', matchedSupplierId)
      .eq('invoice_number', invoiceNum)
      .eq('invoice_date', invoiceDateStr)
      .maybeSingle()
    if (dupLogical?.id) {
      throw new Error(
        'Ya consta un albarán con el mismo proveedor, número y fecha. Si es otra entrega, revisa la foto o el número en el documento.'
      )
    }
  }

  // 3. Subir a Storage
  const filePath = `${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_scanner_${filename}`

  const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, buffer, {
    contentType: mimeType,
  })
  if (uploadError) throw new Error(`Error Storage: ${uploadError.message}`)

  // 4. Insertar Cabecera (CRÍTICO: source = 'scanner')
  const { data: invoice, error: invoiceError } = await supabase
    .from('purchase_invoices')
    .insert({
      supplier_id: matchedSupplierId,
      invoice_number: invoiceNum,
      invoice_date: invoiceDateStr,
      total_amount: aiData?.total || 0,
      file_path: filePath,
      status: 'pending_mapping',
      source: 'scanner',
      content_sha256: contentSha256,
    })
    .select('id')
    .single()

  if (invoiceError || !invoice) {
    const msg = invoiceError?.message ?? ''
    if (msg.includes('duplicate') || msg.includes('unique') || (invoiceError as { code?: string })?.code === '23505') {
      throw new Error('Este documento ya fue registrado (duplicado). No se duplica el stock.')
    }
    throw new Error('Error al guardar la cabecera')
  }

  // 5. Insertar Líneas
  if (Array.isArray(aiData?.lineas) && aiData.lineas.length > 0) {
    const linesToInsert = aiData.lineas.map((line: any) => ({
      invoice_id: invoice.id,
      original_name: line?.nombre || 'Sin nombre',
      quantity: line?.cantidad || 0,
      unit_price: line?.precio_unidad || 0,
      total_price: line?.total_linea || 0,
      status: 'pending',
    }))
    const { error: linesError } = await supabase.from('purchase_invoice_lines').insert(linesToInsert)
    if (linesError) throw new Error('Error guardando líneas')
  }

  revalidatePath('/dashboard/albaranes-precios')
  revalidatePath('/dashboard/scanner')
  return { success: true }
}

