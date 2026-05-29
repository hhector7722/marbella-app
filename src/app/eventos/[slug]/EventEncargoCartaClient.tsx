'use client'

import { useCallback, useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, X } from 'lucide-react'
import {
  EventEncargoCartFooter,
  type EventEncargoCartLine,
} from '@/components/eventos/EventEncargoCartFooter'
import { PublicCarta, type PublicMenuRow } from '@/components/public/PublicCarta'
import { DEFAULT_CARTA_LANG, getCartaDisplayName } from '@/lib/carta-menu-i18n'
import { eventOrderProductId } from '@/lib/event-order-carta'
import type { EventEncargoEditControl, EventOrderCartaControl } from '@/lib/event-order-carta'
import {
  enabledSetFromStored,
  normalizeEnabledProductIdsForSave,
  parseEventCategoryLimits,
  productIdsFromMenuItems,
  validateEventOrderLimits,
  type EventCategoryLimits,
} from '@/lib/event-encargo-config'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'
import { cn } from '@/lib/utils'
import { saveEventEncargoConfigAction } from '@/app/dashboard/eventos/actions'
import { submitEventOrderAction } from './actions'

export type EncargoCartaEvent = {
  id: string
  slug: string
  name: string
  event_date: string
  event_time: string
}

type PackItem = { product_id: string; quantity: number }

function formatEur(value: number): string {
  try {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(value)
  } catch {
    return `${value.toFixed(2)} €`
  }
}

function sumItems(qtyById: Record<string, number>): number {
  let n = 0
  for (const k of Object.keys(qtyById)) n += Math.max(0, Number(qtyById[k]) || 0)
  return n
}

function sumTotal(menuItems: PublicMenuRow[], qtyById: Record<string, number>): number {
  const priceById = new Map(menuItems.map((p) => [eventOrderProductId(p.articulo_id), Number(p.precio) || 0]))
  let total = 0
  for (const [pid, qtyRaw] of Object.entries(qtyById)) {
    const qty = Math.max(0, Number(qtyRaw) || 0)
    if (qty <= 0) continue
    total += (priceById.get(pid) ?? 0) * qty
  }
  return total
}

function rowsForParent(items: PublicMenuRow[], parentKey: string): PublicMenuRow[] {
  return items.filter((row) => {
    const pk = row.category_parent_id ?? `__no_parent__:${(row.category_parent_name ?? '').trim()}`
    return pk === parentKey
  })
}

function rowsForSub(items: PublicMenuRow[], subKey: string): PublicMenuRow[] {
  return items.filter((row) => {
    const childTitleRaw = row.category_child_name?.trim() || ''
    const sk = row.category_child_id ?? `__no_child__:${childTitleRaw}`
    return sk === subKey
  })
}

