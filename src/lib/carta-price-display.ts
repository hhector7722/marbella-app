/** Precio en grid carta: vacío si null/0 (regla ZERO-DISPLAY). */
export function formatCartaPrice(precio: number | string | null | undefined): string {
  if (precio === null || precio === undefined) return ' '
  const n = typeof precio === 'string' ? Number(precio) : precio
  if (!Number.isFinite(n) || Math.abs(n) < 0.005) return ' '
  return `${n.toFixed(2)}€`
}

/** Importe verbal para aria-label (sin símbolo €). */
export function formatCartaPriceAriaAmount(precio: number | string | null | undefined): string {
  const displayed = formatCartaPrice(precio).trim()
  if (!displayed) return ''
  return `${displayed.replace(/€$/, '').trim()} euros`
}
