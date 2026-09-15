/**
 * Contrato puro de interpretación de albaranes por proveedor.
 *
 * No representa un mapeo proveedor→ingrediente ni una orden de escritura.
 * Su salida es una propuesta que todavía requiere mapeo seguro y revisión
 * humana antes de que K4 pueda confirmar nada.
 */

export const SUPPLIER_PROFILE_SCHEMA_VERSION = 1 as const

export type ProfileKind =
  | 'direct_line'
  | 'case_discount'
  | 'discounted_unit_line'
  | 'vat_included_pack'
  | 'volume_container'
  | 'internal_water'
  | 'mixed_measure_review'
  | 'net_unit_review'

export type FieldName =
  | 'product'
  | 'code'
  | 'quantity'
  | 'cases'
  | 'unit_type'
  | 'unit_price'
  | 'net_unit_price'
  | 'discount_percent'
  | 'discount_value'
  | 'line_amount'
  | 'line_amount_tax_included'
  | 'tax_percent'
  | 'tare'
  | 'presentation'
  | 'price_with_tax'

export type QuantityUnit = 'unit' | 'kg' | 'l' | 'case' | 'bag' | 'piece' | 'bundle'

export type EvidenceValue = string | number | null

export type EvidenceRow = Record<string, EvidenceValue>

/** Evidencia estructurada que podría haber producido Docling; no ejecuta OCR. */
export type SupplierEvidenceFixture = {
  supplier_id: number
  observed_issuer: string
  table: {
    headers: string[]
    rows: EvidenceRow[]
  }
  /** El perfil no resuelve el mapeo. El fixture declara su resultado externo. */
  item_mapping: 'verified' | 'missing'
}

export type SupplierProfile = {
  schema_version: typeof SUPPLIER_PROFILE_SCHEMA_VERSION
  id: string
  version: string
  supplier: {
    id: number
    canonical_name: string
    aliases: string[]
    observed_document_identities: string[]
  }
  reference: {
    file: string
    sha256: string
  }
  document_formats: Array<{
    id: string
    description: string
  }>
  fields: Partial<Record<FieldName, { aliases: string[]; meaning: string }>>
  interpretation: {
    kind: ProfileKind
    quantity_unit?: QuantityUnit
    accepted_quantity_units?: QuantityUnit[]
    price_unit?: string
    amount_tax_basis?: 'without_tax' | 'with_tax'
    tax_percent?: number
    units_per_case_from_description?: boolean
    content_per_unit_from_description?: boolean
    presentation_from_description?: boolean
    rounding_tolerance?: number
    notes?: string[]
  }
  exclusions?: Array<{
    when_description_includes: string
    reason: string
  }>
  needs_review: string[]
  examples: Array<{
    description: string
    expected: string
  }>
}

export type ReviewReason =
  | 'supplier_identity_unrecognized'
  | 'supplier_id_mismatch'
  | 'mapping_missing'
  | 'missing_product'
  | 'missing_quantity'
  | 'missing_unit_price'
  | 'missing_line_amount'
  | 'unknown_quantity_unit'
  | 'unsupported_presentation'
  | 'line_amount_mismatch'
  | 'discount_not_interpretable'
  | 'mixed_measurement_requires_review'
  | 'price_not_normalizable'

export type InterpretedLine = {
  source_row_index: number
  product: string | null
  observed: Record<string, EvidenceValue>
  physical: {
    quantity: number | null
    unit: QuantityUnit | null
    cases: number | null
    units_per_case: number | null
    content_per_unit: { value: number; unit: 'ml' | 'cl' | 'l' | 'g' | 'kg' } | null
  }
  economics: {
    unit_price_before_discount: number | null
    discount_percent: number | null
    net_unit_price: number | null
    line_amount_without_tax: number | null
    line_amount_with_tax: number | null
    tax_percent: number | null
  }
  proposal: {
    physical_quantity: number | null
    physical_unit: QuantityUnit | null
    normalized_unit_price: number | null
    normalized_price_unit: string | null
    eligible_for_stock_and_recipes: boolean
  }
  status: 'ready_for_review' | 'needs_review' | 'excluded'
  needs_review: ReviewReason[]
  exclusion_reason: string | null
}

export type SupplierProfileInterpretation = {
  supplier_profile_id: string
  supplier_profile_version: string
  supplier_identity: 'recognized' | 'needs_review'
  lines: InterpretedLine[]
}

export function isSupplierProfile(value: unknown): value is SupplierProfile {
  if (!value || typeof value !== 'object') return false
  const profile = value as Partial<SupplierProfile>
  return (
    profile.schema_version === SUPPLIER_PROFILE_SCHEMA_VERSION &&
    typeof profile.id === 'string' &&
    typeof profile.version === 'string' &&
    typeof profile.supplier?.id === 'number' &&
    typeof profile.supplier?.canonical_name === 'string' &&
    Array.isArray(profile.supplier?.aliases) &&
    Array.isArray(profile.reference?.file ? profile.document_formats : undefined) &&
    typeof profile.interpretation?.kind === 'string' &&
    Array.isArray(profile.needs_review) &&
    Array.isArray(profile.examples)
  )
}
