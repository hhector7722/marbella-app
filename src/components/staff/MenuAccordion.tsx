'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import {
    arrayMove,
    horizontalListSortingStrategy,
    rectSortingStrategy,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { cn } from '@/lib/utils'
import { CheckCircle2, GripVertical, Loader2, Pencil } from 'lucide-react'
import {
    type CartaLang,
    getCartaDisplayName,
    prettifyChildTitle,
    tPublicUi,
    translateChildCategoryTitle,
    translateParentCategoryTitle,
} from '@/lib/carta-menu-i18n'

export type DigitalMenuRow = {
    articulo_id: number
    articulo_nombre: string
    /** Solo modo edición: si el producto está oculto en carta (`digital_menu_overrides.is_hidden`). */
    editor_is_hidden?: boolean
    carta_nombre: string
    carta_nombre_es: string | null
    carta_nombre_ca: string | null
    carta_nombre_en: string | null
    departamento_id: number | null
    departamento_nombre: string | null
    category_id: string | null
    category_parent_id: string | null
    category_parent_name: string | null
    category_parent_sort_order: number | null
    category_parent_cover_photo_url: string | null
    category_child_id: string | null
    category_child_name: string | null
    category_child_sort_order: number | null
    recipe_id: string
    recipe_name: string
    descripcion: string | null
    precio: number | string | null
    photo_url: string | null
    /** `digital_menu_overrides.sort_order` (orden dentro de la subcategoría en carta). */
    sort_order?: number | null
}

function formatPriceDisplay(precio: number | string | null | undefined): string {
    if (precio === null || precio === undefined) return ' '
    const n = typeof precio === 'string' ? parseFloat(precio) : precio
    if (Number.isNaN(n) || Math.abs(n) < 0.005) return ' '
    return `${n.toFixed(2)}€`
}

function MenuCard({
    row,
    lang,
    editMode = false,
    productReorderMode = false,
    onEditProduct,
    onToggleProductActive,
    productToggleBusyId,
}: {
    row: DigitalMenuRow
    lang: CartaLang
    editMode?: boolean
    /** Modo reordenar productos: no abrir modal de edición al pulsar nombre/precio. */
    productReorderMode?: boolean
    onEditProduct?: (articuloId: number) => void
    onToggleProductActive?: (articuloId: number) => void
    productToggleBusyId?: number | null
}) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const priceStr = formatPriceDisplay(row.precio)
    const showPrice = priceStr.trim() !== ''
    const displayName = getCartaDisplayName(row, lang)
    const isActive = editMode ? !(row.editor_is_hidden ?? false) : true
    const busy = editMode && productToggleBusyId === row.articulo_id

    return (
        <div
            className={cn(
                'flex h-full flex-col overflow-hidden rounded-2xl bg-white',
                editMode && !isActive && 'opacity-75'
            )}
        >
            <div className="w-full shrink-0 bg-white">
                <div className="relative h-14 w-full bg-white sm:h-16">
                    {row.photo_url ? (
                        <button
                            type="button"
                            className="relative flex h-full w-full cursor-zoom-in touch-manipulation items-center justify-center bg-white active:bg-zinc-50"
                            aria-label="Ver foto ampliada"
                            onClick={() => setLightboxOpen(true)}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- URLs arbitrarias desde BD */}
                            <img
                                src={row.photo_url}
                                alt=""
                                className="pointer-events-none h-full w-full max-h-full object-contain p-1.5"
                            />
                        </button>
                    ) : (
                        <div className="h-full w-full bg-white" />
                    )}
                    {editMode && onToggleProductActive ? (
                        <button
                            type="button"
                            className="absolute right-1 top-1 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-white/90 bg-white/95 text-[#36606F] shadow-sm active:bg-zinc-100 sm:right-1.5 sm:top-1.5 sm:min-h-[48px] sm:min-w-[48px]"
                            aria-label={isActive ? 'Desactivar en carta' : 'Activar en carta'}
                            title={isActive ? 'Visible en carta' : 'Oculto en carta'}
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onToggleProductActive(row.articulo_id)
                            }}
                        >
                            {busy ? (
                                <Loader2 className="h-5 w-5 animate-spin text-[#36606F]" />
                            ) : (
                                <CheckCircle2
                                    className={cn('h-6 w-6', isActive ? 'text-emerald-600' : 'text-zinc-400')}
                                    strokeWidth={2.5}
                                />
                            )}
                        </button>
                    ) : null}
                </div>
            </div>

            <div
                className={cn(
                    'flex min-h-0 flex-1 flex-col gap-0.5 px-2 pb-3 pt-1',
                    editMode && onEditProduct && !productReorderMode && 'cursor-pointer touch-manipulation active:bg-zinc-50'
                )}
                role={editMode && onEditProduct && !productReorderMode ? 'button' : undefined}
                tabIndex={editMode && onEditProduct && !productReorderMode ? 0 : undefined}
                onClick={
                    editMode && onEditProduct && !productReorderMode
                        ? () => {
                              onEditProduct(row.articulo_id)
                          }
                        : undefined
                }
                onKeyDown={
                    editMode && onEditProduct && !productReorderMode
                        ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  onEditProduct(row.articulo_id)
                              }
                          }
                        : undefined
                }
            >
                <p
                    className="line-clamp-3 w-full text-center text-[10px] font-black leading-tight text-zinc-900 sm:text-[11px]"
                    title={displayName}
                >
                    {displayName}
                </p>
                <div className="flex min-h-[44px] shrink-0 items-center justify-center py-0.5">
                    {showPrice ? (
                        <span className="text-center font-mono font-black tabular-nums text-[#36606F] text-[clamp(9px,1.2vw,11px)]">
                            {priceStr}
                        </span>
                    ) : (
                        <span className="min-h-[1em] font-mono text-[clamp(9px,1.2vw,11px)] text-transparent select-none" aria-hidden>
                            {' '}
                        </span>
                    )}
                </div>
            </div>

            <CartaImageLightbox
                src={row.photo_url}
                alt={displayName}
                title={displayName}
                open={lightboxOpen && !!row.photo_url}
                onClose={() => setLightboxOpen(false)}
            />
        </div>
    )
}

