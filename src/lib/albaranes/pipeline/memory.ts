import { isK5ReusableMappingVersion, isTrustedLegacyImportedMappingVersion } from '../k5/trusted-mapping.ts'
import type { SupplierProductMemory } from './matcher.ts'
import type { PresentationMemory } from './assess.ts'

export type LegacyMappingRow = {
  id: string
  supplier_id: number
  supplier_item_name: string
  ingredient_id: string | null
}

export type VersionRow = {
  id: string
  legacy_mapping_id: string | null
  supplier_id: number
  supplier_item_name: string
  ingredient_id: string | null
  conversion_factor: number | string | null
  line_billing_unit: string | null
  line_content_qty: number | string | null
  line_content_unit: string | null
  status: string
  supersedes_id: string | null
  idempotency_key: string | null
}

export type IngredientUnitRow = {
  id: string
  purchase_unit: string | null
  base_unit: string | null
}

export type ObservedCodeRow = {
  mapping_version_id: string | null
  observed: { supplier_product_code_raw?: string | null } | null
}

export function buildSupplierMemory(input: {
  legacy: LegacyMappingRow[]
  versions: VersionRow[]
  ingredients: IngredientUnitRow[]
  observedCodes?: ObservedCodeRow[]
}): { identities: SupplierProductMemory[]; presentations: PresentationMemory[] } {
  // Una propuesta nueva todavía no invalida la última decisión confirmada.
  const superseded = new Set(input.versions
    .filter((row) => isK5ReusableMappingVersion(row as unknown as Record<string, unknown>))
    .map((row) => row.supersedes_id).filter(Boolean))
  const leaves = input.versions.filter((row) => !superseded.has(row.id))
  const ingredientById = new Map(input.ingredients.map((row) => [row.id, row]))
  const codesByVersion = new Map<string, Set<string>>()
  for (const row of input.observedCodes ?? []) {
    const code = row.observed?.supplier_product_code_raw?.trim()
    if (!row.mapping_version_id || !code) continue
    if (!codesByVersion.has(row.mapping_version_id)) codesByVersion.set(row.mapping_version_id, new Set())
    codesByVersion.get(row.mapping_version_id)!.add(code)
  }
  const versionById = new Map(input.versions.map((row) => [row.id, row]))
  function codeFor(version: VersionRow): string | null {
    const seen = new Set<string>()
    let cursor: VersionRow | undefined = version
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      const codes = codesByVersion.get(cursor.id)
      if (codes?.size === 1) return [...codes][0]!
      if (codes && codes.size > 1) return null
      cursor = cursor.supersedes_id ? versionById.get(cursor.supersedes_id) : undefined
    }
    return null
  }
  const presentations: PresentationMemory[] = []
  for (const version of leaves) {
    if (!version.ingredient_id || !isK5ReusableMappingVersion(version as unknown as Record<string, unknown>)) continue
    const ingredient = ingredientById.get(version.ingredient_id)
    if (!ingredient?.purchase_unit || !ingredient.base_unit ||
        !version.line_billing_unit || !version.line_content_unit ||
        version.line_content_qty == null || version.conversion_factor == null) continue
    const signature = [version.conversion_factor, version.line_billing_unit,
      version.line_content_qty, version.line_content_unit].map(String).join('|')
    presentations.push({ supplierId: version.supplier_id, ingredientId: version.ingredient_id,
      supplierProductCode: codeFor(version), observedName: version.supplier_item_name,
      mappingVersionId: version.id, trustedPresentation: true,
      presentationSignature: signature,
      status: version.status === 'confirmed' ? 'confirmed'
        : isTrustedLegacyImportedMappingVersion(version as unknown as Record<string, unknown>)
          ? 'trusted_legacy' : 'unverified',
      conversionFactor: String(version.conversion_factor),
      lineBillingUnit: version.line_billing_unit,
      lineContentQty: String(version.line_content_qty), lineContentUnit: version.line_content_unit,
      purchaseUnit: ingredient.purchase_unit, baseUnit: ingredient.base_unit })
  }
  const presentationByLegacy = new Map<string, PresentationMemory>()
  for (const presentation of presentations) {
    const version = leaves.find((row) => row.id === presentation.mappingVersionId)
    if (!version?.legacy_mapping_id) continue
    const existing = presentationByLegacy.get(version.legacy_mapping_id)
    if (!existing || (presentation.status === 'confirmed' && existing.status !== 'confirmed')) {
      presentationByLegacy.set(version.legacy_mapping_id, presentation)
    }
  }
  const identities: SupplierProductMemory[] = input.legacy.filter((row) => row.ingredient_id)
    .map((row) => {
      const presentation = presentationByLegacy.get(row.id)
      return { supplierId: row.supplier_id, ingredientId: row.ingredient_id!,
        supplierProductCode: presentation?.supplierProductCode ?? null, observedName: row.supplier_item_name,
        mappingVersionId: presentation?.mappingVersionId ?? null,
        trustedPresentation: Boolean(presentation),
        presentationSignature: presentation?.presentationSignature ?? null }
    })
  // Las correcciones versionadas sin fila legacy también son memoria verificable.
  for (const presentation of presentations) {
    if (!identities.some((row) => row.mappingVersionId === presentation.mappingVersionId)) {
      identities.push(presentation)
    }
  }
  return { identities, presentations }
}
