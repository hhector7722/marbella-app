import type { EventCategoryLimits } from '@/lib/event-encargo-config'

/** Controles de pedido sobre la carta digital. */
export type EventOrderCartaControl = {
  qtyByProductId: Record<string, number>
  onQuantityChange: (articuloId: number, quantity: number) => void
  /** Pulsa el producto para sumar 1 (sin +/− en la tarjeta). */
  tapToAdd?: boolean
}

/** Edición de encargo: activar productos/categorías y límites por categoría. */
export type EventEncargoEditControl = {
  active: boolean
  enabledProductIds: Set<string>
  onToggleProduct: (articuloId: number) => void
  onToggleParentCategory: (parentKey: string) => void
  onToggleSubCategory: (parentKey: string, subKey: string) => void
  categoryLimits: EventCategoryLimits
  onSetParentLimit: (parentKey: string, max: number | null) => void
  onSetSubLimit: (subKey: string, max: number | null) => void
  productToggleBusyId?: number | null
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