const LONG_PRESS_MS = 520

type ReorderScope = 'parents' | 'subs' | 'products' | null

function SortableParentCard({
    id,
    reorderActive,
    disabled,
    isOpen,
    children,
}: {
    id: string
    reorderActive: boolean
    disabled: boolean
    isOpen: boolean
    children: ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !reorderActive || disabled,
    })
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.88 : 1,
    }
    const showHandle = reorderActive && !disabled
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
                isOpen
                    ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20'
                    : 'border-zinc-200/60',
                showHandle && 'relative z-10 ring-2 ring-amber-300/70'
            )}
        >
            <div className="flex min-h-[52px] w-full items-stretch">
                {showHandle ? (
                    <button
                        type="button"
                        className="flex w-11 shrink-0 touch-none cursor-grab touch-manipulation items-center justify-center border-r border-zinc-100 bg-zinc-50/90 text-[#36606F] active:cursor-grabbing active:bg-zinc-100 sm:w-12"
                        aria-label="Arrastrar para reordenar sección"
                        {...listeners}
                        {...attributes}
                    >
                        <GripVertical className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                ) : null}
                <div className={cn('flex min-w-0 flex-1 items-stretch', showHandle && 'touch-none')}>{children}</div>
            </div>
        </div>
    )
}

function SortableSubTab({
    id,
    reorderActive,
    disabled,
    children,
}: {
    id: string
    reorderActive: boolean
    disabled: boolean
    children: ReactNode
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !reorderActive || disabled,
    })
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.88 : 1,
    }
    const showHandle = reorderActive && !disabled
    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn('flex min-w-0 flex-1 basis-0 flex-col', showHandle && 'touch-none')}
        >
            {showHandle ? (
                <button
                    type="button"
                    className="mb-1 flex min-h-[40px] w-full shrink-0 touch-none cursor-grab touch-manipulation items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] font-black uppercase text-zinc-600 active:cursor-grabbing"
                    {...listeners}
                    {...attributes}
                >
                    Arrastrar
                </button>
            ) : null}
            <div className="min-h-0 min-w-0 flex-1">{children}</div>
        </div>
    )
}

