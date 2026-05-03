'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { CheckCircle2, Loader2, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { getCartaDisplayName, tPublicUi } from '@/lib/carta-menu-i18n'
import { arrayMove } from '@dnd-kit/sortable'
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { setMenuCategorySortOrders, setMenuItemSortOrders, upsertMenuOverride } from '@/app/dashboard/carta/actions'
import { MenuCategoryEditModal } from '@/components/carta/MenuCategoryEditModal'
import { MenuItemEditModal } from '@/components/carta/MenuItemEditModal'

type MenuItemRow = {
  articulo_id: number
  articulo_nombre: string
  precio: number | string | null
}

type OverrideRow = {
  articulo_id: number
  is_hidden: boolean
  category_id: string | null
  sort_order: number | null
  override_nombre: string | null
  override_nombre_es: string | null
  override_nombre_ca: string | null
  override_nombre_en: string | null
}

type CategoryRow = {
  id: string
  name: string
  parent_id: string | null
  sort_order: number | null
  cover_articulo_id: number | null
}

type UiItem = {
  articulo_id: number
  displayName: string
  isActive: boolean
  sort_order: number | null
  category_id: string | null
  overrideRow: OverrideRow | null
}

type UiSubGroup = {
  key: string
  title: string
  sortOrder: number
  items: UiItem[]
}

type UiParentGroup = {
  key: string
  title: string
  sortOrder: number
  parentCategoryId: string
  subs: UiSubGroup[]
}

