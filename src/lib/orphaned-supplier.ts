/** Proveedor asignado en ingrediente pero ausente en tabla `suppliers`. */

export function buildSupplierNameSet(suppliers: { name: string }[]): Set<string> {
  return new Set(
    suppliers
      .map((s) => String(s.name ?? '').trim())
      .filter(Boolean),
  )
}

export function getOrphanedSupplierName(
  name: string | null | undefined,
  namesFromDb: Set<string>,
  suppliersLoaded: boolean,
): string | null {
  const trimmed = String(name ?? '').trim()
  if (!trimmed || !suppliersLoaded) return null
  return namesFromDb.has(trimmed) ? null : trimmed
}
