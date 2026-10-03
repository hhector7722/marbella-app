import { createHash } from 'node:crypto'
import {
  CANONICAL_EXTRACTION_SCHEMA_VERSION,
  canonicalDocumentJsonSchema,
  canonicalDocumentSchema,
  type CanonicalDocument,
} from './canonical.ts'

export const MISTRAL_OCR_MODEL = 'mistral-ocr-4-1'
export const MISTRAL_EXTRACTOR_VERSION = 'mistral-ocr-4-1-document-observation-v2'

export type DocumentExtraction = {
  extractor: 'mistral'
  extractorVersion: typeof MISTRAL_EXTRACTOR_VERSION
  schemaVersion: typeof CANONICAL_EXTRACTION_SCHEMA_VERSION
  model: string
  fileSha256: string
  canonical: CanonicalDocument
  rawResponse: unknown
  pageCount: number
  elapsedMs: number
  usageInfo: unknown
}

export function fileSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export async function extractWithMistral(params: {
  bytes: Uint8Array
  mimeType: string
  apiKey: string
  signal?: AbortSignal
}): Promise<DocumentExtraction> {
  const { bytes, mimeType, apiKey } = params
  if (!apiKey) throw new Error('MISTRAL_API_KEY no configurada')
  if (!['image/jpeg', 'image/png', 'application/pdf'].includes(mimeType)) {
    throw new Error(`Tipo de documento no soportado: ${mimeType}`)
  }
  if (bytes.length === 0 || bytes.length > 20_000_000) {
    throw new Error('El documento debe tener entre 1 byte y 20 MB')
  }

  const sourceHash = fileSha256(bytes)
  const dataUrl = `data:${mimeType};base64,${Buffer.from(bytes).toString('base64')}`
  const document = mimeType === 'application/pdf'
    ? { type: 'document_url', document_url: dataUrl }
    : { type: 'image_url', image_url: dataUrl }

  const started = Date.now()
  const response = await fetch('https://api.mistral.ai/v1/ocr', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MISTRAL_OCR_MODEL,
      document,
      table_format: 'markdown',
      include_blocks: true,
      confidence_scores_granularity: 'block',
      include_image_base64: false,
      document_annotation_format: {
        type: 'json_schema',
        json_schema: {
          name: 'marbella_document_observation_v2',
          strict: true,
          schema: canonicalDocumentJsonSchema,
        },
      },
      document_annotation_prompt: [
        'Transcribe todos los artículos del albarán o factura en orden, sin omitir líneas.',
        'Lee también los recuadros superiores e inferiores: proveedor, número, fecha y total; no los dejes vacíos si son legibles.',
        'El JSON representa únicamente lo visible en el documento: no asocies ingredientes internos, no conviertas unidades y no calcules importes.',
        'Conserva literalmente códigos, nombres, números, separadores decimales y unidades en los campos _raw.',
        'Usa null para valores no visibles o dudosos. No inventes fechas, densidades, descuentos ni tamaños de envase.',
        'Distingue precio bruto, precio neto, descuento y otros cargos usando la cabecera visible de cada columna.',
        'discount_raw solo corresponde a una columna de descuento; copia su cabecera en discount_header_raw. Ibee, impuesto de envases, canon y portes son otros cargos, nunca descuentos.',
        'net_unit_price_raw solo corresponde a una columna explícita de precio unitario neto, nunca a un porcentaje de descuento ni al importe total.',
        'Si se factura una caja o bulto pero el precio es por kg o unidad, separa cantidad de cajas, contenido y unidad física cuando sean visibles.',
        'subtotal_raw es la base neta antes de IVA, tax_raw la cuota de IVA y total_raw el importe final a pagar; no intercambies estas cifras.',
        'Incluye una fila impresa sin cantidad solo si tiene nombre de producto; deja quantity_raw null para que se distinga de una entrega real.',
        'No incluyas cabeceras, subtotales, IVA ni totales como artículos.',
      ].join(' '),
    }),
    signal: params.signal ?? AbortSignal.timeout(120_000),
  })
  const elapsedMs = Date.now() - started
  if (!response.ok) {
    // No registrar cuerpo de error: puede incluir texto del documento o URLs firmadas.
    throw new Error(`Mistral OCR devolvió HTTP ${response.status}`)
  }

  const rawResponse = await response.json() as Record<string, unknown>
  const annotation = rawResponse.document_annotation
  const parsed = canonicalDocumentSchema.safeParse(
    typeof annotation === 'string' ? JSON.parse(annotation) : annotation
  )
  if (!parsed.success) {
    throw new Error(`Anotación Mistral fuera del contrato: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`)
  }

  return {
    extractor: 'mistral',
    extractorVersion: MISTRAL_EXTRACTOR_VERSION,
    schemaVersion: CANONICAL_EXTRACTION_SCHEMA_VERSION,
    model: String(rawResponse.model || MISTRAL_OCR_MODEL),
    fileSha256: sourceHash,
    canonical: parsed.data,
    rawResponse,
    pageCount: Array.isArray(rawResponse.pages) ? rawResponse.pages.length : 0,
    elapsedMs,
    usageInfo: rawResponse.usage_info ?? null,
  }
}
