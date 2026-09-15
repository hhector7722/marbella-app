import { createHash } from 'node:crypto'
import { interpretSupplierEvidence } from '../supplier-profiles/interpret.ts'
import type {
  EvidenceRow,
  FieldName,
  QuantityUnit,
  SupplierEvidenceFixture,
  SupplierProfile,
} from '../supplier-profiles/types.ts'
import {
  divideExact,
  isPositiveExact,
  multiplyExact,
  parseExactDecimal,
  ratio,
  toFiniteDecimalString,
  withinExactTolerance,
  type ExactRatio,
} from './exact-decimal.ts'
import {
  extractDoclingTables,
  matchProfileTable,
  normalizeEvidenceLabel,
  rowByProfileFields,
  type K5EvidenceTable,
} from './docling-evidence.ts'

export const K5_NORMALIZER_VERSION = 'k5-normalizer-v1' as const

export type K5MappingSnapshot = {
  id: string
  supplierItemName: string
  ingredientId: string
  conversionFactor: string
  lineBillingUnit: string
  lineContentQty: string
  lineContentUnit: string
  purchaseUnit: string
  baseUnit: string
}

export type K5ProposalStatus = 'needs_mapping' | 'needs_review' | 'excluded' | 'ready_for_review'

export type K5NormalizedProposal = {
  sourceTableIndex: number | null
  sourceRowIndex: number | null
  sourceItemName: string | null
  mappingVersionId: string | null
  ingredientId: string | null
  status: K5ProposalStatus
  observed: Record<string, unknown>
  interpreted: Record<string, unknown>
  normalized: Record<string, unknown>
  pricing: Record<string, unknown>
  reviewReasons: string[]
  warnings: string[]
  lineQuantity: string | null
  lineUnit: string | null
  observedUnitPrice: string | null
  lineTotal: string | null
  physicalQuantity: string | null
  baseUnit: string | null
  purchaseQuantity: string | null
  purchaseUnit: string | null
  normalizedUnitPrice: string | null
}

export type K5NormalizationResult = {
  supplierProfileId: string
  supplierProfileVersion: string
  normalizerVersion: typeof K5_NORMALIZER_VERSION
  observedIssuer: string | null
  proposals: K5NormalizedProposal[]
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))]
}

function observedDocumentText(rawArtifact: unknown): string {
  if (!rawArtifact || typeof rawArtifact !== 'object') return ''
  const document = (rawArtifact as Record<string, unknown>).document
  if (!document || typeof document !== 'object') return ''
  const d = document as Record<string, unknown>
  return [d.text_content, d.md_content, d.html_content]
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

export function detectObservedIssuer(profile: SupplierProfile, rawArtifact: unknown): string | null {
  const text = normalizeEvidenceLabel(observedDocumentText(rawArtifact))
  if (!text) return null
  const candidates = [
    ...profile.supplier.observed_document_identities,
    profile.supplier.canonical_name,
    ...profile.supplier.aliases,
  ]
  return candidates.find((candidate) => text.includes(normalizeEvidenceLabel(candidate))) ?? null
}

function interpreterRow(profile: SupplierProfile, semantic: EvidenceRow): EvidenceRow {
  const row: EvidenceRow = {}
  for (const [fieldName, definition] of Object.entries(profile.fields) as Array<[
    FieldName,
    NonNullable<SupplierProfile['fields'][FieldName]>
  ]>) {
    row[definition.aliases[0] ?? fieldName] = semantic[fieldName] ?? null
  }
  return row
}

function semanticText(row: EvidenceRow, field: FieldName): string | null {
  const value = row[field]
  if (value == null) return null
  const text = String(value).trim()
  return text || null
}

const billingAliases: Record<string, string> = {
  kg: 'kg', k: 'kg', kilo: 'kg', kilos: 'kg',
  l: 'l', lt: 'l', litro: 'l', litros: 'l',
  ml: 'ml', cl: 'cl', g: 'g', gr: 'g',
  ud: 'ud', uds: 'ud', u: 'ud', un: 'ud', uni: 'ud', unidad: 'ud', unidades: 'ud',
  cj: 'case', caja: 'case', cajas: 'case', case: 'case',
  bolsa: 'bag', bolsas: 'bag', bag: 'bag',
  pz: 'piece', pieza: 'piece', piezas: 'piece', piece: 'piece',
  bu: 'bundle', bulto: 'bundle', bultos: 'bundle', bundle: 'bundle',
}

function defaultBillingUnit(unit?: QuantityUnit): string | null {
  if (!unit) return null
  if (unit === 'unit') return 'ud'
  return unit
}

export function observedBillingUnit(value: string | null, fallback?: QuantityUnit): string | null {
  if (value) {
    const suffix = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/[a-z]+/g)
      ?.at(-1)
    if (suffix && billingAliases[suffix]) return billingAliases[suffix]
  }
  return defaultBillingUnit(fallback)
}

