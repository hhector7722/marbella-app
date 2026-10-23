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
    // Una lectura antigua de Panabad pegó «31» al final de «40 u».
    // Solo se corrige al final del nombre y después del tamaño de caja.
    .replace(/(\b\d+\s+)U31$/, '$1U')
    .split(/\s+/).map((token) => ['U', 'UD', 'UDS'].includes(token) ? 'UD' : token)
    .join(' ')
}

function splitTrailingCode(value: string): { name: string; code: string | null } {
  const normalized = normalizeNameForMatch(value)
  // A shorter final number can be a pack size, weight or product variant.
  const match = normalized.match(/^(.*\S)\s+(\d{6,})$/)
  return match ? { name: match[1]!, code: match[2]! } : { name: normalized, code: null }
}

function oneOcrCharacterApart(left: string, right: string): boolean {
  if (left.length < 12 || right.length < 12 || Math.abs(left.length - right.length) > 1) return false
  let i = 0
  let j = 0
  let edits = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) { i++; j++; continue }
    if (++edits > 1) return false
    if (left.length > right.length) i++
    else if (right.length > left.length) j++
    else { i++; j++ }
  }
  return edits + Number(i < left.length || j < right.length) === 1
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
  const candidates = legacy.map((line) => {
    const comparable = rows.filter((row) =>
      line.name.length > 0 && line.quantity != null && Number.isFinite(line.quantity) && line.quantity > 0
      && row.quantity === line.quantity && (!line.code || !row.code || line.code === row.code))
    const exact = comparable.filter((row) => line.name === row.name)
    return exact.length ? exact : comparable.filter((row) => oneOcrCharacterApart(line.name, row.name))
  })
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
