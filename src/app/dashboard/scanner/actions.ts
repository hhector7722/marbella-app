'use server'

import { createHash } from 'node:crypto'
import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

async function gateAuthenticated() {
  const supabase = await createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const user = session?.user
  if (!user) return { ok: false as const, message: 'No autenticado', supabase: null }

  return { ok: true as const, supabase, userId: user.id }
}

export type ProcessScannerImageResult =
  | { success: true; invoiceId?: string }
  | {
      success: false
      message: string
    }

export type RecentInvoiceForSupplierItem = {
  id: string
  invoice_number: string | null
  invoice_date: string | null
  created_at: string
}

function parseBase64DataUri(base64DataUri: string): { mimeType: string; rawBase64: string; buffer: Buffer } | null {
  const matches = base64DataUri.match(/^data:([A-Za-z0-9.+-/]+);base64,(.+)$/)
  if (!matches || matches.length !== 3) return null
  const mimeType = matches[1]
  const rawBase64 = matches[2]
  const buffer = Buffer.from(rawBase64, 'base64')
  return { mimeType, rawBase64, buffer }
}

async function extractAlbaranWithGemini(
  mimeType: string,
  rawBase64: string
): Promise<{ ok: true; data: any } | { ok: false; message: string }> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { ok: false, message: 'GEMINI_API_KEY no configurada' }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const geminiPrompt = `
Eres un auditor contable de hostelería. Analiza esta imagen de un albarán y extrae los datos.
Devuelve ÚNICAMENTE un objeto JSON válido con esta estructura exacta:
{
    "numero_factura": "Identificador del albarán",
    "fecha": "YYYY-MM-DD",
    "total": 0.00,
    "lineas": [
        { 
          "nombre": "Nombre original exacto", 
          "cantidad": 0.000, 
          "unidad_medida": "garrafa|caja|bolsa|l|kg|ud (extrae la unidad literal del papel, NO la inventes. Si no hay, pon null)",
          "precio_unidad": 0.0000, 
          "total_linea": 0.00 
        }
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
    return { ok: false, message: 'Fallo en la extracción (Gemini). Repite la foto o prueba con más luz.' }
  }

  const geminiData = await geminiRes.json()
  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!rawText || typeof rawText !== 'string') return { ok: false, message: 'Respuesta vacía de Gemini' }

  try {
    const data = JSON.parse(rawText)
    return { ok: true, data }
  } catch {
    return { ok: false, message: 'JSON inválido de Gemini' }
  }
}

export async function listRecentInvoicesForSupplierAction(params: {
  supplierId: number
  limit?: number
}): Promise<{ success: true; items: RecentInvoiceForSupplierItem[] } | { success: false; message: string }> {
  const gate = await gateAuthenticated()
  if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }

  const sid = Number(params.supplierId)
  if (!Number.isFinite(sid) || sid <= 0) return { success: false, message: 'Proveedor inválido' }

  const limit = Math.min(Math.max(Number(params.limit ?? 40) || 40, 1), 80)

  const { data, error } = await gate.supabase
    .from('purchase_invoices')
    .select('id, invoice_number, invoice_date, created_at')
    .eq('supplier_id', sid)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return { success: false, message: error.message }

  const items: RecentInvoiceForSupplierItem[] = (data ?? []).map((r: any) => ({
    id: String(r.id),
    invoice_number: r.invoice_number ?? null,
    invoice_date: r.invoice_date ?? null,
    created_at: String(r.created_at ?? ''),
  }))

  return { success: true, items }
}

/**
 * Sube una hoja adicional al mismo `purchase_invoices`: Storage + fila en
 * `purchase_invoice_attachments` + líneas en `purchase_invoice_lines`.
 * No inserta cabecera nueva (evita deduplicación semántica proveedor+número+fecha).
 */
export async function appendScannerPageToInvoiceAction(params: {
  base64DataUri: string
  filename: string
  supplierId: number
  invoiceId: string
}): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const userId = gate.userId

    const supplierId = Number(params.supplierId)
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return { success: false, message: 'Proveedor inválido' }
    }

    const invoiceId = String(params.invoiceId ?? '').trim()
    if (!invoiceId) return { success: false, message: 'Albarán no seleccionado' }

    const parsed = parseBase64DataUri(params.base64DataUri)
    if (!parsed) return { success: false, message: 'Formato de imagen inválido' }

    const { mimeType, rawBase64, buffer } = parsed
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .select('id, supplier_id, file_path, content_sha256')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invErr) return { success: false, message: invErr.message }
    if (!inv) return { success: false, message: 'Albarán no encontrado' }

    if (Number((inv as any).supplier_id) !== supplierId) {
      return { success: false, message: 'El albarán elegido no corresponde a este proveedor.' }
    }

    const mainSha = String((inv as any).content_sha256 ?? '').trim()
    if (mainSha && mainSha === contentSha256) {
      return { success: false, message: 'Es la misma imagen que la hoja principal. Sube la otra hoja.' }
    }

    const { data: dupAtt, error: dupAttErr } = await supabase
      .from('purchase_invoice_attachments')
      .select('id')
      .eq('invoice_id', invoiceId)
      .eq('content_sha256', contentSha256)
      .maybeSingle()

    if (dupAttErr) console.error('appendScanner duplicate attachment check:', dupAttErr)
    if (dupAtt) {
      return { success: false, message: 'Esta imagen ya está vinculada a este albarán.' }
    }

    const gemini = await extractAlbaranWithGemini(mimeType, rawBase64)
    if (!gemini.ok) return { success: false, message: gemini.message }
    const aiData = gemini.data

    const d = new Date()
    const filePath = `${userId}/${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_append_${params.filename}`

    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, buffer, {
      contentType: mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    const { data: maxRow } = await supabase
      .from('purchase_invoice_attachments')
      .select('page_order')
      .eq('invoice_id', invoiceId)
      .order('page_order', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nextOrder = maxRow?.page_order != null && Number.isFinite(Number(maxRow.page_order)) ? Number(maxRow.page_order) + 1 : 2

    const { error: attErr } = await supabase.from('purchase_invoice_attachments').insert({
      invoice_id: invoiceId,
      file_path: filePath,
      content_sha256: contentSha256,
      page_order: nextOrder,
      created_by: userId,
    })

    if (attErr) {
      const msg = attErr.message ?? ''
      if (msg.includes('unique') || msg.includes('duplicate') || (attErr as { code?: string }).code === '23505') {
        return { success: false, message: 'Esta imagen ya consta para este albarán (duplicado).' }
      }
      console.error('appendScanner attachment insert:', attErr)
      return { success: false, message: 'Error guardando la hoja adicional' }
    }

    if (Array.isArray(aiData?.lineas) && aiData.lineas.length > 0) {
      const linesToInsert = aiData.lineas.map((line: any) => ({
        invoice_id: invoiceId,
        original_name: line?.nombre || 'Sin nombre',
        quantity: line?.cantidad || 0,
        line_unit: line?.unidad_medida || null,
        unit_price: line?.precio_unidad || 0,
        total_price: line?.total_linea || 0,
        status: 'pending',
      }))
      const { error: linesError } = await supabase.from('purchase_invoice_lines').insert(linesToInsert)
      if (linesError) {
        console.error('appendScanner lines insert:', linesError)
        return {
          success: false,
          message: `Error guardando líneas de la hoja adicional: ${linesError.message}`,
        }
      }
    }

    revalidatePath('/dashboard/albaranes-precios')
    revalidatePath('/dashboard/scanner')
    revalidatePath('/dashboard/albaranes')
    return { success: true }
  } catch (err) {
    console.error('appendScannerPageToInvoiceAction unexpected:', err)
    return { success: false, message: 'Error inesperado al añadir la hoja. Reintenta.' }
  }
}

// El proveedor SIEMPRE viene del cliente (lo selecciona el usuario antes de
// abrir la cámara). Si llega vacío, fallamos rápido: cero matching probabilístico
// para evitar mezclar stock entre proveedores.
export async function processScannerImage(
  base64DataUri: string,
  filename: string,
  supplierId: number
): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const userId = gate.userId

    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      return { success: false, message: 'Falta el proveedor. Selecciónalo antes de escanear.' }
    }

    const parsed = parseBase64DataUri(base64DataUri)
    if (!parsed) return { success: false, message: 'Formato de imagen inválido' }

    const { mimeType, rawBase64, buffer } = parsed
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    const gemini = await extractAlbaranWithGemini(mimeType, rawBase64)
    if (!gemini.ok) return { success: false, message: gemini.message }
    const aiData = gemini.data

    // Duplicado lógico (mismo proveedor + número + fecha) — antes de gastar Storage
    const d = new Date()
    const invoiceDateStr =
      typeof aiData?.fecha === 'string' && aiData.fecha.trim() ? aiData.fecha.trim() : d.toISOString().split('T')[0]
    const invoiceNumRaw = String(aiData?.numero_factura ?? '').trim()
    const invoiceNum = invoiceNumRaw || 'DESCONOCIDO'

    // Duplicados (hash + semántico) con función SECURITY DEFINER (no requiere SELECT global)
    try {
      const { data: dupData, error: dupFnError } = await supabase.rpc('check_purchase_invoice_duplicate', {
        p_content_sha256: contentSha256,
        p_supplier_id: supplierId,
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
              'Ya consta un albarán con el mismo proveedor, número y fecha. Si es otra hoja del mismo albarán, ábrelo en Albaranes y usa «Añadir hoja al albarán».',
          }
        }
      }
    } catch (e) {
      console.error('Scanner duplicate RPC unexpected error:', e)
    }

    const filePath = `${userId}/${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_scanner_${filename}`

    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, buffer, {
      contentType: mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    const { data: invoice, error: invoiceError } = await supabase
      .from('purchase_invoices')
      .insert({
        created_by: userId,
        supplier_id: supplierId,
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

    if (Array.isArray(aiData?.lineas) && aiData.lineas.length > 0) {
      const linesToInsert = aiData.lineas.map((line: any) => ({
        invoice_id: invoice.id,
        original_name: line?.nombre || 'Sin nombre',
        quantity: line?.cantidad || 0,
        line_unit: line?.unidad_medida || null,
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
    revalidatePath('/dashboard/albaranes')
    return { success: true, invoiceId: String((invoice as { id: string }).id) }
  } catch (err) {
    console.error('processScannerImage unexpected error:', err)
    return { success: false, message: 'Error inesperado procesando el albarán. Reintenta.' }
  }
}