function canonicalBillingUnit(value: string): string | null {
  const normalized = normalizeEvidenceLabel(value).replace(/ /g, '')
  return billingAliases[normalized] ?? (normalized || null)
}

function canonicalPhysicalUnit(value: string): 'kg' | 'g' | 'l' | 'ml' | 'cl' | 'ud' | null {
  const normalized = canonicalBillingUnit(value)
  if (normalized === 'kg' || normalized === 'g' || normalized === 'l' || normalized === 'ml' || normalized === 'cl' || normalized === 'ud') return normalized
  return null
}

function convertExactUnit(quantity: ExactRatio, fromUnit: string, toUnit: string): ExactRatio | null {
  const from = canonicalPhysicalUnit(fromUnit)
  const to = canonicalPhysicalUnit(toUnit)
  if (!from || !to) return null
  if (from === to) return quantity

  const mass = new Set(['kg', 'g'])
  const volume = new Set(['l', 'ml', 'cl'])
  if (mass.has(from) && mass.has(to)) {
    if (from === 'kg' && to === 'g') return multiplyExact(quantity, ratio(1000n))
    if (from === 'g' && to === 'kg') return divideExact(quantity, ratio(1000n))
  }
  if (volume.has(from) && volume.has(to)) {
    if (from === 'l' && to === 'ml') return multiplyExact(quantity, ratio(1000n))
    if (from === 'l' && to === 'cl') return multiplyExact(quantity, ratio(100n))
    if (from === 'ml' && to === 'l') return divideExact(quantity, ratio(1000n))
    if (from === 'ml' && to === 'cl') return divideExact(quantity, ratio(10n))
    if (from === 'cl' && to === 'ml') return multiplyExact(quantity, ratio(10n))
    if (from === 'cl' && to === 'l') return divideExact(quantity, ratio(100n))
  }
  return null
}

function compatibleMapping(
  mappings: readonly K5MappingSnapshot[],
  product: string | null,
  observedUnit: string | null
): K5MappingSnapshot | null {
  if (!product || !observedUnit) return null
  const item = normalizeEvidenceLabel(product)
  const matching = mappings.filter((mapping) =>
    normalizeEvidenceLabel(mapping.supplierItemName) === item
    && canonicalBillingUnit(mapping.lineBillingUnit) === canonicalBillingUnit(observedUnit)
  )
  return matching.length === 1 ? matching[0]! : null
}

function value(row: EvidenceRow, field: FieldName): string | null {
  const raw = row[field]
  if (raw == null) return null
  const text = String(raw).trim()
  return text || null
}