export function StaffCartaInlineEditor({
  canEdit,
  lang,
}: {
  canEdit: boolean
  lang: CartaLang
}) {
  const supabase = useMemo(() => createClient(), [])
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [savingArticuloId, setSavingArticuloId] = useState<number | null>(null)
  const [savingSort, setSavingSort] = useState(false)

  const [items, setItems] = useState<MenuItemRow[]>([])
  const [overrides, setOverrides] = useState<OverrideRow[]>([])
  const [categories, setCategories] = useState<CategoryRow[]>([])

  const [openParentKey, setOpenParentKey] = useState<string | null>(null)
  const [selectedSubKeyByParent, setSelectedSubKeyByParent] = useState<Record<string, string>>({})
  const [itemOrderByContainer, setItemOrderByContainer] = useState<Record<string, number[]>>({})
  const [categoryModalId, setCategoryModalId] = useState<string | null>(null)
  const [itemModalArticuloId, setItemModalArticuloId] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    try {
      const [mappingsRes, overridesRes, categoriesRes] = await Promise.all([
        supabase
          .from('map_tpv_receta')
          .select('articulo_id, bdp_articulos(id, nombre, precio_base)')
          .limit(5000),
        supabase
          .from('digital_menu_overrides')
          .select(
            'articulo_id, is_hidden, category_id, sort_order, override_nombre, override_nombre_es, override_nombre_ca, override_nombre_en'
          )
          .limit(5000),
        supabase
          .from('categories')
          .select('id, name, parent_id, sort_order, cover_articulo_id')
          .eq('scope', 'menu')
          .limit(5000),
      ])

      if (mappingsRes.error) throw mappingsRes.error
      if (overridesRes.error) throw overridesRes.error
      if (categoriesRes.error) throw categoriesRes.error

      const mapRows = (mappingsRes.data ?? []) as any[]
      setItems(
        mapRows
          .map((r) => {
            const a = r.bdp_articulos
            if (!a) return null
            return {
              articulo_id: r.articulo_id,
              articulo_nombre: a.nombre,
              precio: a.precio_base ?? null,
            } satisfies MenuItemRow
          })
          .filter(Boolean) as any
      )
      setOverrides((overridesRes.data ?? []) as any)
      setCategories(
        (categoriesRes.data ?? []).map((c: any) => ({
          ...c,
          cover_articulo_id: c.cover_articulo_id ?? null,
        })) as any
      )
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo cargar el editor de carta')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const overrideByArticulo = useMemo(() => {
    const m = new Map<number, OverrideRow>()
    for (const o of overrides) m.set(o.articulo_id, o)
    return m
  }, [overrides])

  const categoryById = useMemo(() => {
    const m = new Map<string, CategoryRow>()
    for (const c of categories) m.set(c.id, c)
    return m
  }, [categories])

  const parents = useMemo(() => {
    return categories
      .filter((c) => !c.parent_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))
  }, [categories])

  const [parentOrder, setParentOrder] = useState<string[]>([])
  useEffect(() => {
    setParentOrder((prev) => {
      const next = parents.map((p) => p.id)
      if (prev.length === 0) return next
      // mantener si ya coincide (evita saltos)
      const same =
        prev.length === next.length && prev.every((id, idx) => id === next[idx])
      return same ? prev : next
    })
  }, [parents])

  const childrenByParent = useMemo(() => {
    const m = new Map<string, CategoryRow[]>()
    for (const c of categories) {
      if (!c.parent_id) continue
      const list = m.get(c.parent_id) ?? []
      list.push(c)
      m.set(c.parent_id, list)
    }
    for (const [k, list] of m) {
      m.set(
        k,
        list.slice().sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.name.localeCompare(b.name))
      )
    }
    return m
  }, [categories])

  const categoryForModal = useMemo(() => {
    if (!categoryModalId) return null
    const c = categoryById.get(categoryModalId) ?? null
    if (!c) return null
    return {
      id: c.id,
      name: c.name,
      parent_id: c.parent_id,
      cover_articulo_id: c.cover_articulo_id ?? null,
    }
  }, [categoryModalId, categoryById])

  const itemsForCover = useMemo(
    () => items.map((it) => ({ articulo_id: it.articulo_id, articulo_nombre: it.articulo_nombre })),
    [items]
  )

  const uiItems = useMemo<UiItem[]>(() => {
    return items.map((it) => {
      const o = overrideByArticulo.get(it.articulo_id) ?? null
      const isActive = !(o?.is_hidden ?? false)
      const rowForName = {
        carta_nombre: it.articulo_nombre,
        carta_nombre_es: o?.override_nombre_es ?? null,
        carta_nombre_ca: o?.override_nombre_ca ?? null,
        carta_nombre_en: o?.override_nombre_en ?? null,
      }
      return {
        articulo_id: it.articulo_id,
        displayName: getCartaDisplayName(rowForName, lang).trim() || it.articulo_nombre,
        isActive,
        sort_order: o?.sort_order ?? null,
        category_id: o?.category_id ?? null,
        overrideRow: o,
      }
    })
  }, [items, overrideByArticulo, lang])

  const grouped = useMemo(() => {
    const parentGroups = new Map<string, UiParentGroup>()

    for (const it of uiItems) {
      const catId = it.category_id
      const cat = catId ? categoryById.get(catId) ?? null : null
      const parentId = cat ? (cat.parent_id ?? cat.id) : null
      const childId = cat ? (cat.parent_id ? cat.id : null) : null

      if (!parentId) continue

      const parentCat = categoryById.get(parentId)
      if (!parentCat) continue

      const parentKey = parentId
      const g =
        parentGroups.get(parentKey) ??
        ({
          key: parentKey,
          title: parentCat.name,
          sortOrder: parentCat.sort_order ?? 9999,
          parentCategoryId: parentId,
          subs: [],
        } satisfies UiParentGroup)

      const subKey = childId ?? '__no_child__'
      const subTitle = childId ? categoryById.get(childId)?.name ?? '' : ''
      const subSort = childId ? categoryById.get(childId)?.sort_order ?? 9999 : 0
      let sg = g.subs.find((s) => s.key === subKey)
      if (!sg) {
        sg = { key: subKey, title: subTitle, sortOrder: subSort, items: [] }
        g.subs.push(sg)
      }
      sg.items.push(it)

      parentGroups.set(parentKey, g)
    }

    const result = Array.from(parentGroups.values())
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }))
      .map((g) => {
        const subsSorted = g.subs
          .slice()
          .sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999) || a.title.localeCompare(b.title))
          .map((s) => ({
            ...s,
            items: s.items
              .slice()
              .sort((x, y) => (x.sort_order ?? 9999) - (y.sort_order ?? 9999) || x.displayName.localeCompare(y.displayName)),
          }))
        return { ...g, subs: subsSorted }
      })

    return result
  }, [uiItems, categoryById])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { delay: 220, tolerance: 6 },
    })
  )

  const orderedParents = useMemo(() => {
    const byId = new Map(parents.map((p) => [p.id, p] as const))
    return parentOrder.map((id) => byId.get(id)).filter(Boolean) as CategoryRow[]
  }, [parents, parentOrder])

  const onDragEndParent = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = String(active.id)
    const overId = String(over.id)
    if (activeId === overId) return
    setParentOrder((prev) => {
      const oldIndex = prev.indexOf(activeId)
      const newIndex = prev.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0) return prev
      const next = arrayMove(prev, oldIndex, newIndex)

      startTransition(async () => {
        setSavingSort(true)
        const payload = next.map((category_id, idx) => ({ category_id, sort_order: (idx + 1) * 10 }))
        const res = await setMenuCategorySortOrders(payload)
        setSavingSort(false)
        if (!res.success) toast.error(res.error ?? 'No se pudo guardar el orden de categorías')
        else toast.success('Orden guardado')
        await load()
      })

      return next
    })
  }

  const uncategorized = useMemo(() => {
    return uiItems
      .filter((it) => !it.category_id)
      .slice()
      .sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999) || a.displayName.localeCompare(b.displayName))
  }, [uiItems])

  const onToggleVisible = (articulo_id: number) => {
    const current = overrideByArticulo.get(articulo_id)
    const nextHidden = !(current?.is_hidden ?? false)
    startTransition(async () => {
      setSavingArticuloId(articulo_id)
      try {
        const res = await upsertMenuOverride({ articulo_id, is_hidden: nextHidden })
        if (!res.success) {
          toast.error(res.error ?? 'No se pudo guardar')
          return
        }
        await load()
      } finally {
        setSavingArticuloId(null)
      }
    })
  }

  function SortableProductCard({
    item,
    onPress,
  }: {
    item: UiItem
    onPress: () => void
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: String(item.articulo_id),
    })

    return (
      <button
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        type="button"
        onClick={onPress}
        className={cn(
          'flex min-h-[64px] flex-col items-stretch justify-between overflow-hidden rounded-2xl border border-zinc-100 bg-white px-2 py-2 text-left shadow-sm active:bg-zinc-50',
          isDragging && 'opacity-80'
        )}
      >
        <div className="flex items-start gap-2">
          <span
            className={cn(
              'mt-0.5 inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl border',
              item.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-zinc-200 bg-zinc-50 text-zinc-500'
            )}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onToggleVisible(item.articulo_id)
            }}
            role="button"
            aria-label={item.isActive ? 'Desactivar producto' : 'Activar producto'}
            title={item.isActive ? 'Activo' : 'Inactivo'}
          >
            {savingArticuloId === item.articulo_id && isPending ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-6 w-6" strokeWidth={2.5} />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className={cn('line-clamp-3 text-[11px] font-bold leading-tight', !item.isActive && 'text-zinc-400')}>
              {item.displayName}
            </p>
            <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-[#36606F]/70">#{item.articulo_id}</p>
          </div>

          <span className="shrink-0">
            <span
              {...attributes}
              {...listeners}
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#36606F] active:bg-zinc-50"
              aria-label="Mantén pulsado y arrastra para reordenar"
              title="Arrastrar"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
            >
              <span className="text-lg font-black leading-none">≡</span>
            </span>
          </span>
        </div>
      </button>
    )
  }

  const onDragEndItems = (containerId: string, itemsInContainer: UiItem[]) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return
    const activeId = Number(active.id)
    const overId = Number(over.id)
    if (!Number.isFinite(activeId) || !Number.isFinite(overId)) return
    if (activeId === overId) return

    setItemOrderByContainer((prev) => {
      const current = prev[containerId] ?? itemsInContainer.map((x) => x.articulo_id)
      const oldIndex = current.indexOf(activeId)
      const newIndex = current.indexOf(overId)
      if (oldIndex < 0 || newIndex < 0) return prev
      const nextOrder = arrayMove(current, oldIndex, newIndex)

      startTransition(async () => {
        setSavingSort(true)
        const payload = nextOrder.map((articulo_id, idx) => {
          const it = itemsInContainer.find((x) => x.articulo_id === articulo_id)
          return {
            articulo_id,
            sort_order: (idx + 1) * 10,
            category_id: it?.category_id ?? null,
          }
        })
        const res = await setMenuItemSortOrders(payload)
        setSavingSort(false)
        if (!res.success) toast.error(res.error ?? 'No se pudo guardar el orden de productos')
        else toast.success('Orden guardado')
        await load()
      })

      return { ...prev, [containerId]: nextOrder }
    })
  }

  function SortableParentTile({
    category,
    isOpen,
    hasAny,
    onToggleOpen,
  }: {
    category: CategoryRow
    isOpen: boolean
    hasAny: boolean
    onToggleOpen: () => void
  }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
      id: category.id,
    })

    return (
      <div
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className={cn(isDragging && 'opacity-80')}
      >
        <div
          className={cn(
            'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
            isOpen ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20' : 'border-zinc-200/60',
            !hasAny && 'opacity-70'
          )}
        >
          <button
            type="button"
            onClick={onToggleOpen}
            className="flex min-h-[52px] w-full items-center justify-start gap-2 px-3 py-2.5 text-left active:bg-zinc-50 sm:px-4"
            aria-expanded={isOpen}
          >
            <span className="min-w-0 flex-1 text-[11px] font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm">
              {category.name}
            </span>
          </button>

          <button
            type="button"
            className="sr-only"
            {...attributes}
            {...listeners}
            aria-label="Reordenar categoría"
          />

          {/* Handle táctil: no colapsa, 48px */}
          <div className="flex justify-end px-3 pb-2">
            <button
              type="button"
              {...attributes}
              {...listeners}
              className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#36606F] active:bg-zinc-50"
              aria-label="Mantén pulsado y arrastra para reordenar"
              title="Arrastrar"
            >
              <span className="text-lg font-black leading-none">≡</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!canEdit) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center shadow-sm" role="alert">
        <p className="text-sm font-bold text-red-800">No tienes permisos para editar la carta.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex min-h-[160px] items-center justify-center rounded-xl border border-zinc-100 bg-white">
        <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm sm:p-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">Edición de carta</p>
        <p className="mt-1 text-xs text-zinc-600">
          Toca el tick para activar/desactivar. Toca una categoría para ver sus productos.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-black uppercase tracking-widest text-white/90">Categorías</p>
          {savingSort ? (
            <span className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-white/10 px-3 text-xs font-black uppercase tracking-widest text-white">
              <Loader2 className="h-4 w-4 animate-spin" />
              Guardando…
            </span>
          ) : null}
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndParent}>
          <SortableContext items={orderedParents.map((p) => p.id)}>
            <div className="grid grid-cols-2 gap-2 sm:gap-4">
              {orderedParents.map((p) => {
          const isOpen = openParentKey === p.id
          const g = grouped.find((x) => x.key === p.id) ?? null
          const hasAny = g != null
          return (
            <div key={p.id} className="contents">
                <SortableParentTile
                  category={p}
                  isOpen={isOpen}
                  hasAny={hasAny}
                  onToggleOpen={() => {
                    setOpenParentKey((cur) => (cur === p.id ? null : p.id))
                    setSelectedSubKeyByParent((prev) => {
                      const next = { ...prev }
                      delete next[p.id]
                      return next
                    })
                  }}
                />

              {isOpen ? (
                <div className="col-span-2 overflow-hidden rounded-xl border-2 border-[#36606F] bg-white shadow-md ring-1 ring-[#36606F]/20">
                  <div className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                    <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">{p.name}</p>
                    <button
                      type="button"
                      className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#36606F] active:bg-zinc-50"
                      onClick={() => setCategoryModalId(p.id)}
                      aria-label="Editar categoría"
                      title="Editar categoría"
                    >
                      <Pencil className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </div>

                  <div className="px-3 pb-4">
                    {g && g.subs.length > 1 ? (
                      <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                        {g.subs.map((s) => {
                          const sel = selectedSubKeyByParent[p.id]
                          const isActive = sel ? sel === s.key : s.key !== '__no_child__'
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() =>
                                setSelectedSubKeyByParent((prev) => ({
                                  ...prev,
                                  [p.id]: s.key,
                                }))
                              }
                              className={cn(
                                'flex min-h-[48px] min-w-0 flex-1 basis-0 items-center justify-center rounded-xl border px-1 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:px-2 sm:text-[11px]',
                                isActive ? 'border-[#36606F] bg-white text-[#36606F]' : 'border-zinc-200/80 bg-white text-[#36606F] shadow-sm active:bg-zinc-50'
                              )}
                            >
                              <span className="line-clamp-2 min-w-0">{s.title || tPublicUi(lang).uncategorized}</span>
                            </button>
                          )
                        })}
                      </div>
                    ) : null}

                    {(() => {
                      const subKey =
                        g && g.subs.length > 1 ? selectedSubKeyByParent[p.id] : g?.subs?.[0]?.key
                      const containerId = `${p.id}:${subKey ?? '__none__'}`
                      const itemsInContainer = g
                        ? (g.subs.length > 1 ? g.subs.filter((s) => s.key === subKey) : g.subs).flatMap((s) => s.items)
                        : []
                      const order = itemOrderByContainer[containerId]
                      const byId = new Map(itemsInContainer.map((x) => [x.articulo_id, x] as const))
                      const ordered =
                        order && order.length
                          ? order.map((id) => byId.get(id)).filter(Boolean) as UiItem[]
                          : itemsInContainer

                      return (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndItems(containerId, ordered)}>
                          <SortableContext items={ordered.map((x) => String(x.articulo_id))}>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                              {ordered.map((it) => (
                                <SortableProductCard
                                  key={it.articulo_id}
                                  item={it}
                                  onPress={() => setItemModalArticuloId(it.articulo_id)}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )
                    })()}
                  </div>
                </div>
              ) : null}
            </div>
          )
              })}
            </div>
          </SortableContext>
        </DndContext>
      </section>

      <section className="rounded-xl border border-zinc-100 bg-white p-3 shadow-sm sm:p-4">
        <p className="text-[11px] font-black uppercase tracking-widest text-[#36606F]">{tPublicUi(lang).uncategorized}</p>
        {uncategorized.length === 0 ? (
          <p className="mt-2 text-xs text-zinc-500">No hay productos sin categoría.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEndItems('uncat', uncategorized)}>
            <SortableContext items={uncategorized.map((x) => String(x.articulo_id))}>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {uncategorized.map((it) => (
                  <SortableProductCard
                    key={it.articulo_id}
                    item={it}
                    onPress={() => setItemModalArticuloId(it.articulo_id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <MenuCategoryEditModal
        open={categoryForModal != null}
        onClose={() => {
          setCategoryModalId(null)
          void load()
        }}
        category={categoryForModal}
        itemsForCover={itemsForCover}
      />

      <MenuItemEditModal
        open={itemModalArticuloId != null}
        onClose={() => {
          setItemModalArticuloId(null)
          void load()
        }}
        articuloId={itemModalArticuloId}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          parent_id: c.parent_id,
          sort_order: c.sort_order,
        }))}
      />
    </div>
  )
}

