/**
 * Read-only reconciliation of old invoice lines with Mistral rows. A match is
 * evidence for a later review, never permission to create a receipt.
 */
export type LegacyLineInput = {
  id: string
  originalName: string
  quantity: number | null
}

export type MistralRowInput = {
  rowIndex: number
  descriptionRaw: string
  quantityRaw: string | null
  supplierProductCodeRaw: string | null
}

export type LegacyMatchResult = {
  legacyLineId: string
  mistralRowIndex: number | null
  reason: 'matched' | 'invalid_evidence' | 'no_exact_match' | 'ambiguous_mistral_rows' | 'ambiguous_legacy_lines'
  evidence: {
    normalizedLegacyName: string
    normalizedMistralName: string | null
    legacyQuantity: number | null
    mistralQuantity: number | null
    legacyCode: string | null
    mistralCode: string | null
  }
}

export function normalizeNameForMatch(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
    .split(/\s+/).map((token) => ['U', 'UD', 'UDS'].includes(token) ? 'UD' : token)
    .join(' ')
}

function splitTrailingCode(value: string): { name: string; code: string | null } {
  const normalized = normalizeNameForMatch(value)
  // A shorter final number can be a pack size, weight or product variant.
  const match = normalized.match(/^(.*\S)\s+(\d{6,})$/)
  return match ? { name: match[1]!, code: match[2]! } : { name: normalized, code: null }
}

export function parseQuantity(raw: string | null): number | null {
  const match = raw?.trim().match(/^(\d+(?:[,.]\d+)?)(?:\s*(?:U|UD|UDS|CAJA|CAJAS)\.?)?$/i)
  if (!match) return null
  const value = Number(match[1]!.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function matchLegacyLinesToMistral(params: {
  legacyLines: LegacyLineInput[]
  mistralRows: MistralRowInput[]
}): LegacyMatchResult[] {
  const legacy = params.legacyLines.map((line) => ({
    ...line,
    ...splitTrailingCode(line.originalName),
  }))
  const rows = params.mistralRows.map((row) => ({
    ...row,
    ...splitTrailingCode(row.descriptionRaw),
    quantity: parseQuantity(row.quantityRaw),
  }))
  const candidates = legacy.map((line) => rows.filter((row) =>
    line.name.length > 0 && line.name === row.name
    && line.quantity != null && Number.isFinite(line.quantity) && line.quantity > 0
    && row.quantity === line.quantity
    && (!line.code || !row.code || line.code === row.code)))
  const demand = new Map<number, number>()
  for (const matches of candidates) {
    if (matches.length === 1) {
      const index = matches[0]!.rowIndex
      demand.set(index, (demand.get(index) ?? 0) + 1)
    }
  }

  return legacy.map((line, index) => {
    const matches = candidates[index]!
    const row = matches.length === 1 ? matches[0]! : null
    const invalid = !line.name || line.quantity == null || !Number.isFinite(line.quantity) || line.quantity <= 0
    const reason: LegacyMatchResult['reason'] = invalid ? 'invalid_evidence'
      : matches.length === 0 ? 'no_exact_match'
        : matches.length > 1 ? 'ambiguous_mistral_rows'
          : (demand.get(row!.rowIndex) ?? 0) > 1 ? 'ambiguous_legacy_lines'
            : 'matched'
    const accepted = reason === 'matched' ? row : null
    return {
      legacyLineId: line.id,
      mistralRowIndex: accepted?.rowIndex ?? null,
      reason,
      evidence: {
        normalizedLegacyName: line.name,
        normalizedMistralName: row?.name ?? null,
        legacyQuantity: line.quantity,
        mistralQuantity: row?.quantity ?? null,
        legacyCode: line.code,
        mistralCode: row?.code ?? null,
      },
    }
  })
}
