export type VariableWeightEvidence = {
  weightKg: number
  pieceCount: number | null
  matchedMeasure: string
  observedMeasures: string[]
}

function decimal(value: unknown): number | null {
  const source = String(value ?? '').trim()
  const raw = source.includes(',')
    ? source.replace(/\./g, '').replace(',', '.')
    : source
  const match = raw.match(/[-+]?\d+(?:\.\d+)?/)
  if (!match) return null
  const n = Number(match[0])
  return Number.isFinite(n) ? n : null
}

function measuresFromCells(rawCells: readonly unknown[]): Array<{ raw: string; value: number; unit: string }> {
  const out: Array<{ raw: string; value: number; unit: string }> = []
  for (const cell of rawCells) {
    const text = String(cell ?? '').trim()
    if (!text) continue
    const re = /([-+]?\d+(?:[.,]\d+)?)\s*(KG|G|PZ|PIEZAS?|BU|BULTOS?)\b/gi
    for (const match of text.matchAll(re)) {
      const value = Number(match[1]!.replace(',', '.'))
      if (!Number.isFinite(value) || value <= 0) continue
      out.push({ raw: match[0]!, value, unit: match[2]!.toLowerCase() })
    }
  }
  return out
}

export function deriveVariableWeightEvidence(args: {
  rawCells: readonly unknown[]
  unitPrice: unknown
  lineTotal: unknown
  toleranceEuros?: number
}): VariableWeightEvidence | null {
  const unitPrice = decimal(args.unitPrice)
  const lineTotal = decimal(args.lineTotal)
  if (unitPrice == null || unitPrice <= 0 || lineTotal == null || lineTotal <= 0) return null

  const measures = measuresFromCells(args.rawCells)
  const mass = measures
    .filter((measure) => measure.unit === 'kg' || measure.unit === 'g')
    .map((measure) => ({
      ...measure,
      kg: measure.unit === 'kg' ? measure.value : measure.value / 1000,
    }))
  if (mass.length === 0) return null

  const tolerance = args.toleranceEuros ?? 0.011
  const matching = mass.filter((measure) => Math.abs(measure.kg * unitPrice - lineTotal) <= tolerance)
  if (matching.length !== 1) return null

  const pieces = measures.filter((measure) => measure.unit === 'pz' || measure.unit.startsWith('pieza'))
  const uniquePieceValues = [...new Set(pieces.map((measure) => measure.value))]
  const pieceCount = uniquePieceValues.length === 1 ? uniquePieceValues[0]! : null

  return {
    weightKg: matching[0]!.kg,
    pieceCount,
    matchedMeasure: matching[0]!.raw,
    observedMeasures: measures.map((measure) => measure.raw),
  }
}