export default function EventEncargoCartaClient({
  event,
  allMenuItems,
  clientMenuItems,
  menuCategories,
  categoryCoverById,
  categoryCoverScaleById,
  startingPackItems,
  initialEnabledProductIds,
  initialCategoryLimits,
  canManage = false,
  backHref = null,
}: {
  event: EncargoCartaEvent
  allMenuItems: PublicMenuRow[]
  clientMenuItems: PublicMenuRow[]
  menuCategories: MenuCategoryCatalogEntry[]
  categoryCoverById: Record<string, string | null>
  categoryCoverScaleById: Record<string, CartaPhotoScale>
  startingPackItems: PackItem[]
  initialEnabledProductIds: string[] | null
  initialCategoryLimits: EventCategoryLimits
  canManage?: boolean
  backHref?: string | null
}) {
  const allProductIds = useMemo(() => productIdsFromMenuItems(allMenuItems), [allMenuItems])

  const [editMode, setEditMode] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [toggleBusyId, setToggleBusyId] = useState<number | null>(null)

  const [enabledSet, setEnabledSet] = useState<Set<string>>(() =>
    enabledSetFromStored(initialEnabledProductIds, allProductIds)
  )
  const [categoryLimits, setCategoryLimits] = useState<EventCategoryLimits>(initialCategoryLimits)

  const [qtyById, setQtyById] = useState<Record<string, number>>(() => {
    const out: Record<string, number> = {}
    for (const it of startingPackItems ?? []) {
      const pid = String(it.product_id ?? '').trim()
      const qty = Number(it.quantity) || 0
      if (!pid || qty <= 0) continue
      out[pid] = qty
    }
    return out
  })

  const [saveModalOpen, setSaveModalOpen] = useState(false)
  const [responsibleName, setResponsibleName] = useState('')
  const [limitWarnings, setLimitWarnings] = useState<string[]>([])
  const [orderDone, setOrderDone] = useState(false)

  const enabledIdsForClient = useMemo(
    () => normalizeEnabledProductIdsForSave(enabledSet, allProductIds),
    [enabledSet, allProductIds]
  )

  const displayItems = useMemo(() => {
    if (editMode) {
      return allMenuItems.map((row) => ({
        ...row,
        editor_is_hidden: !enabledSet.has(eventOrderProductId(row.articulo_id)),
      }))
    }
    return clientMenuItems
  }, [editMode, allMenuItems, clientMenuItems, enabledSet])

  const totalItems = useMemo(() => sumItems(qtyById), [qtyById])
  const totalAmount = useMemo(() => sumTotal(clientMenuItems, qtyById), [clientMenuItems, qtyById])

  const onQuantityChange = useCallback((articuloId: number, quantity: number) => {
    const pid = eventOrderProductId(articuloId)
    setQtyById((curr) => {
      const next = Math.max(0, Math.min(999, Number(quantity) || 0))
      if (next <= 0) {
        const { [pid]: _removed, ...rest } = curr
        return rest
      }
      return { ...curr, [pid]: next }
    })
  }, [])

  const eventOrder: EventOrderCartaControl | undefined = useMemo(
    () =>
      editMode
        ? undefined
        : { qtyByProductId: qtyById, onQuantityChange, tapToAdd: true },
    [editMode, qtyById, onQuantityChange]
  )

  const cartLines = useMemo((): EventEncargoCartLine[] => {
    const lines: EventEncargoCartLine[] = []
    for (const row of clientMenuItems) {
      const pid = eventOrderProductId(row.articulo_id)
      const quantity = Math.max(0, Number(qtyById[pid]) || 0)
      if (quantity <= 0) continue
      lines.push({
        key: pid,
        articuloId: row.articulo_id,
        name: getCartaDisplayName(row, DEFAULT_CARTA_LANG),
        quantity,
      })
    }
    lines.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
    return lines
  }, [clientMenuItems, qtyById])

  const addOneToCart = useCallback((articuloId: number) => {
    const pid = eventOrderProductId(articuloId)
    setQtyById((curr) => ({
      ...curr,
      [pid]: Math.min(999, (curr[pid] ?? 0) + 1),
    }))
  }, [])

  const removeOneFromCart = useCallback((articuloId: number) => {
    const pid = eventOrderProductId(articuloId)
    setQtyById((curr) => {
      const nextQty = (curr[pid] ?? 0) - 1
      if (nextQty <= 0) {
        const { [pid]: _removed, ...rest } = curr
        return rest
      }
      return { ...curr, [pid]: nextQty }
    })
  }, [])

  const toggleProductIds = useCallback((ids: string[], enable: boolean) => {
    setEnabledSet((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (enable) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  const onToggleProduct = useCallback(
    (articuloId: number) => {
      const pid = eventOrderProductId(articuloId)
      setToggleBusyId(articuloId)
      setEnabledSet((prev) => {
        const next = new Set(prev)
        if (next.has(pid)) next.delete(pid)
        else next.add(pid)
        return next
      })
      setToggleBusyId(null)
    },
    []
  )

  const onToggleParentCategory = useCallback(
    (parentKey: string) => {
      const rows = rowsForParent(allMenuItems, parentKey)
      const ids = rows.map((r) => eventOrderProductId(r.articulo_id))
      const allOn = ids.length > 0 && ids.every((id) => enabledSet.has(id))
      toggleProductIds(ids, !allOn)
    },
    [allMenuItems, enabledSet, toggleProductIds]
  )

  const onToggleSubCategory = useCallback(
    (_parentKey: string, subKey: string) => {
      const rows = rowsForSub(allMenuItems, subKey)
      const ids = rows.map((r) => eventOrderProductId(r.articulo_id))
      const allOn = ids.length > 0 && ids.every((id) => enabledSet.has(id))
      toggleProductIds(ids, !allOn)
    },
    [allMenuItems, enabledSet, toggleProductIds]
  )

  const onSetParentLimit = useCallback((parentKey: string, max: number | null) => {
    setCategoryLimits((prev) => {
      const parents = { ...(prev.parents ?? {}) }
      if (max == null) delete parents[parentKey]
      else parents[parentKey] = max
      return { ...prev, parents }
    })
  }, [])

  const onSetSubLimit = useCallback((subKey: string, max: number | null) => {
    setCategoryLimits((prev) => {
      const subs = { ...(prev.subs ?? {}) }
      if (max == null) delete subs[subKey]
      else subs[subKey] = max
      return { ...prev, subs }
    })
  }, [])

  const eventEncargoEdit: EventEncargoEditControl | undefined = useMemo(
    () =>
      editMode
        ? {
            active: true,
            enabledProductIds: enabledSet,
            onToggleProduct,
            onToggleParentCategory,
            onToggleSubCategory,
            categoryLimits,
            onSetParentLimit,
            onSetSubLimit,
            productToggleBusyId: toggleBusyId,
          }
        : undefined,
    [
      editMode,
      enabledSet,
      onToggleProduct,
      onToggleParentCategory,
      onToggleSubCategory,
      categoryLimits,
      onSetParentLimit,
      onSetSubLimit,
      toggleBusyId,
    ]
  )

  const btnBase =
    'min-h-12 rounded-xl px-5 text-[12px] font-black uppercase tracking-wider transition-colors disabled:opacity-50'

  const openSaveModal = useCallback(() => {
    const warnings = validateEventOrderLimits(qtyById, clientMenuItems, categoryLimits, enabledIdsForClient)
    setLimitWarnings(warnings)
    setSaveModalOpen(true)
  }, [qtyById, clientMenuItems, categoryLimits, enabledIdsForClient])

  if (orderDone) {
    return (
      <main className="flex min-h-[100dvh] flex-col bg-white text-zinc-900">
        <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-5 pb-safe pt-safe md:px-8">
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" strokeWidth={2.25} />
            <p className="mt-3 text-lg font-black text-zinc-900">Pedido enviado</p>
            <p className="mt-2 text-sm font-bold text-zinc-700">Gracias, {responsibleName}.</p>
          </div>
        </div>
      </main>
    )
  }

  const footer = editMode ? (
    <div className="space-y-2 px-0 py-3">
      <button
        type="button"
        className={cn(btnBase, 'w-full bg-zinc-100 text-zinc-800 hover:bg-zinc-200')}
        onClick={() => setEditMode(false)}
      >
        Listo
      </button>
      <button
        type="button"
        className={cn(btnBase, 'w-full bg-[#36606F] text-white hover:bg-[#2a4a56]')}
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const res = await saveEventEncargoConfigAction({
              eventId: event.id,
              enabled_product_ids: normalizeEnabledProductIdsForSave(enabledSet, allProductIds),
              category_limits: categoryLimits,
            })
            if (!res.success) {
              toast.error(res.message)
              return
            }
            toast.success('Configuración guardada')
            setEditMode(false)
          })
        }}
      >
        {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Guardar configuración'}
      </button>
    </div>
  ) : (
    <EventEncargoCartFooter
      lines={cartLines}
      totalLabel={
        totalItems > 0 ? `${totalItems} uds. · ${formatEur(totalAmount)}` : undefined
      }
      onIncrement={addOneToCart}
      onDecrement={removeOneFromCart}
      onSave={openSaveModal}
      isPending={isPending}
    />
  )

  return (
    <>
      <PublicCarta
        items={displayItems}
        menuCategories={menuCategories}
        categoryCoverById={categoryCoverById}
        categoryCoverScaleById={categoryCoverScaleById}
        backHref={backHref}
        cartaEditHref={null}
        onEnterEncargoEdit={canManage ? () => setEditMode((v) => !v) : undefined}
        encargoEditActive={editMode}
        eventOrder={eventOrder}
        eventEncargoEdit={eventEncargoEdit}
        footer={footer}
      />

      {saveModalOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-label="Enviar pedido"
          onClick={() => !isPending && setSaveModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Nombre</p>
              <button
                type="button"
                className="flex min-h-12 min-w-[48px] shrink-0 items-center justify-center text-zinc-500"
                aria-label="Cerrar"
                onClick={() => !isPending && setSaveModalOpen(false)}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <input
              value={responsibleName}
              onChange={(e) => setResponsibleName(e.target.value)}
              className="mt-3 min-h-12 w-full rounded-xl border border-zinc-200 px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#36606F]/25"
              placeholder="Tu nombre"
              autoComplete="name"
            />
            {limitWarnings.length > 0 ? (
              <ul className="mt-3 space-y-1">
                {limitWarnings.map((w) => (
                  <li key={w} className="text-xs font-bold leading-snug text-red-600">
                    {w}
                  </li>
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              className={cn(btnBase, 'mt-5 w-full bg-emerald-600 text-white hover:bg-emerald-700')}
              disabled={isPending || responsibleName.trim().length < 2}
              onClick={() => {
                const name = responsibleName.trim()
                const warnings = validateEventOrderLimits(
                  qtyById,
                  clientMenuItems,
                  categoryLimits,
                  enabledIdsForClient
                )
                setLimitWarnings(warnings)
                startTransition(async () => {
                  const items = Object.entries(qtyById)
                    .map(([product_id, quantity]) => ({ product_id, quantity }))
                    .filter((it) => Number(it.quantity) > 0)
                  const res = await submitEventOrderAction({
                    slug: event.slug,
                    responsible_name: name,
                    items,
                  })
                  if (!res.success) {
                    toast.error(res.message)
                    return
                  }
                  setSaveModalOpen(false)
                  setOrderDone(true)
                })
              }}
            >
              {isPending ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : 'Enviar'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  )
}
