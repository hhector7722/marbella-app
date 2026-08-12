/**
 * Extracción Gemini de albaranes (solo OCR → JSON).
 * Compartida entre scanner productivo y backfill Evidence-only.
 * NO persiste nada.
 */

export type GeminiDocumentColumn = {
  index: number
  name: string | null
}
export type GeminiDocumentCell = {
  column_index: number
  raw_value: string | null
}
export type GeminiDocumentRow = {
  index: number
  cells: GeminiDocumentCell[]
}
export type GeminiDocumentTable = {
  index: number
  columns: GeminiDocumentColumn[]
  rows: GeminiDocumentRow[]
}

export type GeminiAlbaranData = {
  numero_factura?: string
  fecha?: string
  base_imponible?: number | null
  tipo_iva?: number | null
  total_iva?: number | null
  total?: number
  tables?: GeminiDocumentTable[]
}

export const GEMINI_ALBARAN_EXTRACTOR_VERSION = 'gemini-2.5-flash-tabular-v1'
export const GEMINI_ALBARAN_MODEL = 'gemini-2.5-flash'

export function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** Normaliza cabecera IVA: calcula base si falta pero hay total + tipo. */
export function normalizeGeminiAlbaranData(raw: unknown): GeminiAlbaranData {
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

export function parseOcrDate(raw: string | undefined | null): string | null {
  if (typeof raw !== 'string') return null
  const str = raw.trim()
  if (!str) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  const esMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
  if (esMatch) {
    const day = esMatch[1].padStart(2, '0')
    const month = esMatch[2].padStart(2, '0')
    const year = esMatch[3]
    return `${year}-${month}-${day}`
  }

  return str
}

const GEMINI_PROMPT = `
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

export async function extractAlbaranWithGemini(
  mimeType: string,
  rawBase64: string
): Promise<{ ok: true; data: GeminiAlbaranData; rawJson: unknown } | { ok: false; message: string }> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) return { ok: false, message: 'GEMINI_API_KEY no configurada' }

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_ALBARAN_MODEL}:generateContent?key=${geminiKey}`

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: GEMINI_PROMPT }, { inline_data: { mime_type: mimeType, data: rawBase64 } }],
        },
      ],
      generationConfig: { response_mime_type: 'application/json' },
    }),
  })

  if (!geminiRes.ok) {
    const errText = await geminiRes.text().catch(() => '')
    console.error('Gemini extractAlbaran error:', errText)
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