function exactLineEconomics(
  profile: SupplierProfile,
  row: EvidenceRow,
  interpreted: ReturnType<typeof interpretSupplierEvidence>['lines'][number]
): { unitPrice: ExactRatio | null; lineTotal: ExactRatio | null; reasons: string[] } {
  const reasons: string[] = []
  const quantity = parseExactDecimal(value(row, 'quantity'))
  const cases = parseExactDecimal(value(row, 'cases'))
  const unitPrice = parseExactDecimal(value(row, 'unit_price'))
  const netUnitPrice = parseExactDecimal(value(row, 'net_unit_price'))
  const amount = parseExactDecimal(value(row, 'line_amount'))
  const amountWithTax = parseExactDecimal(value(row, 'line_amount_tax_included'))

  let resultPrice: ExactRatio | null = null
  let resultTotal: ExactRatio | null = amount

  switch (profile.interpretation.kind) {
    case 'case_discount': {
      if (isPositiveExact(amount) && isPositiveExact(quantity)) resultPrice = divideExact(amount, quantity)
      break
    }
    case 'discounted_unit_line': {
      if (isPositiveExact(amount) && isPositiveExact(quantity)) resultPrice = divideExact(amount, quantity)
      break
    }
    case 'vat_included_pack': {
      const tax = profile.interpretation.tax_percent
      if (isPositiveExact(amountWithTax) && typeof tax === 'number') {
        const taxRatio = parseExactDecimal(String(tax))
        if (taxRatio) {
          const denominator = divideExact(
            { numerator: 100n, denominator: 1n },
            { numerator: 100n * taxRatio.denominator + taxRatio.numerator, denominator: taxRatio.denominator }
          )
          if (denominator) resultTotal = multiplyExact(amountWithTax, denominator)
        }
      }
      if (isPositiveExact(resultTotal) && isPositiveExact(quantity)) resultPrice = divideExact(resultTotal, quantity)
      break
    }
    case 'internal_water': {
      if (interpreted.status !== 'excluded' && interpreted.product) {
        const description = normalizeEvidenceLabel(interpreted.product)
        if (description.includes('50 cl') || description.includes('0 5') || description.includes('0 50')) {
          resultPrice = parseExactDecimal('0.28')
          if (isPositiveExact(quantity) && resultPrice) resultTotal = multiplyExact(quantity, resultPrice)
        }
      }
      break
    }
    case 'net_unit_review': {
      resultPrice = netUnitPrice
      break
    }
    case 'direct_line':
    case 'volume_container':
    case 'mixed_measure_review': {
      resultPrice = netUnitPrice ?? unitPrice
      break
    }
  }

  if (resultPrice && toFiniteDecimalString(resultPrice) == null) reasons.push('price_not_normalizable')
  if (resultTotal && toFiniteDecimalString(resultTotal) == null) reasons.push('price_not_normalizable')

  const tolerance = parseExactDecimal(String(profile.interpretation.rounding_tolerance ?? 0.01))
  const billedQuantity = quantity ?? cases
  if (
    isPositiveExact(resultPrice)
    && isPositiveExact(billedQuantity)
    && isPositiveExact(resultTotal)
    && tolerance
  ) {
    const expected = multiplyExact(billedQuantity, resultPrice)
    if (!withinExactTolerance(expected, resultTotal, tolerance)) reasons.push('line_amount_mismatch')
  }

  return { unitPrice: resultPrice, lineTotal: resultTotal, reasons }
}

function mappingNormalization(
  mapping: K5MappingSnapshot,
  lineQuantity: ExactRatio,
  unitPrice: ExactRatio
): {
  physicalQuantity: string
  baseUnit: string
  purchaseQuantity: string
  purchaseUnit: string
  normalizedUnitPrice: string
} | null {
  const factor = parseExactDecimal(mapping.conversionFactor)
  const content = parseExactDecimal(mapping.lineContentQty)
  if (!isPositiveExact(factor) || !isPositiveExact(content)) return null

  const contentInPurchaseUnit = convertExactUnit(content, mapping.lineContentUnit, mapping.purchaseUnit)
  if (!contentInPurchaseUnit || contentInPurchaseUnit.numerator !== factor.numerator || contentInPurchaseUnit.denominator !== factor.denominator) {
    return null
  }

  const purchaseQuantity = multiplyExact(lineQuantity, factor)
  const physicalQuantity = convertExactUnit(purchaseQuantity, mapping.purchaseUnit, mapping.baseUnit)
  const normalizedPrice = divideExact(unitPrice, factor)
  if (!physicalQuantity || !normalizedPrice) return null

  const purchase = toFiniteDecimalString(purchaseQuantity)
  const physical = toFiniteDecimalString(physicalQuantity)
  const price = toFiniteDecimalString(normalizedPrice)
  if (!purchase || !physical || !price) return null

  return {
    physicalQuantity: physical,
    baseUnit: mapping.baseUnit,
    purchaseQuantity: purchase,
    purchaseUnit: mapping.purchaseUnit,
    normalizedUnitPrice: price,
  }
}

