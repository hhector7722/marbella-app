'use server'

import { createHash } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function gateAuthenticated() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, message: 'No autenticado', supabase: null }

  return { ok: true as const, supabase, userId: user.id }
}

export type ProcessScannerImageResult =
  | { success: true }
  | {
      success: false
      message: string
    }

export async function processScannerImage(base64DataUri: string, filename: string): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const userId = gate.userId

    // Separar el mime_type y los datos raw
    const matches = base64DataUri.match(/^data:([A-Za-z0-9.+-\/]+);base64,(.+)$/)
    if (!matches || matches.length !== 3) return { success: false, message: 'Formato de imagen inválido' }

    const mimeType = matches[1]
    const rawBase64 = matches[2]
    const buffer = Buffer.from(rawBase64, 'base64')
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    const geminiKey = process.env.GEMINI_API_KEY
    if (!geminiKey) return { success: false, message: 'GEMINI_API_KEY no configurada' }

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
      return { success: false, message: 'Fallo en la extracción (Gemini). Repite la foto o prueba con más luz.' }
    }

    const geminiData = await geminiRes.json()
    const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!rawText || typeof rawText !== 'string') return { success: false, message: 'Respuesta vacía de Gemini' }

    let aiData: any
    try {
      aiData = JSON.parse(rawText)
    } catch {
      return { success: false, message: 'JSON inválido de Gemini' }
    }

    // 2. Duplicado lógico (mismo proveedor + número + fecha) — antes de gastar Storage
    const d = new Date()
    const invoiceDateStr =
      typeof aiData?.fecha === 'string' && aiData.fecha.trim() ? aiData.fecha.trim() : d.toISOString().split('T')[0]
    const invoiceNumRaw = String(aiData?.numero_factura ?? '').trim()
    const invoiceNum = invoiceNumRaw || 'DESCONOCIDO'

    let matchedSupplierId: number | null = null
    if (aiData?.proveedor) {
      const searchTerm = String(aiData.proveedor).substring(0, 10).trim()
      if (searchTerm) {
        const { data: supplierMatch, error: supplierMatchError } = await supabase
          .from('suppliers')
          .select('id')
          .ilike('name', `%${searchTerm}%`)
          .limit(1)
          .maybeSingle()
        if (supplierMatchError) console.error('Scanner supplierMatch error:', supplierMatchError)
        if (supplierMatch) matchedSupplierId = supplierMatch.id
      }
    }

    // 2b) Duplicados (hash + semántico) con función SECURITY DEFINER (no requiere SELECT global)
    try {
      const { data: dupData, error: dupFnError } = await supabase.rpc('check_purchase_invoice_duplicate', {
        p_content_sha256: contentSha256,
        p_supplier_id: matchedSupplierId,
        p_invoice_number: invoiceNum !== 'DESCONOCIDO' ? invoiceNum : null,
        p_invoice_date: invoiceNum !== 'DESCONOCIDO' ? invoiceDateStr : null,
      })
      if (dupFnError) {
        console.error('Scanner duplicate RPC error:', dupFnError)
      } else {
        const dupByHash = Boolean((dupData as any)?.dup_by_hash)
        const dupBySemantic = Boolean((dupData as any)?.dup_by_semantic)

        if (dupByHash) {
          return { success: false, message: 'Este documento ya fue subido (misma imagen). No se duplica el stock.' }
        }
        if (dupBySemantic) {
          return {
            success: false,
            message:
              'Ya consta un albarán con el mismo proveedor, número y fecha. Si es otra entrega, revisa la foto o el número en el documento.',
          }
        }
      }
    } catch (e) {
      console.error('Scanner duplicate RPC unexpected error:', e)
    }

    // 3. Subir a Storage
    // IMPORTANTE (RLS Storage): subimos dentro de una carpeta por usuario `${auth.uid()}/...`
    const filePath = `${userId}/${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_scanner_${filename}`

    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, buffer, {
      contentType: mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    // 4. Insertar Cabecera (CRÍTICO: source = 'scanner')
    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert({
        created_by: userId,
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
        return { success: false, message: 'Este documento ya fue registrado (duplicado). No se duplica el stock.' }
      }
      console.error('Scanner invoice insert error:', invoiceError)
      return { success: false, message: 'Error al guardar la cabecera del albarán' }
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
      if (linesError) {
        console.error('Scanner lines insert error:', linesError)
        return { success: false, message: 'Error guardando líneas del albarán' }
      }
    }

    revalidatePath('/dashboard/albaranes-precios')
    revalidatePath('/dashboard/scanner')
    return { success: true }
  } catch (err) {
    console.error('processScannerImage unexpected error:', err)
    return { success: false, message: 'Error inesperado procesando el albarán. Reintenta.' }
  }
}

