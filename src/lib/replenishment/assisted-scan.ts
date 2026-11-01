/**
 * Disposición cenital de la nevera Coca-Cola: 7 columnas y 7 filas.
 * La primera fila tiene 6 posiciones (falta la columna 1).
 * Una posición completa tiene 4 latas, pero la cámara no verifica las ocultas.
 */
export type StackPosition = { id: string; row: number; column: number; product: 'original' | 'zero'; capacity: 4 }
export type StackReading = { count: number; method: 'manual' | 'confirmed-suggestion' }
export type StackCounts = Record<string, StackReading>
export type StackTotals = {
  positions: number
  confirmed: number
  present: number
  confirmedMissing: number
  unverifiedCapacity: number
  totalMissing: number | null
}
export const COLA_LAYOUT: readonly StackPosition[] = Array.from({ length: 7 }, (_, row) =>
  Array.from({ length: 7 }, (_, column) => {
    if (row === 0 && column === 0) return null
    return {
      id: 'f' + (row + 1) + '-c' + (column + 1),
      row: row + 1,
      column: column + 1,
      product: column >= 4 ? 'zero' : 'original',
      capacity: 4 as const,
    }
  }).filter((value): value is StackPosition => value !== null),
).flat()

export function colaLayoutMatchesCapacities(originalCapacity: number, zeroCapacity: number): boolean {
  return COLA_LAYOUT.filter(p => p.product === 'original').length * 4 === originalCapacity
    && COLA_LAYOUT.filter(p => p.product === 'zero').length * 4 === zeroCapacity
}
export function validStackCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
/** Una quinta lata de sobra no altera el objetivo de reposición de cuatro. */
export function normalizedStackCount(value: number): number {
  return Math.min(4, value)
}
export function mergeStackReading(
  previous: StackCounts, id: string, count: number, method: StackReading['method'],
): StackCounts {
  if (!COLA_LAYOUT.some(p => p.id === id) || !validStackCount(count)) return previous
  return { ...previous, [id]: { count: normalizedStackCount(count), method } }
}
export function computeStackTotals(positions: readonly StackPosition[], counts: StackCounts): StackTotals {
  let confirmed = 0
  let present = 0
  let confirmedMissing = 0
  let unverifiedCapacity = 0
  for (const pos of positions) {
    const reading = counts[pos.id]
    if (reading && validStackCount(reading.count)) {
      confirmed++
      const counted = normalizedStackCount(reading.count)
      present += counted
      confirmedMissing += Math.max(0, pos.capacity - counted)
    } else {
      unverifiedCapacity += pos.capacity
    }
  }
  return {
    positions: positions.length, confirmed, present, confirmedMissing, unverifiedCapacity,
    totalMissing: confirmed === positions.length ? confirmedMissing : null,
  }
}
/** Pista de bases claramente visibles de una sola pila. Jamás confirma unidades ocultas. */
export type CircleHint = { x: number; y: number; radius: number; confidence: number }
export function visibleStackHint(circles: readonly CircleHint[], width: number, height: number): number | null {
  const inFrame = circles.filter(c =>
    c.confidence >= 0.56 &&
    c.x > width * 0.27 && c.x < width * 0.73 &&
    c.y > height * 0.14 && c.y < height * 0.86,
  ).sort((a, b) => a.y - b.y)
  if (inFrame.length < 2 || inFrame.length > 5) return null
  const avgRadius = inFrame.reduce((sum, c) => sum + c.radius, 0) / inFrame.length
  const avgX = inFrame.reduce((sum, c) => sum + c.x, 0) / inFrame.length
  if (inFrame.some(c => Math.abs(c.x - avgX) > avgRadius * 0.75)) return null
  for (let i = 1; i < inFrame.length; i++) {
    const gap = inFrame[i].y - inFrame[i - 1].y
    if (gap < avgRadius * 0.7 || gap > avgRadius * 3.8) return null
  }
  return normalizedStackCount(inFrame.length)
}
export function stableHint(history: (number | null)[]): number | null {
  if (history.length < 3) return null
  const last = history.slice(-3)
  if (last[0] !== null && last.every(n => n === last[0])) return last[0]
  return null
}