function allObservedMeasures(table: K5EvidenceTable, rowIndex: number): string[] {
  const row = table.rows.find((candidate) => candidate.index === rowIndex)
  if (!row) return []
  return row.cells.filter((cell) => /\d\s*(?:KG|G|L|ML|CL|PZ|BU|CJ|UD|UN)\b/i.test(cell))
}

export function normalizeDoclingEvidence(params: {
  profile: SupplierProfile
  rawArtifact: unknown
  supplierId: number
  mappings: readonly K5MappingSnapshot[]
}): K5NormalizationResult {
  const { profile, rawArtifact, supplierId, mappings } = params
  const tables = extractDoclingTables(rawArtifact)
  const match = matchProfileTable(profile, tables)
  const observedIssuer = detectObservedIssuer(profile, rawArtifact)

  if (!match) {
    return {
      supplierProfileId: profile.id,
      supplierProfileVersion: profile.version,
      normalizerVersion: K5_NORMALIZER_VERSION,
      observedIssuer,
      proposals: [{
        sourceTableIndex: null,
        sourceRowIndex: null,
        sourceItemName: null,
        mappingVersionId: null,
        ingredientId: null,
        status: 'needs_review',
        observed: { tables_found: tables.length },
        interpreted: {},
        normalized: {},
        pricing: {},
        reviewReasons: ['profile_table_not_found'],
        warnings: [],
        lineQuantity: null,
        lineUnit: null,
        observedUnitPrice: null,
        lineTotal: null,
        physicalQuantity: null,
        baseUnit: null,
        purchaseQuantity: null,
        purchaseUnit: null,
        normalizedUnitPrice: null,
      }],
    }
  }

  const semanticRows = match.table.rows.map((row) => rowByProfileFields(match, row))
  const proposals = semanticRows.map((semanticRow, index): K5NormalizedProposal => {
    const product = semanticText(semanticRow, 'product')
    const observedQuantityText = value(semanticRow, 'quantity')
    const billingUnit = observedBillingUnit(observedQuantityText, profile.interpretation.quantity_unit)
    const mapping = compatibleMapping(mappings, product, billingUnit)
    const fixture: SupplierEvidenceFixture = {
      supplier_id: supplierId,
      observed_issuer: observedIssuer ?? '',
      table: {
        headers: Object.values(profile.fields).flatMap((field) => field?.aliases.slice(0, 1) ?? []),
        rows: [interpreterRow(profile, semanticRow)],
      },
      item_mapping: mapping ? 'verified' : 'missing',
    }
    const interpreted = interpretSupplierEvidence(profile, fixture).lines[0]!
    const economics = exactLineEconomics(profile, semanticRow, interpreted)
    const reasons = unique([...interpreted.needs_review, ...economics.reasons])
    const warnings: string[] = []

    if (profile.interpretation.kind === 'mixed_measure_review') {
      const measures = allObservedMeasures(match.table, match.table.rows[index]!.index)
      if (measures.length > 0) warnings.push(`observed_measures:${measures.join('|')}`)
    }

    if (interpreted.status === 'excluded') {
      return {
        sourceTableIndex: match.table.index,
        sourceRowIndex: match.table.rows[index]!.index,
        sourceItemName: product,
        mappingVersionId: null,
        ingredientId: null,
        status: 'excluded',
        observed: { ...semanticRow, raw_cells: match.table.rows[index]!.cells },
        interpreted: { ...interpreted, observed_measures: allObservedMeasures(match.table, match.table.rows[index]!.index) },
        normalized: {},
        pricing: {},
        reviewReasons: reasons.filter((reason) => reason !== 'mapping_missing'),
        warnings,
        lineQuantity: null,
        lineUnit: null,
        observedUnitPrice: null,
        lineTotal: null,
        physicalQuantity: null,
        baseUnit: null,
        purchaseQuantity: null,
        purchaseUnit: null,
        normalizedUnitPrice: null,
      }
    }

    const lineQuantity = parseExactDecimal(observedQuantityText)
    const unitPrice = economics.unitPrice
    const lineTotal = economics.lineTotal
    let normalization: ReturnType<typeof mappingNormalization> = null

    if (mapping && isPositiveExact(lineQuantity) && isPositiveExact(unitPrice)) {
      normalization = mappingNormalization(mapping, lineQuantity, unitPrice)
      if (!normalization) reasons.push('mapping_presentation_incompatible')
    }

    const semanticReasons = unique(reasons.filter((reason) => reason !== 'mapping_missing'))
    const status: K5ProposalStatus = semanticReasons.length > 0
      ? 'needs_review'
      : !mapping
        ? 'needs_mapping'
        : normalization
          ? 'ready_for_review'
          : 'needs_review'

    const unitPriceString = unitPrice ? toFiniteDecimalString(unitPrice) : null
    const lineTotalString = lineTotal ? toFiniteDecimalString(lineTotal) : null
    const quantityString = lineQuantity ? toFiniteDecimalString(lineQuantity) : null

    return {
      sourceTableIndex: match.table.index,
      sourceRowIndex: match.table.rows[index]!.index,
      sourceItemName: product,
      mappingVersionId: mapping?.id ?? null,
      ingredientId: mapping?.ingredientId ?? null,
      status,
      observed: { ...semanticRow, raw_cells: match.table.rows[index]!.cells },
      interpreted: { ...interpreted, observed_measures: allObservedMeasures(match.table, match.table.rows[index]!.index) },
      normalized: normalization ?? {},
      pricing: {
        observed_unit_price: unitPriceString,
        line_total: lineTotalString,
        source: profile.interpretation.kind,
      },
      reviewReasons: status === 'needs_mapping'
        ? ['mapping_missing']
        : unique([...semanticReasons, ...(status === 'needs_review' && mapping && !normalization ? ['price_not_normalizable'] : [])]),
      warnings,
      lineQuantity: quantityString,
      lineUnit: mapping?.lineBillingUnit ?? billingUnit,
      observedUnitPrice: unitPriceString,
      lineTotal: lineTotalString,
      physicalQuantity: normalization?.physicalQuantity ?? null,
      baseUnit: normalization?.baseUnit ?? null,
      purchaseQuantity: normalization?.purchaseQuantity ?? null,
      purchaseUnit: normalization?.purchaseUnit ?? null,
      normalizedUnitPrice: normalization?.normalizedUnitPrice ?? null,
    }
  })

  return {
    supplierProfileId: profile.id,
    supplierProfileVersion: profile.version,
    normalizerVersion: K5_NORMALIZER_VERSION,
    observedIssuer,
    proposals,
  }
}

export function proposalInputFingerprint(input: unknown): string {
  function sort(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(sort)
    if (value && typeof value === 'object') {
      const source = value as Record<string, unknown>
      return Object.fromEntries(Object.keys(source).sort().map((key) => [key, sort(source[key])]))
    }
    return value
  }
  return createHash('sha256').update(JSON.stringify(sort(input)), 'utf8').digest('hex')
}
