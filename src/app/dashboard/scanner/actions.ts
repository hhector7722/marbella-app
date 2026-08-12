'use server'

import { createHash } from 'node:crypto'
import { after } from 'next/server'
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

type GeminiDocumentColumn = {
  index: number
  name: string | null
}
type GeminiDocumentCell = {
  column_index: number
  raw_value: string | null
}
type GeminiDocumentRow = {
  index: number
  cells: GeminiDocumentCell[]
}
type GeminiDocumentTable = {
  index: number
  columns: GeminiDocumentColumn[]
  rows: GeminiDocumentRow[]
}

type GeminiAlbaranData = {
  numero_factura?: string
  fecha?: string
  base_imponible?: number | null
  tipo_iva?: number | null
  total_iva?: number | null
  total?: number
  tables?: GeminiDocumentTable[]
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normaliza cabecera IVA: calcula base si falta pero hay total + tipo. */
function normalizeGeminiAlbaranData(raw: unknown): GeminiAlbaranData {
  const data = raw as GeminiAlbaranData
  const total = toFiniteNumber(data.total) ?? 0
  const tipoIva = toFiniteNumber(data.tipo_iva)
  let baseImponible = toFiniteNumber(data.base_imponible)
  let totalIva = toFiniteNumber(data.total_iva)

  if ((baseImponible == null || baseImponible === 0) && total > 0 && tipoIva != null && tipoIva > 0) {
    baseImponible = total / (1 + tipoIva)
    data.base_imponible = baseImponible
    if (totalIva == null || totalIva === 0) {
      totalIva = baseImponible * tipoIva
      data.total_iva = totalIva
    }
  }

  return data
}

function invoiceTaxInsertFields(data: GeminiAlbaranData) {
  return {
    base_amount: toFiniteNumber(data.base_imponible),
    tax_amount: toFiniteNumber(data.total_iva),
    tax_rate: toFiniteNumber(data.tipo_iva),
  }
}

import { randomUUID } from 'node:crypto'

function parseInvoiceLinesFromTables(
  tables: GeminiDocumentTable[],
  rowMapping: Record<string, string>,
  invoiceId: string,
  headerTaxRate: number | null
) {
  const linesToInsert: Record<string, unknown>[] = []
  const provenancesToInsert: Record<string, unknown>[] = []

  for (const table of tables || []) {
    let descColIndex = -1
    let qtyColIndex = -1
    let priceColIndex = -1
    let unitColIndex = -1

    for (const col of table.columns || []) {
      const name = (col.name || '').toLowerCase()
      if (/descripci|art[íi]culo|producto|concepto|nombre/i.test(name)) descColIndex = col.index
      else if (/cant|uds|unidades|emb|cajas|bultos/i.test(name)) qtyColIndex = col.index
      else if (/precio|importe|tarifa/i.test(name)) priceColIndex = col.index
      else if (/unidad|um|unid/i.test(name)) unitColIndex = col.index
    }

    if (descColIndex === -1) continue

    for (const row of table.rows || []) {
      let desc = ''
      let qty = 0
      let price = 0
      let unit = ''

      for (const cell of row.cells || []) {
        if (cell.column_index === descColIndex) desc = cell.raw_value || ''
        if (cell.column_index === qtyColIndex) {
          const val = parseFloat((cell.raw_value || '').replace(',', '.'))
          if (!isNaN(val)) qty = val
        }
        if (cell.column_index === priceColIndex) {
          const val = parseFloat((cell.raw_value || '').replace(',', '.'))
          if (!isNaN(val)) price = val
        }
        if (cell.column_index === unitColIndex) {
          unit = cell.raw_value || ''
        }
      }

      if (!desc.trim()) continue

      const lineId = randomUUID()
      linesToInsert.push({
        id: lineId,
        invoice_id: invoiceId,
        original_name: desc.trim(),
        quantity: qty,
        line_unit: unit || null,
        unit_price: price,
        total_price: qty * price,
        status: 'pending' as const,
        tax_rate: headerTaxRate,
        base_price: price && headerTaxRate != null ? price / (1 + headerTaxRate) : null,
      })

      const rowMappingKey = `${table.index}_${row.index}`
      const docRowId = rowMapping[rowMappingKey]
      if (docRowId) {
        provenancesToInsert.push({
          invoice_line_id: lineId,
          document_row_id: docRowId,
          linked_by: 'auto-parser-gemini',
        })
      }
    }
  }

  return { linesToInsert, provenancesToInsert }
}

function parseOcrDate(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null
  const str = raw.trim()
  if (!str) return null

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const esMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (esMatch) {
    const day = esMatch[1].padStart(2, '0')
    const month = esMatch[2].padStart(2, '0')
    const year = esMatch[3]
    return `${year}-${month}-${day}`
  }

  return str
}

function todayYmdLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = d.getMonth() + 1
  const day = d.getDate()
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function revalidateScannerPaths() {
  revalidatePath('/dashboard/albaranes-precios')
  revalidatePath('/dashboard/scanner')
  revalidatePath('/dashboard/albaranes')
}

async function extractAlbaranWithGemini(
  mimeType: string,
  rawBase64: string
): Promise<{ ok: true; data: GeminiAlbaranData; rawJson: unknown } | { ok: false; message: string }> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { ok: false, message: 'GEMINI_API_KEY no configurada' }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`
  const geminiPrompt = `
Eres un procesador de datos ciego de OCR de documentos.
Tu única tarea es transcribir la estructura tabular de este documento (normalmente un albarán o factura) a un JSON estructurado.

REGLAS ABSOLUTAS:
1. DEBES TRANSCRIBIR, no interpretar.
2. NO calcules conversiones. NO inventes columnas. NO normalices valores ni unidades.
3. Si la columna no tiene título explícito, usa null. NO inventes "COLUMNA_1" o similares.
4. Si la celda está vacía en el documento, usa null.
5. El índice de las tablas, columnas y filas debe empezar en 0 y mantener el orden físico del documento.
6. Devuelve ÚNICAMENTE un JSON válido que siga esta estructura:
{
    "numero_factura": "Identificador del albarán (si se ve claro)",
    "fecha": "YYYY-MM-DD",
    "base_imponible": 0.00,
    "tipo_iva": 0.10,
    "total_iva": 0.00,
    "total": 0.00,
    "tables": [
      {
        "index": 0,
        "columns": [
          { "index": 0, "name": "DESCRIPCIÓN" },
          { "index": 1, "name": "CANTIDAD" }
        ],
        "rows": [
          {
            "index": 0,
            "cells": [
              { "column_index": 0, "raw_value": "CASERAS 60G-28U" },
              { "column_index": 1, "raw_value": "6" }
            ]
          }
        ]
      }
    ]
}
`

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
    const rawParsed = JSON.parse(rawText)
    const data = normalizeGeminiAlbaranData(rawParsed)
    return { ok: true, data, rawJson: rawParsed }
  } catch {
    return { ok: false, message: 'JSON inválido de Gemini' }
  }
}

async function downloadStorageAsBase64(
  supabase: Awaited<ReturnType<typeof createClient>>,
  filePath: string
): Promise<{ ok: true; mimeType: string; rawBase64: string } | { ok: false; message: string }> {
  const { data, error } = await supabase.storage.from('albaranes').download(filePath)
  if (error || !data) {
    return { ok: false, message: `No se pudo leer la imagen: ${error?.message ?? 'sin datos'}` }
  }
  const buffer = Buffer.from(await data.arrayBuffer())
  const mimeType = data.type || 'image/jpeg'
  return { ok: true, mimeType, rawBase64: buffer.toString('base64') }
}

async function markInvoiceOcrFailed(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  message: string,
  duplicateOf?: string | null
) {
  const patch: Record<string, unknown> = {
    status: 'ocr_failed',
    ocr_error: message,
  }
  if (duplicateOf) patch.duplicate_of_invoice_id = duplicateOf
  const { error } = await supabase.from('purchase_invoices').update(patch).eq('id', invoiceId)
  if (error) console.error('markInvoiceOcrFailed:', error)
}

/**
 * OCR de cabecera (hoja 1) + cualquier adjunto aún pending.
 * Se ejecuta en `after()` tras el enqueue.
 */
async function runOcrForInvoice(invoiceId: string) {
  try {
    const supabase = await createClient()
    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .select('id, supplier_id, file_path, content_sha256, status')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invErr || !inv) {
      console.error('runOcrForInvoice load:', invErr)
      return
    }

    const filePath = String((inv as { file_path?: string }).file_path ?? '').trim()
    if (!filePath) {
      await markInvoiceOcrFailed(supabase, invoiceId, 'Sin imagen en Storage')
      revalidateScannerPaths()
      return
    }

    const downloaded = await downloadStorageAsBase64(supabase, filePath)
    if (!downloaded.ok) {
      await markInvoiceOcrFailed(supabase, invoiceId, downloaded.message)
      revalidateScannerPaths()
      return
    }

    const gemini = await extractAlbaranWithGemini(downloaded.mimeType, downloaded.rawBase64)
    if (!gemini.ok) {
      await markInvoiceOcrFailed(supabase, invoiceId, gemini.message)
      revalidateScannerPaths()
      return
    }

    const aiData = gemini.data
    const supplierId = Number((inv as { supplier_id?: number }).supplier_id)
    const contentSha256 = String((inv as { content_sha256?: string }).content_sha256 ?? '').trim()
    const invoiceDateStr = parseOcrDate(aiData?.fecha)
    const invoiceNumRaw = String(aiData?.numero_factura ?? '').trim()
    const invoiceNum = invoiceNumRaw || 'DESCONOCIDO'

    // Dedup semántico post-OCR (hash ya se comprobó al enqueue)
    if (Number.isFinite(supplierId) && supplierId > 0 && invoiceNum !== 'DESCONOCIDO') {
      try {
        const { data: dupData, error: dupFnError } = await supabase.rpc('check_purchase_invoice_duplicate', {
          p_content_sha256: contentSha256 || null,
          p_supplier_id: supplierId,
          p_invoice_number: invoiceNum,
          p_invoice_date: invoiceDateStr,
        })
        if (dupFnError) {
          console.error('runOcrForInvoice duplicate RPC:', dupFnError)
        } else {
          const dupBySemantic = Boolean((dupData as { dup_by_semantic?: boolean })?.dup_by_semantic)
          if (dupBySemantic) {
            // Buscar el original para duplicate_of
            const { data: orig } = await supabase
              .from('purchase_invoices')
              .select('id')
              .eq('supplier_id', supplierId)
              .eq('invoice_number', invoiceNum)
              .eq('invoice_date', invoiceDateStr)
              .neq('id', invoiceId)
              .limit(1)
              .maybeSingle()
            await markInvoiceOcrFailed(
              supabase,
              invoiceId,
              'Ya consta un albarán con el mismo proveedor, número y fecha. Si es otra hoja, ábrelo y usa «Añadir hoja».',
              orig?.id ? String(orig.id) : null
            )
            revalidateScannerPaths()
            return
          }
        }
      } catch (e) {
        console.error('runOcrForInvoice duplicate unexpected:', e)
      }
    }

    const { error: updErr } = await supabase
      .from('purchase_invoices')
      .update({
        invoice_number: invoiceNum,
        invoice_date: invoiceDateStr,
        total_amount: aiData.total || 0,
        ...invoiceTaxInsertFields(aiData),
        status: 'pending_mapping',
        ocr_error: null,
        duplicate_of_invoice_id: null,
      })
      .eq('id', invoiceId)

    if (updErr) {
      console.error('runOcrForInvoice update header:', updErr)
      await markInvoiceOcrFailed(supabase, invoiceId, `Error guardando cabecera OCR: ${updErr.message}`)
      revalidateScannerPaths()
      return
    }

    const hasTables = Array.isArray(aiData.tables) && aiData.tables.length > 0
    const { data: rpcData, error: rpcError } = await supabase.rpc('persist_document_evidence', {
      p_invoice_id: invoiceId,
      p_file_version_hash: contentSha256 || 'unknown',
      p_extractor_version: 'gemini-2.5-flash-tabular-v1',
      p_raw_json_artifact: gemini.rawJson,
      p_status: hasTables ? 'success' : 'no_table',
      p_tables: hasTables ? aiData.tables : null,
    })

    if (rpcError) {
      console.error('runOcrForInvoice persist_document_evidence:', rpcError)
      await markInvoiceOcrFailed(supabase, invoiceId, `Error guardando la evidencia documental: ${rpcError.message}`)
      revalidateScannerPaths()
      return
    }

    const { row_mapping } = (rpcData as { row_mapping?: Record<string, string> }) || {}

    // Evitar duplicar líneas si se reintenta OCR sobre factura ya leída
    const { count: existingLines } = await supabase
      .from('purchase_invoice_lines')
      .select('id', { count: 'exact', head: true })
      .eq('invoice_id', invoiceId)

    if ((existingLines ?? 0) === 0 && hasTables) {
      const headerTaxRate = toFiniteNumber(aiData.tipo_iva)
      const { linesToInsert, provenancesToInsert } = parseInvoiceLinesFromTables(
        aiData.tables!,
        row_mapping || {},
        invoiceId,
        headerTaxRate
      )

      if (linesToInsert.length > 0) {
        const { error: linesError } = await supabase.from('purchase_invoice_lines').insert(linesToInsert)
        if (linesError) {
          console.error('runOcrForInvoice lines:', linesError)
          await markInvoiceOcrFailed(supabase, invoiceId, `Error guardando líneas: ${linesError.message}`)
          revalidateScannerPaths()
          return
        }

        if (provenancesToInsert.length > 0) {
          const { error: provError } = await supabase.from('purchase_line_provenance').insert(provenancesToInsert)
          if (provError) {
            console.error('runOcrForInvoice provenance:', provError)
          }
        }
      }
    }

    // OCR de adjuntos pendientes (hojas 2+)
    await runOcrForPendingAttachments(supabase, invoiceId)

    revalidateScannerPaths()
  } catch (err) {
    console.error('runOcrForInvoice unexpected:', err)
    try {
      const supabase = await createClient()
      await markInvoiceOcrFailed(supabase, invoiceId, 'Error inesperado en OCR. Reintenta.')
      revalidateScannerPaths()
    } catch {
      /* ignore */
    }
  }
}

async function runOcrForPendingAttachments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string
) {
  const { data: rows, error } = await supabase
    .from('purchase_invoice_attachments')
    .select('id, file_path, page_order, ocr_status, content_sha256')
    .eq('invoice_id', invoiceId)
    .eq('ocr_status', 'pending')
    .order('page_order', { ascending: true })

  if (error) {
    console.error('runOcrForPendingAttachments list:', error)
    return
  }

  for (const row of rows ?? []) {
    await runOcrForAttachmentRow(supabase, invoiceId, row as { id: string; file_path: string; page_order: number })
  }
}

async function runOcrForAttachmentRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoiceId: string,
  row: { id: string; file_path: string; page_order?: number }
) {
  const attId = String(row.id)

  // Claim atómico: evita doble OCR si cabecera y append concurren.
  const { data: claimed, error: claimErr } = await supabase
    .from('purchase_invoice_attachments')
    .update({ ocr_status: 'processing', ocr_error: null })
    .eq('id', attId)
    .eq('ocr_status', 'pending')
    .select('id, file_path, content_sha256')
    .maybeSingle()

  if (claimErr) {
    console.error('runOcrForAttachmentRow claim:', claimErr)
    return
  }
  if (!claimed) return

  const filePath = String((claimed as { file_path?: string }).file_path ?? row.file_path ?? '').trim()
  if (!filePath) {
    await supabase
      .from('purchase_invoice_attachments')
      .update({ ocr_status: 'failed', ocr_error: 'Sin ruta de imagen' })
      .eq('id', attId)
    return
  }

  const downloaded = await downloadStorageAsBase64(supabase, filePath)
  if (!downloaded.ok) {
    await supabase
      .from('purchase_invoice_attachments')
      .update({ ocr_status: 'failed', ocr_error: downloaded.message })
      .eq('id', attId)
    return
  }

  const gemini = await extractAlbaranWithGemini(downloaded.mimeType, downloaded.rawBase64)
  if (!gemini.ok) {
    await supabase
      .from('purchase_invoice_attachments')
      .update({ ocr_status: 'failed', ocr_error: gemini.message })
      .eq('id', attId)
    // Superficie en cabecera si el albarán ya estaba OK
    const { data: inv } = await supabase.from('purchase_invoices').select('status').eq('id', invoiceId).maybeSingle()
    const st = String((inv as { status?: string } | null)?.status ?? '')
    if (st === 'pending_mapping' || st === 'mapped') {
      await supabase
        .from('purchase_invoices')
        .update({
          status: 'ocr_failed',
          ocr_error: `Hoja adicional: ${gemini.message}`,
        })
        .eq('id', invoiceId)
    }
    return
  }

  const aiData = gemini.data
  const contentSha256 = String((claimed as { content_sha256?: string }).content_sha256 ?? (row as { content_sha256?: string }).content_sha256 ?? '').trim()
  
  const hasTables = Array.isArray(aiData.tables) && aiData.tables.length > 0
  const { data: rpcData, error: rpcError } = await supabase.rpc('persist_document_evidence', {
    p_invoice_id: invoiceId,
    p_file_version_hash: contentSha256 || 'unknown',
    p_extractor_version: 'gemini-2.5-flash-tabular-v1',
    p_raw_json_artifact: gemini.rawJson,
    p_status: hasTables ? 'success' : 'no_table',
    p_tables: hasTables ? aiData.tables : null,
  })

  if (rpcError) {
    console.error('runOcrForAttachmentRow persist_document_evidence:', rpcError)
    await supabase
      .from('purchase_invoice_attachments')
      .update({ ocr_status: 'failed', ocr_error: rpcError.message })
      .eq('id', attId)
    return
  }

  const { row_mapping } = (rpcData as { row_mapping?: Record<string, string> }) || {}

  if (hasTables) {
    const headerTaxRate = toFiniteNumber(aiData.tipo_iva)
    const { linesToInsert, provenancesToInsert } = parseInvoiceLinesFromTables(
      aiData.tables!,
      row_mapping || {},
      invoiceId,
      headerTaxRate
    )

    if (linesToInsert.length > 0) {
      const { error: linesError } = await supabase.from('purchase_invoice_lines').insert(linesToInsert)
      if (linesError) {
        console.error('runOcrForAttachmentRow lines:', linesError)
        await supabase
          .from('purchase_invoice_attachments')
          .update({ ocr_status: 'failed', ocr_error: linesError.message })
          .eq('id', attId)
        return
      }

      if (provenancesToInsert.length > 0) {
        const { error: provError } = await supabase.from('purchase_line_provenance').insert(provenancesToInsert)
        if (provError) {
          console.error('runOcrForAttachmentRow provenance:', provError)
        }
      }
    }
  }

  await supabase
    .from('purchase_invoice_attachments')
    .update({ ocr_status: 'done', ocr_error: null })
    .eq('id', attId)
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

  const items: RecentInvoiceForSupplierItem[] = (data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    invoice_number: (r.invoice_number as string | null) ?? null,
    invoice_date: (r.invoice_date as string | null) ?? null,
    created_at: String(r.created_at ?? ''),
  }))

  return { success: true, items }
}

/**
 * Sube hoja adicional al instante (Storage + attachment) y encola OCR en `after()`.
 * No bloquea al usuario con Gemini.
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

    const { mimeType, buffer } = parsed
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .select('id, supplier_id, file_path, content_sha256, status')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invErr) return { success: false, message: invErr.message }
    if (!inv) return { success: false, message: 'Albarán no encontrado' }

    if (Number((inv as { supplier_id?: number }).supplier_id) !== supplierId) {
      return { success: false, message: 'El albarán elegido no corresponde a este proveedor.' }
    }

    const mainSha = String((inv as { content_sha256?: string }).content_sha256 ?? '').trim()
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

    const nextOrder =
      maxRow?.page_order != null && Number.isFinite(Number(maxRow.page_order)) ? Number(maxRow.page_order) + 1 : 2

    const { data: attInserted, error: attErr } = await supabase
      .from('purchase_invoice_attachments')
      .insert({
        invoice_id: invoiceId,
        file_path: filePath,
        content_sha256: contentSha256,
        page_order: nextOrder,
        created_by: userId,
        ocr_status: 'pending',
      })
      .select('id, file_path, page_order')
      .single()

    if (attErr) {
      const msg = attErr.message ?? ''
      if (msg.includes('unique') || msg.includes('duplicate') || (attErr as { code?: string }).code === '23505') {
        return { success: false, message: 'Esta imagen ya consta para este albarán (duplicado).' }
      }
      console.error('appendScanner attachment insert:', attErr)
      return { success: false, message: 'Error guardando la hoja adicional' }
    }

    const attId = String((attInserted as { id: string }).id)

    // Siempre encolar OCR de la hoja. El claim atómico evita doble proceso
    // si runOcrForInvoice también recoge adjuntos pending.
    after(async () => {
      try {
        const sb = await createClient()
        await runOcrForAttachmentRow(sb, invoiceId, {
          id: attId,
          file_path: filePath,
          page_order: nextOrder,
        })
        revalidateScannerPaths()
      } catch (e) {
        console.error('appendScanner after OCR:', e)
      }
    })

    revalidateScannerPaths()
    return { success: true, invoiceId }
  } catch (err) {
    console.error('appendScannerPageToInvoiceAction unexpected:', err)
    return { success: false, message: 'Error inesperado al añadir la hoja. Reintenta.' }
  }
}

/**
 * Encola albarán: Storage + cabecera `processing` al instante; Gemini en `after()`.
 * Sustituye el flujo síncrono anterior de `processScannerImage`.
 */
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

    const { mimeType, buffer } = parsed
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    // Dedup solo por hash (semántico requiere OCR)
    try {
      const { data: dupData, error: dupFnError } = await supabase.rpc('check_purchase_invoice_duplicate', {
        p_content_sha256: contentSha256,
        p_supplier_id: supplierId,
        p_invoice_number: null,
        p_invoice_date: null,
      })
      if (dupFnError) {
        console.error('Scanner duplicate RPC error:', dupFnError)
      } else if (Boolean((dupData as { dup_by_hash?: boolean })?.dup_by_hash)) {
        return { success: false, message: 'Este documento ya fue subido (misma imagen). No se duplica el stock.' }
      }
    } catch (e) {
      console.error('Scanner duplicate RPC unexpected error:', e)
    }

    const d = new Date()
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
        invoice_number: 'PROCESANDO…',
        invoice_date: todayYmdLocal(),
        total_amount: 0,
        file_path: filePath,
        status: 'processing',
        source: 'scanner',
        content_sha256: contentSha256,
        ocr_error: null,
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

    const invoiceId = String((invoice as { id: string }).id)

    after(async () => {
      await runOcrForInvoice(invoiceId)
    })

    revalidateScannerPaths()
    return { success: true, invoiceId }
  } catch (err) {
    console.error('processScannerImage unexpected error:', err)
    return { success: false, message: 'Error inesperado procesando el albarán. Reintenta.' }
  }
}

/** Reintenta OCR de un albarán en `ocr_failed` o `processing` atascado. */
export async function retryOcrInvoiceAction(invoiceId: string): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }

    const id = String(invoiceId ?? '').trim()
    if (!id) return { success: false, message: 'ID inválido' }

    const { data: inv, error } = await gate.supabase
      .from('purchase_invoices')
      .select('id, status, file_path')
      .eq('id', id)
      .maybeSingle()

    if (error) return { success: false, message: error.message }
    if (!inv) return { success: false, message: 'Albarán no encontrado' }

    const st = String((inv as { status?: string }).status ?? '')
    if (st !== 'ocr_failed' && st !== 'processing') {
      return { success: false, message: 'Solo se puede reintentar albaranes en error o procesando.' }
    }

    if (!String((inv as { file_path?: string }).file_path ?? '').trim()) {
      return { success: false, message: 'Sin imagen para reintentar. Sustituye la foto.' }
    }

    // Borrar líneas y re-encolar OCR de cabecera + todas las hojas
    if (st === 'ocr_failed') {
      await gate.supabase.from('purchase_invoice_lines').delete().eq('invoice_id', id)
      await gate.supabase
        .from('purchase_invoice_attachments')
        .update({ ocr_status: 'pending', ocr_error: null })
        .eq('invoice_id', id)
    }

    const { error: updErr } = await gate.supabase
      .from('purchase_invoices')
      .update({
        status: 'processing',
        ocr_error: null,
        duplicate_of_invoice_id: null,
        invoice_number: 'PROCESANDO…',
      })
      .eq('id', id)

    if (updErr) return { success: false, message: updErr.message }

    after(async () => {
      await runOcrForInvoice(id)
    })

    revalidateScannerPaths()
    return { success: true, invoiceId: id }
  } catch (err) {
    console.error('retryOcrInvoiceAction unexpected:', err)
    return { success: false, message: 'Error al reintentar OCR. Reintenta.' }
  }
}

/** Sustituye la foto principal y relanza OCR. */
export async function replaceScannerImageAction(params: {
  invoiceId: string
  base64DataUri: string
  filename: string
}): Promise<ProcessScannerImageResult> {
  try {
    const gate = await gateAuthenticated()
    if (!gate.ok || !gate.supabase) return { success: false, message: gate.message }
    const supabase = gate.supabase
    const userId = gate.userId

    const invoiceId = String(params.invoiceId ?? '').trim()
    if (!invoiceId) return { success: false, message: 'ID inválido' }

    const parsed = parseBase64DataUri(params.base64DataUri)
    if (!parsed) return { success: false, message: 'Formato de imagen inválido' }

    const { mimeType, buffer } = parsed
    const contentSha256 = createHash('sha256').update(buffer).digest('hex')

    const { data: inv, error: invErr } = await supabase
      .from('purchase_invoices')
      .select('id, status, file_path, content_sha256')
      .eq('id', invoiceId)
      .maybeSingle()

    if (invErr) return { success: false, message: invErr.message }
    if (!inv) return { success: false, message: 'Albarán no encontrado' }

    try {
      const { data: dupData, error: dupFnError } = await supabase.rpc('check_purchase_invoice_duplicate', {
        p_content_sha256: contentSha256,
        p_supplier_id: null,
        p_invoice_number: null,
        p_invoice_date: null,
      })
      if (!dupFnError && Boolean((dupData as { dup_by_hash?: boolean })?.dup_by_hash)) {
        const existingSha = String((inv as { content_sha256?: string }).content_sha256 ?? '')
        if (existingSha !== contentSha256) {
          return { success: false, message: 'Esta imagen ya pertenece a otro albarán.' }
        }
      }
    } catch (e) {
      console.error('replaceScannerImage duplicate check:', e)
    }

    const d = new Date()
    const filePath = `${userId}/${d.getFullYear()}/${d.getMonth() + 1}/${Date.now()}_replace_${params.filename}`

    const { error: uploadError } = await supabase.storage.from('albaranes').upload(filePath, buffer, {
      contentType: mimeType,
    })
    if (uploadError) return { success: false, message: `Error Storage: ${uploadError.message}` }

    // Limpiar líneas y re-encolar OCR de hojas adjuntas (la cabecera se relee)
    await supabase.from('purchase_invoice_lines').delete().eq('invoice_id', invoiceId)
    await supabase
      .from('purchase_invoice_attachments')
      .update({ ocr_status: 'pending', ocr_error: null })
      .eq('invoice_id', invoiceId)

    const oldPath = String((inv as { file_path?: string }).file_path ?? '').trim()
    const { error: updErr } = await supabase
      .from('purchase_invoices')
      .update({
        file_path: filePath,
        content_sha256: contentSha256,
        status: 'processing',
        ocr_error: null,
        duplicate_of_invoice_id: null,
        invoice_number: 'PROCESANDO…',
        total_amount: 0,
        base_amount: null,
        tax_amount: null,
        tax_rate: null,
      })
      .eq('id', invoiceId)

    if (updErr) {
      console.error('replaceScannerImage update:', updErr)
      return { success: false, message: 'Error actualizando la imagen del albarán' }
    }

    if (oldPath && oldPath !== filePath) {
      void supabase.storage.from('albaranes').remove([oldPath]).catch((e) => {
        console.error('replaceScannerImage remove old:', e)
      })
    }

    after(async () => {
      await runOcrForInvoice(invoiceId)
    })

    revalidateScannerPaths()
    return { success: true, invoiceId }
  } catch (err) {
    console.error('replaceScannerImageAction unexpected:', err)
    return { success: false, message: 'Error inesperado al sustituir la foto. Reintenta.' }
  }
}
