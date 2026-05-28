/** Controles de cantidad sobre la carta digital (misma UI que `/carta`). */
export type EventOrderCartaControl = {
  qtyByProductId: Record<string, number>
  onQuantityChange: (articuloId: number, quantity: number) => void
}

export function eventOrderProductId(articuloId: number): string {
  return String(articuloId)
}

export function eventOrderQtyFor(
  control: EventOrderCartaControl | undefined,
  articuloId: number
): number {
  if (!control) return 0
  return Math.max(0, Number(control.qtyByProductId[eventOrderProductId(articuloId)]) || 0)
}
