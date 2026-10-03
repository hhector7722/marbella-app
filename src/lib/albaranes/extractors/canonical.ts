import { z } from 'zod'

const observedText = z.string().nullable()

export const canonicalLineSchema = z.strictObject({
  page_index: z.number().int().nonnegative().nullable(),
  supplier_product_code_raw: observedText,
  description_raw: z.string().min(1),
  quantity_raw: observedText,
  billing_unit_raw: observedText,
  package_count_raw: observedText,
  units_per_package_raw: observedText,
  content_per_unit_raw: observedText,
  content_unit_raw: observedText,
  unit_price_raw: observedText,
  discount_raw: observedText,
  discount_header_raw: observedText,
  other_charge_raw: observedText,
  other_charge_header_raw: observedText,
  net_unit_price_raw: observedText,
  line_total_raw: observedText,
  tax_rate_raw: observedText,
})

export const canonicalDocumentSchema = z.strictObject({
  supplier_name_raw: observedText,
  document_number_raw: observedText,
  document_date_raw: observedText,
  currency_raw: observedText,
  subtotal_raw: observedText,
  tax_raw: observedText,
  total_raw: observedText,
  lines: z.array(canonicalLineSchema),
})

export type CanonicalDocument = z.infer<typeof canonicalDocumentSchema>

const nullableString = { type: ['string', 'null'] } as const
const lineProperties = {
  page_index: { type: ['integer', 'null'], description: 'Zero-based document page number when visible.' },
  supplier_product_code_raw: nullableString,
  description_raw: { type: 'string', description: 'Exact visible product description; preserve OCR spelling.' },
  quantity_raw: nullableString,
  billing_unit_raw: nullableString,
  package_count_raw: nullableString,
  units_per_package_raw: nullableString,
  content_per_unit_raw: nullableString,
  content_unit_raw: nullableString,
  unit_price_raw: nullableString,
  discount_raw: nullableString,
  discount_header_raw: nullableString,
  other_charge_raw: nullableString,
  other_charge_header_raw: nullableString,
  net_unit_price_raw: nullableString,
  line_total_raw: nullableString,
  tax_rate_raw: nullableString,
} as const

const documentProperties = {
  supplier_name_raw: nullableString,
  document_number_raw: nullableString,
  document_date_raw: nullableString,
  currency_raw: nullableString,
  subtotal_raw: nullableString,
  tax_raw: nullableString,
  total_raw: nullableString,
  lines: {
    type: 'array',
    items: {
      type: 'object',
      properties: lineProperties,
      required: Object.keys(lineProperties),
      additionalProperties: false,
    },
  },
} as const

export const CANONICAL_EXTRACTION_SCHEMA_VERSION = 'document-observation-v2'

export const canonicalDocumentJsonSchema = {
  type: 'object',
  properties: documentProperties,
  required: Object.keys(documentProperties),
  additionalProperties: false,
} as const
