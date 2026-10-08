/** Detecta hojas con el mismo contenido económico aunque las fotos tengan SHA distintos.
 * No elimina hojas: una coincidencia obliga a conciliación humana antes de K4.
 */
export type ObservedPageEvidence = {
  pageKey: string
  lines: Array<{
    description_raw?: unknown
    quantity_raw?: unknown
    billing_unit_raw?: unknown
    unit_price_raw?: unknown
    line_total_raw?: unknown
  }>
}

function normalized(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/\s+/g, ' ').trim()
}

export function duplicatedPageEvidence(
  pages: readonly ObservedPageEvidence[]
): Array<{ originalPageKey: string; repeatedPageKey: string; lineCount: number }> {
  const bySignature = new Map<string, string>()
  const repeated: Array<{ originalPageKey: string; repeatedPageKey: string; lineCount: number }> = []
  for (const page of pages) {
    if (!page.pageKey || !page.lines.length) continue
    const signature = JSON.stringify(page.lines.map((line) => [
      normalized(line.description_raw), normalized(line.quantity_raw),
      normalized(line.billing_unit_raw), normalized(line.unit_price_raw),
      normalized(line.line_total_raw),
    ]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
    const existing = bySignature.get(signature)
    if (existing) repeated.push({
      originalPageKey: existing, repeatedPageKey: page.pageKey, lineCount: page.lines.length,
    })
    else bySignature.set(signature, page.pageKey)
  }
  return repeated
}