function SortableProductShell({ id, reorderActive, children }: { id: string; reorderActive: boolean; children: ReactNode }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id,
        disabled: !reorderActive,
    })
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.88 : 1,
    }
    return (
        <div ref={setNodeRef} style={style} className={cn('flex h-full flex-col gap-1', reorderActive && 'touch-none')}>
            {reorderActive ? (
                <button
                    type="button"
                    className="flex min-h-[36px] w-full shrink-0 touch-none cursor-grab touch-manipulation items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[9px] font-black uppercase text-zinc-600 active:cursor-grabbing"
                    {...listeners}
                    {...attributes}
                >
                    ⇅
                </button>
            ) : null}
            <div className="min-h-0 flex-1">{children}</div>
        </div>
    )
}

function isUuidLike(s: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s)
}

export function MenuAccordion({
    items,
    lang: controlledLang,
    onLangChange,
    hideLangPicker = false,
    editMode = false,
    onEditParentCategory,
    onEditProduct,
    onToggleProductActive,
    productToggleBusyId,
    onPersistParentCategoryOrder,
    onPersistChildCategoryOrder,
    onPersistProductOrder,
}: {
    items: DigitalMenuRow[]
    lang?: CartaLang
    onLangChange?: (next: CartaLang) => void
    hideLangPicker?: boolean
    editMode?: boolean
    onEditParentCategory?: (parentCategoryId: string) => void
    onEditProduct?: (articuloId: number) => void
    onToggleProductActive?: (articuloId: number) => void
    productToggleBusyId?: number | null
    onPersistParentCategoryOrder?: (orderedParentKeys: string[]) => void | Promise<void>
    onPersistChildCategoryOrder?: (parentKey: string, orderedChildKeys: string[]) => void | Promise<void>
    onPersistProductOrder?: (parentKey: string, subKey: string, orderedArticuloIds: number[]) => void | Promise<void>
}) {
    const [internalLang, setInternalLang] = useState<CartaLang>('es')
    const controlled = controlledLang !== undefined && onLangChange !== undefined
    const lang = controlled ? controlledLang : internalLang
    const setLang = controlled ? onLangChange : setInternalLang

    const grouped = useMemo(() => {
        type Group = {
            key: string
            title: string
            sortOrder: number
            coverPhotoUrl: string | null
            subs: Map<string, { title: string; sortOrder: number; rows: DigitalMenuRow[] }>
        }

        const groups = new Map<string, Group>()
        for (const row of items) {
            const parentTitleRaw = (row.category_parent_name?.trim() || 'Sin categoría').trim()
            const parentTitle = translateParentCategoryTitle(lang, parentTitleRaw)
            const parentSort = row.category_parent_sort_order ?? 9999
            const parentKey = row.category_parent_id ?? `__no_parent__:${parentTitle}`

            const childTitleRaw = row.category_child_name?.trim() || ''
            const childSort = row.category_child_sort_order ?? 9999
            const childKey = row.category_child_id ?? `__no_child__:${childTitleRaw}`

            const g = groups.get(parentKey) ?? {
                key: parentKey,
                title: parentTitle,
                sortOrder: parentSort,
                coverPhotoUrl: null as string | null,
                subs: new Map(),
            }
            const cov = row.category_parent_cover_photo_url?.trim()
            if (cov) g.coverPhotoUrl = cov

            const childShort = prettifyChildTitle(parentTitleRaw, childTitleRaw)
            const subTitle = translateChildCategoryTitle(lang, childShort)

            const sg =
                g.subs.get(childKey) ?? {
                    title: subTitle,
                    sortOrder: childSort,
                    rows: [] as DigitalMenuRow[],
                }
            sg.rows.push(row)
            g.subs.set(childKey, sg)

            groups.set(parentKey, g)
        }

        const groupList = Array.from(groups.values()).sort((a, b) => {
            if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
            return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
        })

        for (const g of groupList) {
            const subList = Array.from(g.subs.entries())
                .map(([k, v]) => ({ key: k, ...v }))
                .sort((a, b) => {
                    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
                    return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
                })

            for (const s of subList) {
                s.rows.sort((a, b) => {
                    const sa = a.sort_order ?? 9999
                    const sb = b.sort_order ?? 9999
                    if (sa !== sb) return sa - sb
                    return getCartaDisplayName(a, lang).localeCompare(getCartaDisplayName(b, lang), 'es', {
                        sensitivity: 'base',
                    })
                })
            }

            ;(g as any)._subList = subList.map((s) => ({
                ...s,
                title: s.title,
            }))
        }

        return groupList as Array<
            Group & {
                _subList: Array<{ key: string; title: string; sortOrder: number; rows: DigitalMenuRow[] }>
            }
        >
    }, [items, lang])

    const [openKey, setOpenKey] = useState<string | null>(null)
    const [selectedSubKeyByGroup, setSelectedSubKeyByGroup] = useState<Record<string, string>>({})

    const openIndex = useMemo(() => grouped.findIndex((g) => g.key === openKey), [grouped, openKey])
    const insertAfterIndex = useMemo(() => {
        if (openIndex < 0) return -1
        if (openIndex % 2 === 1) return openIndex
        return Math.min(openIndex + 1, grouped.length - 1)
    }, [openIndex, grouped.length])
    const openGroup = useMemo(
        () => (openKey ? grouped.find((g) => g.key === openKey) ?? null : null),
        [grouped, openKey]
    )

    const activeSubKeyForOpen = useMemo(() => {
        if (!openGroup) return null
        if (openGroup._subList.length <= 1) return openGroup._subList[0]?.key ?? null
        return selectedSubKeyByGroup[openGroup.key] || openGroup._subList[0]?.key || null
    }, [openGroup, selectedSubKeyByGroup])

    const [reorderScope, setReorderScope] = useState<ReorderScope>(null)
    const [activeDragId, setActiveDragId] = useState<string | null>(null)
    const lpTimer = useRef<number | null>(null)
    const reorderScopeRef = useRef<ReorderScope>(null)
    const suppressToggleRef = useRef(false)
    const openGroupRef = useRef(openGroup)
    useEffect(() => {
        reorderScopeRef.current = reorderScope
    }, [reorderScope])
    useEffect(() => {
        openGroupRef.current = openGroup
    }, [openGroup])

    useEffect(() => {
        if (reorderScope === 'parents') {
            setOpenKey(null)
        }
    }, [reorderScope])

    const clearLpTimer = useCallback(() => {
        if (lpTimer.current) {
            clearTimeout(lpTimer.current)
            lpTimer.current = null
        }
    }, [])

    const armParentsLp = useCallback(() => {
        clearLpTimer()
        if (!editMode || !onPersistParentCategoryOrder || reorderScopeRef.current) return
        lpTimer.current = window.setTimeout(() => {
            lpTimer.current = null
            suppressToggleRef.current = true
            setReorderScope('parents')
        }, LONG_PRESS_MS)
    }, [editMode, onPersistParentCategoryOrder, clearLpTimer])

    const armSubsLp = useCallback(() => {
        clearLpTimer()
        if (!editMode || !onPersistChildCategoryOrder || reorderScopeRef.current) return
        const og = openGroupRef.current
        if (!og || og._subList.length <= 1) return
        lpTimer.current = window.setTimeout(() => {
            lpTimer.current = null
            suppressToggleRef.current = true
            setReorderScope('subs')
        }, LONG_PRESS_MS)
    }, [editMode, onPersistChildCategoryOrder, clearLpTimer])

    const armProductsLp = useCallback(() => {
        clearLpTimer()
        if (!editMode || !onPersistProductOrder || reorderScopeRef.current) return
        const og = openGroupRef.current
        if (!og) return
        lpTimer.current = window.setTimeout(() => {
            lpTimer.current = null
            suppressToggleRef.current = true
            setReorderScope('products')
        }, LONG_PRESS_MS)
    }, [editMode, onPersistProductOrder, clearLpTimer])

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6, tolerance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    )

    const handleDragStart = useCallback((e: DragStartEvent) => {
        setActiveDragId(String(e.active.id))
    }, [])

    const handleDragEnd = useCallback(
        async (e: DragEndEvent) => {
            const { active, over } = e
            setActiveDragId(null)
            const scope = reorderScopeRef.current
            if (!over || active.id === over.id || !scope) return

            if (scope === 'parents' && onPersistParentCategoryOrder) {
                const ids = grouped.map((g) => g.key)
                const oldIndex = ids.indexOf(String(active.id))
                const newIndex = ids.indexOf(String(over.id))
                if (oldIndex < 0 || newIndex < 0) return
                const next = arrayMove(ids, oldIndex, newIndex)
                await onPersistParentCategoryOrder(next)
                setReorderScope(null)
                return
            }

            if (scope === 'subs' && onPersistChildCategoryOrder && openGroup) {
                const keys = openGroup._subList.map((s) => s.key)
                const oldIndex = keys.indexOf(String(active.id))
                const newIndex = keys.indexOf(String(over.id))
                if (oldIndex < 0 || newIndex < 0) return
                const next = arrayMove(keys, oldIndex, newIndex)
                await onPersistChildCategoryOrder(openGroup.key, next)
                setReorderScope(null)
                return
            }

            if (scope === 'products' && onPersistProductOrder && openGroup && activeSubKeyForOpen) {
                const sub = openGroup._subList.find((s) => s.key === activeSubKeyForOpen)
                if (!sub) return
                const ids = sub.rows.map((r) => r.articulo_id)
                const oid = Number(active.id)
                const nid = Number(over.id)
                const oldIndex = ids.indexOf(oid)
                const newIndex = ids.indexOf(nid)
                if (oldIndex < 0 || newIndex < 0) return
                const next = arrayMove(ids, oldIndex, newIndex)
                await onPersistProductOrder(openGroup.key, activeSubKeyForOpen, next)
                setReorderScope(null)
            }
        },
        [
            grouped,
            openGroup,
            activeSubKeyForOpen,
            onPersistParentCategoryOrder,
            onPersistChildCategoryOrder,
            onPersistProductOrder,
        ]
    )

    const parentSortIds = reorderScope === 'parents' ? grouped.map((g) => g.key) : []
    const subSortIds =
        reorderScope === 'subs' && openGroup && openGroup._subList.length > 1
            ? openGroup._subList.map((s) => s.key)
            : []
    const productSortIds =
        reorderScope === 'products' && openGroup && activeSubKeyForOpen
            ? (openGroup._subList.find((s) => s.key === activeSubKeyForOpen)?.rows.map((r) => String(r.articulo_id)) ??
              [])
            : []

    const dragOverlayLabel = useMemo(() => {
        if (!activeDragId) return ''
        if (reorderScope === 'parents') {
            const g = grouped.find((x) => x.key === activeDragId)
            return g?.title ?? ''
        }
        if (reorderScope === 'subs') {
            const s = openGroup?._subList.find((x) => x.key === activeDragId)
            return s?.title?.trim() || ''
        }
        if (reorderScope === 'products') {
            const sub = openGroup?._subList.find((s) => s.key === activeSubKeyForOpen)
            const row = sub?.rows.find((r) => String(r.articulo_id) === activeDragId)
            return row ? getCartaDisplayName(row, lang) : ''
        }
        return ''
    }, [activeDragId, reorderScope, grouped, openGroup, activeSubKeyForOpen, lang])

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-zinc-500">No hay platos en carta con mapeo TPV todavía.</p>
            </div>
        )
    }

    const headerToggle = (groupKey: string) => {
        if (suppressToggleRef.current) {
            suppressToggleRef.current = false
            return
        }
        setOpenKey((current) => {
            if (current === groupKey) {
                setSelectedSubKeyByGroup((p) => {
                    const n = { ...p }
                    delete n[groupKey]
                    return n
                })
                return null
            }
            setSelectedSubKeyByGroup((p) => {
                const n = { ...p }
                delete n[groupKey]
                return n
            })
            return groupKey
        })
    }

    const gridBlock = (
        <div className={cn('grid grid-cols-2 gap-2 sm:gap-4', hideLangPicker && 'pt-0')}>
            {grouped.map((group, idx) => {
                const isOpen = openKey === group.key
                const headerMain = (
                    <>
                        <button
                            type="button"
                            onClick={() => headerToggle(group.key)}
                            className="flex min-h-[52px] min-w-0 flex-1 items-center justify-start gap-2 px-2 py-2.5 text-left active:bg-zinc-50 sm:px-3"
                            aria-expanded={isOpen}
                        >
                            <span className="flex min-w-0 max-w-full flex-1 items-center justify-start gap-2 sm:gap-3">
                                {group.coverPhotoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- URL desde Storage/receta
                                    <img
                                        src={group.coverPhotoUrl}
                                        alt=""
                                        className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain object-left sm:h-10 sm:w-10"
                                    />
                                ) : null}
                                <span className="min-w-0 flex-1 text-left text-[11px] font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm">
                                    {group.title}
                                </span>
                            </span>
                        </button>
                        {editMode && isUuidLike(group.key) && onEditParentCategory ? (
                            <span
                                className="flex shrink-0 items-stretch pr-1"
                                onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                }}
                            >
                                <button
                                    type="button"
                                    onClick={() => onEditParentCategory?.(group.key)}
                                    className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center self-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                    aria-label="Editar categoría"
                                    title="Editar categoría"
                                >
                                    <Pencil className="h-5 w-5" strokeWidth={2.5} />
                                </button>
                            </span>
                        ) : null}
                    </>
                )
                const headerCard = (
                    <div
                        className={cn(
                            'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
                            isOpen
                                ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20'
                                : 'border-zinc-200/60',
                            reorderScope === 'parents' && isUuidLike(group.key) && 'ring-2 ring-amber-300/70'
                        )}
                        onPointerDown={
                            editMode && onPersistParentCategoryOrder && reorderScope !== 'parents'
                                ? armParentsLp
                                : undefined
                        }
                        onPointerUp={
                            editMode && onPersistParentCategoryOrder && reorderScope !== 'parents'
                                ? clearLpTimer
                                : undefined
                        }
                    >
                        <div className="flex min-h-[52px] w-full items-stretch">
                            {editMode && onPersistParentCategoryOrder && !reorderScope ? (
                                <button
                                    type="button"
                                    className="flex min-h-[52px] w-11 shrink-0 touch-manipulation items-center justify-center border-r border-zinc-100 bg-zinc-50/80 text-[#36606F] active:bg-zinc-100 sm:w-12"
                                    aria-label="Reordenar secciones del menú"
                                    title="Reordenar secciones (o mantén pulsada la cabecera)"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setOpenKey(null)
                                        setReorderScope('parents')
                                    }}
                                >
                                    <GripVertical className="h-5 w-5" strokeWidth={2.5} />
                                </button>
                            ) : null}
                            {headerMain}
                        </div>
                    </div>
                )

                return (
                    <Fragment key={group.key}>
                        {reorderScope === 'parents' ? (
                            <SortableParentCard
                                id={group.key}
                                reorderActive
                                disabled={!isUuidLike(group.key)}
                                isOpen={isOpen}
                            >
                                {headerMain}
                            </SortableParentCard>
                        ) : (
                            headerCard
                        )}

                        {openGroup && insertAfterIndex === idx ? (
                            <div className="col-span-2 overflow-hidden rounded-xl border-2 border-[#36606F] bg-white shadow-md ring-1 ring-[#36606F]/20">
                                <div className="px-3 pb-3 pt-3">
                                    {editMode &&
                                    onPersistChildCategoryOrder &&
                                    !reorderScope &&
                                    openGroup._subList.length > 1 ? (
                                        <div className="mb-2 flex justify-end">
                                            <button
                                                type="button"
                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[#36606F] shadow-sm min-h-[44px] active:bg-zinc-50 sm:min-h-[48px]"
                                                onClick={() => setReorderScope('subs')}
                                            >
                                                Reordenar pestañas
                                            </button>
                                        </div>
                                    ) : null}
                                    {openGroup._subList.length > 1 ? (
                                        reorderScope === 'subs' ? (
                                            <SortableContext
                                                id="carta-subs"
                                                items={subSortIds}
                                                strategy={horizontalListSortingStrategy}
                                            >
                                                <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                                                    {openGroup._subList.map((sub) => {
                                                        const sel = selectedSubKeyByGroup[openGroup.key]
                                                        const isActive = sel === sub.key
                                                        return (
                                                            <SortableSubTab
                                                                key={sub.key}
                                                                id={sub.key}
                                                                reorderActive
                                                                disabled={!isUuidLike(sub.key)}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        setSelectedSubKeyByGroup((p) => ({
                                                                            ...p,
                                                                            [openGroup.key]: sub.key,
                                                                        }))
                                                                    }
                                                                    className={cn(
                                                                        'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:px-2 sm:text-[11px]',
                                                                        isActive
                                                                            ? 'border-[#36606F] bg-white text-[#36606F]'
                                                                            : 'border-zinc-200/80 bg-white text-[#36606F] shadow-sm active:bg-zinc-50'
                                                                    )}
                                                                >
                                                                    <span className="line-clamp-3 min-w-0">
                                                                        {sub.title.trim() ||
                                                                            tPublicUi(lang).uncategorized}
                                                                    </span>
                                                                </button>
                                                            </SortableSubTab>
                                                        )
                                                    })}
                                                </div>
                                            </SortableContext>
                                        ) : (
                                            <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                                                {openGroup._subList.map((sub) => {
                                                    const sel = selectedSubKeyByGroup[openGroup.key]
                                                    const isActive = sel === sub.key
                                                    return (
                                                        <div
                                                            key={sub.key}
                                                            className="min-w-0 flex-1 basis-0"
                                                            onPointerDown={
                                                                editMode &&
                                                                onPersistChildCategoryOrder &&
                                                                !reorderScope
                                                                    ? armSubsLp
                                                                    : undefined
                                                            }
                                                            onPointerUp={
                                                                editMode &&
                                                                onPersistChildCategoryOrder &&
                                                                !reorderScope
                                                                    ? clearLpTimer
                                                                    : undefined
                                                            }
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setSelectedSubKeyByGroup((p) => ({
                                                                        ...p,
                                                                        [openGroup.key]: sub.key,
                                                                    }))
                                                                }
                                                                className={cn(
                                                                    'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:px-2 sm:text-[11px]',
                                                                    isActive
                                                                        ? 'border-[#36606F] bg-white text-[#36606F]'
                                                                        : 'border-zinc-200/80 bg-white text-[#36606F] shadow-sm active:bg-zinc-50'
                                                                )}
                                                            >
                                                                <span className="line-clamp-3 min-w-0">
                                                                    {sub.title.trim() ||
                                                                        tPublicUi(lang).uncategorized}
                                                                </span>
                                                            </button>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    ) : null}

                                    {openGroup._subList.length > 1 &&
                                    !selectedSubKeyByGroup[openGroup.key] ? null : (
                                        <div className="space-y-5">
                                            {(openGroup._subList.length > 1
                                                ? openGroup._subList.filter(
                                                      (s) => s.key === selectedSubKeyByGroup[openGroup.key]
                                                  )
                                                : openGroup._subList
                                            ).map((sub) => (
                                                <section key={sub.key} className="space-y-3">
                                                    {editMode &&
                                                    onPersistProductOrder &&
                                                    !reorderScope &&
                                                    sub.rows.length > 0 ? (
                                                        <div className="mb-2 flex justify-end">
                                                            <button
                                                                type="button"
                                                                className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[#36606F] shadow-sm min-h-[44px] active:bg-zinc-50 sm:min-h-[48px]"
                                                                onClick={() => setReorderScope('products')}
                                                            >
                                                                Reordenar platos
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                    {reorderScope === 'products' &&
                                                    sub.key === activeSubKeyForOpen ? (
                                                        <SortableContext
                                                            id="carta-products"
                                                            items={productSortIds}
                                                            strategy={rectSortingStrategy}
                                                        >
                                                            <div className="grid grid-cols-3 items-stretch gap-3 md:gap-4">
                                                                {sub.rows.map((row) => (
                                                                    <SortableProductShell
                                                                        key={row.articulo_id}
                                                                        id={String(row.articulo_id)}
                                                                        reorderActive
                                                                    >
                                                                        <div
                                                                            className="h-full"
                                                                            onPointerDown={
                                                                                editMode &&
                                                                                onPersistProductOrder &&
                                                                                !reorderScope
                                                                                    ? armProductsLp
                                                                                    : undefined
                                                                            }
                                                                            onPointerUp={
                                                                                editMode &&
                                                                                onPersistProductOrder &&
                                                                                !reorderScope
                                                                                    ? clearLpTimer
                                                                                    : undefined
                                                                            }
                                                                        >
                                                                            <MenuCard
                                                                                row={row}
                                                                                lang={lang}
                                                                                editMode={editMode}
                                                                                productReorderMode={
                                                                                    reorderScope === 'products'
                                                                                }
                                                                                onEditProduct={onEditProduct}
                                                                                onToggleProductActive={
                                                                                    onToggleProductActive
                                                                                }
                                                                                productToggleBusyId={
                                                                                    productToggleBusyId
                                                                                }
                                                                            />
                                                                        </div>
                                                                    </SortableProductShell>
                                                                ))}
                                                            </div>
                                                        </SortableContext>
                                                    ) : (
                                                        <div className="grid grid-cols-3 items-stretch gap-3 md:gap-4">
                                                            {sub.rows.map((row) => (
                                                                <div
                                                                    key={row.articulo_id}
                                                                    className="h-full"
                                                                    onPointerDown={
                                                                        editMode &&
                                                                        onPersistProductOrder &&
                                                                        !reorderScope
                                                                            ? armProductsLp
                                                                            : undefined
                                                                    }
                                                                    onPointerUp={
                                                                        editMode &&
                                                                        onPersistProductOrder &&
                                                                        !reorderScope
                                                                            ? clearLpTimer
                                                                            : undefined
                                                                    }
                                                                >
                                                                    <MenuCard
                                                                        row={row}
                                                                        lang={lang}
                                                                        editMode={editMode}
                                                                        onEditProduct={onEditProduct}
                                                                        onToggleProductActive={
                                                                            onToggleProductActive
                                                                        }
                                                                        productToggleBusyId={
                                                                            productToggleBusyId
                                                                        }
                                                                    />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </section>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : null}
                    </Fragment>
                )
            })}
        </div>
    )

    return (
        <div className={hideLangPicker ? undefined : 'space-y-6'}>
            {!hideLangPicker ? (
                <div className="w-full pt-1">
                    <CartaLangPicker lang={lang} onChange={setLang} />
                </div>
            ) : null}

            {reorderScope ? (
                <div className="flex min-h-[52px] shrink-0 items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shadow-sm">
                    <span className="flex min-w-0 items-center gap-2 text-[11px] font-black uppercase leading-tight tracking-wide text-amber-950">
                        <GripVertical className="h-4 w-4 shrink-0 text-amber-800" aria-hidden />
                        <span className="min-w-0">
                            {reorderScope === 'parents' && 'Mantén y arrastra secciones (suelta para guardar)'}
                            {reorderScope === 'subs' && 'Orden de pestañas de subcategoría'}
                            {reorderScope === 'products' && 'Orden de platos en esta subcategoría'}
                        </span>
                    </span>
                    <button
                        type="button"
                        className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-amber-950 min-h-[48px] active:bg-amber-100"
                        onClick={() => setReorderScope(null)}
                    >
                        Listo
                    </button>
                </div>
            ) : null}

            {reorderScope ? (
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    autoScroll={false}
                    onDragStart={handleDragStart}
                    onDragEnd={(e) => void handleDragEnd(e)}
                >
                    {reorderScope === 'parents' ? (
                        <SortableContext
                            id="carta-parents"
                            items={parentSortIds}
                            strategy={rectSortingStrategy}
                        >
                            {gridBlock}
                        </SortableContext>
                    ) : (
                        gridBlock
                    )}
                    <DragOverlay dropAnimation={null}>
                        {activeDragId && dragOverlayLabel ? (
                            <div className="max-w-[200px] rounded-xl border-2 border-[#36606F] bg-white px-3 py-2 text-center text-[10px] font-black uppercase leading-tight text-[#36606F] shadow-lg">
                                {dragOverlayLabel}
                            </div>
                        ) : null}
                    </DragOverlay>
                </DndContext>
            ) : (
                gridBlock
            )}
        </div>
    )
}
