export const K5_TRUSTED_LEGACY_IMPORT_PREFIX = 'k5-legacy-import:' as const

function text(value: unknown): string {
  return String(value ?? '').trim()
}

export function trustedLegacyImportIdempotencyKey(legacyMappingId: string): string {
  return `${K5_TRUSTED_LEGACY_IMPORT_PREFIX}${text(legacyMappingId)}`
}

export function isTrustedLegacyImportedMappingVersion(row: Record<string, unknown>): boolean {
  const legacyMappingId = text(row.legacy_mapping_id)
  return Boolean(
    row.status === 'proposed'
    && legacyMappingId
    && text(row.idempotency_key) === trustedLegacyImportIdempotencyKey(legacyMappingId)
  )
}

export function isK5ReusableMappingVersion(row: Record<string, unknown>): boolean {
  return row.status === 'confirmed' || isTrustedLegacyImportedMappingVersion(row)
}
