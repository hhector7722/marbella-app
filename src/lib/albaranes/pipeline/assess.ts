import type { CanonicalDocument } from '../extractors/canonical.ts'
import { buildExactMappedSnapshot, type ExactMappingInput } from '../k5/mapped-snapshot.ts'
import { matchSupplierProduct, type SupplierProductMemory } from './matcher.ts'
import { validateObservedDocument } from './validate.ts'

export type PresentationMemory = SupplierProductMemory & ExactMappingInput & {
  lineBillingUnit: string
  status: 'confirmed' | 'trusted_legacy' | 'unverified'
}

export type LineAssessment = {
  rowIndex: number
  status: 'ready_for_review' | 'needs_review' | 'needs_mapping'
  ingredientId: string | null
  mappingVersionId: string | null
  matchSource: string
  matchScore: number
  normalized: ReturnType<typeof buildExactMappedSnapshot>
  observedQuantity: number | null
  observedUnitPrice: number | null
  observedLineTotal: number | null
  economicQuantity: string | null
  effectiveUnitPrice: string | null
  reasons: string[]
}

function unit(value: string | null): string | null {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (!normalized) return null
  if (['kg', 'kilo', 'kilos', 'quilos'].includes(normalized)) return 'kg'
  if (['g', 'gr', 'gramos'].includes(normalized)) return 'g'
  if (['l', 'lt', 'lts', 'litros'].includes(normalized)) return 'l'
  if (normalized === 'ml') return 'ml'
  if (normalized === 'cl') return 'cl'
  if (['ud', 'uds', 'un', 'uni', 'unidad', 'unidades'].includes(normalized)) return 'ud'
  if (['cj', 'caja', 'cajas'].includes(normalized)) return 'caja'
  if (['bu', 'bulto', 'bultos'].includes(normalized)) return 'bulto'
  return null
}

function unique(values: string[]): string[] { return [...new Set(values)] }

export function assessDocument(params: {
  document: CanonicalDocument
  supplierId: number
  memory: SupplierProductMemory[]
  presentations: PresentationMemory[]
}): { lines: LineAssessment[]; documentReasons: string[]; readyCount: number } {
  const validation = validateObservedDocument(params.document)
  const lines = params.document.lines.map((line, rowIndex): LineAssessment => {
    const check = validation.lines[rowIndex]!
    const match = matchSupplierProduct({ supplierId: params.supplierId,
      productCode: line.supplier_product_code_raw, description: line.description_raw, memory: params.memory })
    const reasons = [...check.reasons]
    if (!match.ingredientId) reasons.push(match.source === 'ambiguous' ? 'varios_ingredientes_posibles' : 'producto_sin_mapping')

    const presentation = params.presentations.find((candidate) =>
      candidate.mappingVersionId === match.mappingVersionId
      && candidate.ingredientId === match.ingredientId
      && candidate.status !== 'unverified')
    if (match.ingredientId && !presentation) reasons.push('presentacion_sin_validar')

    const billedUnit = unit(line.billing_unit_raw)
    const mappingUnit = unit(presentation?.lineBillingUnit ?? null)
    if (billedUnit && mappingUnit && billedUnit !== mappingUnit && check.priceBasis !== 'package_content') {
      reasons.push('unidad_facturada_incompatible')
    }

    let normalized: ReturnType<typeof buildExactMappedSnapshot> = null
    let economicQuantity: string | null = null
    let effectiveUnitPrice: string | null = null
    if (presentation && check.quantity && check.unitPrice && check.lineTotal != null && check.priceBasis) {
      let numericEconomicQuantity = check.quantity
      if (check.priceBasis === 'package_content') {
        const packageContent = Number(String(line.content_per_unit_raw ?? '').replace(',', '.'))
        if (!Number.isFinite(packageContent) || packageContent <= 0) reasons.push('contenido_de_caja_invalido')
        else numericEconomicQuantity *= packageContent
      } else if (check.priceBasis === 'units_per_package') {
        const unitsPerPackage = Number(String(line.units_per_package_raw ?? '').replace(',', '.'))
        if (!Number.isFinite(unitsPerPackage) || unitsPerPackage <= 0) reasons.push('unidades_por_caja_invalidas')
        else numericEconomicQuantity *= unitsPerPackage
      }
      const observedUnitPrice = check.lineTotal / numericEconomicQuantity
      if (Number.isFinite(observedUnitPrice) && observedUnitPrice > 0) {
        // K4 persiste cantidad con 3 decimales y precio con 4. La propuesta
        // debe calcular exactamente a esa escala para que el preview coincida.
        if (Math.abs(numericEconomicQuantity - Number(numericEconomicQuantity.toFixed(3))) > 0.00000001) {
          reasons.push('cantidad_supera_precision_k4')
        } else {
          economicQuantity = numericEconomicQuantity.toFixed(3)
          effectiveUnitPrice = observedUnitPrice.toFixed(4)
          if (Math.abs(Number(economicQuantity) * Number(effectiveUnitPrice) - check.lineTotal) > 0.03) {
            reasons.push('redondeo_economico_no_reconcilia')
          } else {
            normalized = buildExactMappedSnapshot({ lineQuantity: economicQuantity,
              observedUnitPrice: effectiveUnitPrice, mapping: presentation })
          }
        }
      }
      if (!normalized) reasons.push('conversion_de_presentacion_incompatible')
    }

    if (validation.reasons.length) reasons.push(...validation.reasons)
    const distinct = unique(reasons)
    const status = !match.ingredientId ? 'needs_mapping'
      : distinct.length ? 'needs_review' : 'ready_for_review'
    return { rowIndex, status, ingredientId: match.ingredientId,
      mappingVersionId: presentation?.mappingVersionId ?? null,
      matchSource: match.source, matchScore: match.score, normalized,
      observedQuantity: check.quantity, observedUnitPrice: check.unitPrice,
      observedLineTotal: check.lineTotal, economicQuantity, effectiveUnitPrice,
      reasons: distinct }
  })
  return { lines, documentReasons: validation.reasons,
    readyCount: lines.filter((line) => line.status === 'ready_for_review').length }
}
