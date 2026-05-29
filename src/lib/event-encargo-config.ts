import type { PublicMenuRow } from '@/components/public/PublicCarta'
import { eventOrderProductId } from '@/lib/event-order-carta'

export type EventCategoryLimits = {
  parents?: Record<string, number>
  subs?: Record<string, number>
}

export function parseEventCategoryLimits(raw: unknown): EventCategoryLimits {
  if (!raw || typeof raw !== 'object') return {}
  const o = raw as { parents?: unknown; subs?: unknown }
  const parents: Record<string, number> = {}
  const subs: Record<string, number> = {}
  if (o.parents && typeof o.parents === 'object') {
    for (const [k, v] of Object.entries(o.parents as Record<string, unknown>)) {
      const n = Number(v)
      if (k && Number.isFinite(n) && n > 0) parents[k] = Math.floor(n)
    }
  }
  if (o.subs && typeof o.subs === 'object') {
    for (const [k, v] of Object.entries(o.subs as Record<string, unknown>)) {
      const n = Number(v)
      if (k && Number.isFinite(n) && n > 0) subs[k] = Math.floor(n)
    }
  }
  return { parents, subs }
}

/** `null` = todos los productos de la carta activos para el encargo. */
export function parseEnabledProductIds(raw: unknown): string[] | null {
  if (raw == null) return null
  if (!Array.isArray(raw)) return null
  const ids = raw.map((x) => String(x ?? '').trim()).filter(Boolean)
  return ids.length ? ids : []
}

export function isEventProductEnabled(productId: string, enabledIds: string[] | null): boolean {
  if (enabledIds === null) return true
  return enabledIds.includes(productId)
}

export function productIdsFromMenuItems(items: PublicMenuRow[]): string[] {
  return items.map((r) => eventOrderProductId(r.articulo_id))
}

/** Si todos están activos, guardar `null` en BD. */
export function normalizeEnabledProductIdsForSave(
  enabledSet: Set<string>,
  allProductIds: string[]
): string[] | null {
  if (allProductIds.length === 0) return null
  const allEnabled = allProductIds.every((id) => enabledSet.has(id))
  if (allEnabled) return null
  return allProductIds.filter((id) => enabledSet.has(id))
}

export function enabledSetFromStored(
  enabledIds: string[] | null,
  allProductIds: string[]
): Set<string> {
  if (enabledIds === null) return new Set(allProductIds)
  return new Set(enabledIds)
}

export function sumQtyInParent(
  qtyById: Record<string, number>,
  items: PublicMenuRow[],
  parentKey: string
): number {
  let total = 0
  for (const row of items) {
    const pk = row.category_parent_id ?? `__no_parent__:${(row.category_parent_name ?? '').trim()}`
    if (pk !== parentKey) continue
    const pid = eventOrderProductId(row.articulo_id)
    total += Math.max(0, Number(qtyById[pid]) || 0)
  }
  return total
}

export function sumQtyInSub(
  qtyById: Record<string, number>,
  items: PublicMenuRow[],
  subKey: string
): number {
  let total = 0
  for (const row of items) {
    const childTitleRaw = row.category_child_name?.trim() || ''
    const sk = row.category_child_id ?? `__no_child__:${childTitleRaw}`
    if (sk !== subKey) continue
    const pid = eventOrderProductId(row.articulo_id)
    total += Math.max(0, Number(qtyById[pid]) || 0)
  }
  return total
}

export function validateEventOrderLimits(
  qtyById: Record<string, number>,
  items: PublicMenuRow[],
  limits: EventCategoryLimits,
  enabledIds: string[] | null
): string[] {
  const warnings: string[] = []
  const activeItems = items.filter((r) =>
    isEventProductEnabled(eventOrderProductId(r.articulo_id), enabledIds)
  )

  for (const [parentKey, max] of Object.entries(limits.parents ?? {})) {
    const sum = sumQtyInParent(qtyById, activeItems, parentKey)
    if (sum > max) {
      const label =
        activeItems.find((r) => {
          const pk = r.category_parent_id ?? `__no_parent__:${(r.category_parent_name ?? '').trim()}`
          return pk === parentKey
        })?.category_parent_name ?? 'esta categoría'
      warnings.push(
        `Has seleccionado ${sum} unidades en «${label}»; el máximo permitido es ${max}.`
      )
    }
  }

  for (const [subKey, max] of Object.entries(limits.subs ?? {})) {
    const sum = sumQtyInSub(qtyById, activeItems, subKey)
    if (sum > max) {
      const label =
        activeItems.find((r) => {
          const childTitleRaw = r.category_child_name?.trim() || ''
          const sk = r.category_child_id ?? `__no_child__:${childTitleRaw}`
          return sk === subKey
        })?.category_child_name ?? 'esta subcategoría'
      warnings.push(
        `Has seleccionado ${sum} unidades en «${label}»; el máximo permitido es ${max}.`
      )
    }
  }

  return warnings
}

export function subsWithVisibleProducts<T extends { key: string; rows: { editor_is_hidden?: boolean }[] }>(
  subs: T[]
): T[] {
  return subs.filter((s) => s.rows.some((r) => !(r.editor_is_hidden ?? false)))
}
