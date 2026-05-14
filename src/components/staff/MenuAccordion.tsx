'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { cn } from '@/lib/utils'
import { Check, Circle, GripVertical, Loader2, Pencil, X } from 'lucide-react'
import {
    type CartaLang,
    DEFAULT_CARTA_LANG,
    getCartaChildCategoryLabel,
    getCartaDisplayName,
    getCartaParentCategoryLabel,
    getCartaSubcategoryPickerLabel,
    tPublicUi,
} from '@/lib/carta-menu-i18n'
import { mergeEnteroMedioForCartaDisplay } from '@/lib/carta-medio-merge'

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
    category_parent_name_es?: string | null
    category_parent_name_ca?: string | null
    category_parent_name_en?: string | null
    category_parent_sort_order: number | null
    category_parent_cover_photo_url: string | null
    category_child_id: string | null
    category_child_name: string | null
    category_child_name_es?: string | null
    category_child_name_ca?: string | null
    category_child_name_en?: string | null
    category_child_sort_order: number | null
    recipe_id: string
    recipe_name: string
    descripcion: string | null
    precio: number | string | null
    /** Par entero/medio fusionado (solo UI): precio del artículo medio. */
    precio_medio_display?: number | string | null
    photo_url: string | null
    /** `digital_menu_overrides.sort_order` (orden dentro de la subcategoría en carta). */
    sort_order?: number | null
    /** Desde `map_tpv_receta.factor_porcion` vía vista carta. */
    tpv_factor_porcion?: number | null
}

type GroupedSub = { key: string; title: string; sortOrder: number; rows: DigitalMenuRow[] }
type GroupedGroup = {
    key: string
    title: string
    /** Nombre padre en BD (español base) para orden fijo */
    parentTitleRaw: string
    sortOrder: number
    coverPhotoUrl: string | null
    _subList: GroupedSub[]
}

function subPickerButtonLabel(sub: GroupedSub, lang: CartaLang, parentTitleRaw: string, uncategorized: string) {
    const row = sub.rows[0]
    const childRaw = (row?.category_child_name ?? '').trim()
    if (row) {
        const only = getCartaSubcategoryPickerLabel(lang, row, parentTitleRaw, childRaw).trim()
        if (only) return only
    }
    return sub.title.trim() || uncategorized
}

type ReorderScope = 'parents' | 'subs' | 'products' | null

function arrayMove<T>(arr: T[], from: number, to: number): T[] {
    if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return [...arr]
    const n = [...arr]
    const [item] = n.splice(from, 1)
    n.splice(to, 0, item as T)
    return n
}

function orderGroupsByKeys(groups: GroupedGroup[], keys: string[]): GroupedGroup[] {
    const m = new Map(groups.map((g) => [g.key, g] as const))
    const out: GroupedGroup[] = []
    const seen = new Set<string>()
    for (const k of keys) {
        const g = m.get(k)
        if (g) {
            out.push(g)
            seen.add(k)
        }
    }
    for (const g of groups) {
        if (!seen.has(g.key)) out.push(g)
    }
    return out
}

function orderSubListByKeys(subs: GroupedSub[], keys: string[]): GroupedSub[] {
    const m = new Map(subs.map((s) => [s.key, s] as const))
    const out: GroupedSub[] = []
    const seen = new Set<string>()
    for (const k of keys) {
        const s = m.get(k)
        if (s) {
            out.push({ ...s, rows: [...s.rows] })
            seen.add(k)
        }
    }
    for (const s of subs) {
        if (!seen.has(s.key)) out.push({ ...s, rows: [...s.rows] })
    }
    return out
}

function orderRowsByArticuloIds(rows: DigitalMenuRow[], ids: number[]): DigitalMenuRow[] {
    const m = new Map(rows.map((r) => [r.articulo_id, r] as const))
    const out: DigitalMenuRow[] = []
    const seen = new Set<number>()
    for (const id of ids) {
        const r = m.get(id)
        if (r) {
            out.push(r)
            seen.add(id)
        }
    }
    for (const r of rows) {
        if (!seen.has(r.articulo_id)) out.push(r)
    }
    return out
}

function applyReorderDrafts(
    base: GroupedGroup[],
    scope: ReorderScope,
    openKey: string | null,
    activeSubKey: string | null,
    parentKeysDraft: string[] | null,
    subKeysDraft: string[] | null,
    productIdsDraft: number[] | null
): GroupedGroup[] {
    if (!scope) return base
    if (scope === 'parents' && parentKeysDraft?.length) {
        return orderGroupsByKeys(base, parentKeysDraft)
    }
    if (scope === 'subs' && openKey && subKeysDraft?.length) {
        return base.map((g) => {
            if (g.key !== openKey) return g
            return { ...g, _subList: orderSubListByKeys(g._subList, subKeysDraft) }
        })
    }
    if (scope === 'products' && openKey && activeSubKey && productIdsDraft?.length) {
        return base.map((g) => {
            if (g.key !== openKey) return g
            return {
                ...g,
                _subList: g._subList.map((s) => {
                    if (s.key !== activeSubKey) return s
                    return { ...s, rows: orderRowsByArticuloIds(s.rows, productIdsDraft) }
                }),
            }
        })
    }
    return base
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
    onReorderTap,
}: {
    row: DigitalMenuRow
    lang: CartaLang
    editMode?: boolean
    /** Modo reordenar productos: no abrir modal de edición al pulsar nombre/precio. */
    productReorderMode?: boolean
    onEditProduct?: (articuloId: number) => void
    onToggleProductActive?: (articuloId: number) => void
    productToggleBusyId?: number | null
    /** Clic en foto en modo reordenar platos (misma lógica que la tarjeta). */
    onReorderTap?: (articuloId: number) => void
}) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const priceStr = formatPriceDisplay(row.precio)
    const priceMedioStr = formatPriceDisplay(row.precio_medio_display ?? null)
    const showPrice = priceStr.trim() !== ''
    const showMedio = priceMedioStr.trim() !== ''
    const displayName = getCartaDisplayName(row, lang)
    const isActive = editMode ? !(row.editor_is_hidden ?? false) : true
    const busy = editMode && productToggleBusyId === row.articulo_id

    return (
        <div
            className={cn(
                'flex h-full flex-col items-center overflow-hidden rounded-2xl bg-white',
                editMode && !isActive && 'opacity-75'
            )}
        >
            <div className="flex w-full flex-col items-center px-2 pt-2">
                <div className="relative mx-auto h-14 w-full max-w-[min(100%,8rem)] shrink-0 bg-white sm:h-16">
                    {row.photo_url ? (
                        <button
                            type="button"
                            className={cn(
                                'relative flex h-full w-full touch-manipulation items-center justify-center bg-white active:bg-zinc-50',
                                productReorderMode && onReorderTap ? 'cursor-pointer' : 'cursor-zoom-in'
                            )}
                            aria-label={
                                productReorderMode && onReorderTap ? 'Seleccionar para reordenar' : 'Ver foto ampliada'
                            }
                            onClick={(e) => {
                                if (productReorderMode && onReorderTap) {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    onReorderTap(row.articulo_id)
                                    return
                                }
                                setLightboxOpen(true)
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- URLs arbitrarias desde BD */}
                            <img
                                src={row.photo_url}
                                alt=""
                                className="pointer-events-none h-full w-full max-h-full object-contain object-center p-1.5"
                            />
                        </button>
                    ) : (
                        <div className="h-full w-full bg-white" />
                    )}
                    {editMode && onToggleProductActive ? (
                        <button
                            type="button"
                            className="absolute right-0 top-0 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 shadow-none outline-none ring-0 sm:right-0.5 sm:top-0.5 sm:min-h-[48px] sm:min-w-[48px]"
                            aria-label={isActive ? 'Desactivar en carta' : 'Activar en carta'}
                            title={isActive ? 'Visible en carta' : 'Oculto en carta'}
                            onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                onToggleProductActive(row.articulo_id)
                            }}
                        >
                            {busy ? (
                                <Loader2 className="h-5 w-5 animate-spin text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.85)]" />
                            ) : isActive ? (
                                <Check
                                    className="h-7 w-7 text-emerald-400"
                                    strokeWidth={3.25}
                                    aria-hidden
                                />
                            ) : (
                                <Circle
                                    className="h-6 w-6 text-white/35 drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)]"
                                    strokeWidth={2.5}
                                    aria-hidden
                                />
                            )}
                        </button>
                    ) : null}
                </div>
            </div>

            <div
                className={cn(
                    'flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 px-2 pb-3 pt-1',
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
                    className="line-clamp-3 w-full max-w-full text-center text-[10px] font-black leading-tight text-zinc-900 sm:text-[11px]"
                    title={displayName}
                >
                    {displayName}
                </p>
                <div className="flex min-h-[44px] w-full shrink-0 flex-col items-center justify-center gap-0.5 py-0.5">
                    {showPrice && showMedio ? (
                        <>
                            <span className="text-center font-mono font-black tabular-nums text-[#36606F] text-[clamp(9px,1.2vw,11px)] leading-none">
                                {priceStr}
                            </span>
                            <span className="text-center font-mono font-black tabular-nums text-[#36606F]/90 text-[clamp(8px,1.1vw,10px)] leading-none">
                                {priceMedioStr}
                            </span>
                        </>
                    ) : showPrice ? (
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
                open={lightboxOpen && !!row.photo_url && !(productReorderMode && onReorderTap)}
                onClose={() => setLightboxOpen(false)}
            />
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
    onEditChildCategory,
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
    onEditChildCategory?: (childCategoryId: string) => void
    onEditProduct?: (articuloId: number) => void
    onToggleProductActive?: (articuloId: number) => void
    productToggleBusyId?: number | null
    onPersistParentCategoryOrder?: (orderedParentKeys: string[]) => boolean | Promise<boolean>
    onPersistChildCategoryOrder?: (parentKey: string, orderedChildKeys: string[]) => boolean | Promise<boolean>
    onPersistProductOrder?: (parentKey: string, subKey: string, orderedArticuloIds: number[]) => boolean | Promise<boolean>
}) {
    const [internalLang, setInternalLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
    const controlled = controlledLang !== undefined && onLangChange !== undefined
    const lang = controlled ? controlledLang : internalLang
    const setLang = controlled ? onLangChange : setInternalLang

    const grouped = useMemo(() => {
        type Group = {
            key: string
            title: string
            parentTitleRaw: string
            sortOrder: number
            coverPhotoUrl: string | null
            subs: Map<string, { title: string; sortOrder: number; rows: DigitalMenuRow[] }>
        }

        const groups = new Map<string, Group>()
        for (const row of items) {
            const parentTitleRaw = (row.category_parent_name?.trim() || 'Sin categoría').trim()
            const parentTitle = getCartaParentCategoryLabel(lang, row, tPublicUi(lang).uncategorized)
            const parentSort = row.category_parent_sort_order ?? 9999
            const parentKey = row.category_parent_id ?? `__no_parent__:${parentTitleRaw}`

            const childTitleRaw = row.category_child_name?.trim() || ''
            const childSort = row.category_child_sort_order ?? 9999
            const childKey = row.category_child_id ?? `__no_child__:${childTitleRaw}`

            const g = groups.get(parentKey) ?? {
                key: parentKey,
                title: parentTitle,
                parentTitleRaw,
                sortOrder: parentSort,
                coverPhotoUrl: null as string | null,
                subs: new Map(),
            }
            const cov = row.category_parent_cover_photo_url?.trim()
            if (cov) g.coverPhotoUrl = cov

            const subTitle = getCartaChildCategoryLabel(lang, row, parentTitleRaw, childTitleRaw)

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
            return a.parentTitleRaw.localeCompare(b.parentTitleRaw, 'es', { sensitivity: 'base' })
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

        return groupList as unknown as GroupedGroup[]
    }, [items, lang])

    const groupedRef = useRef<GroupedGroup[]>([])
    groupedRef.current = grouped as GroupedGroup[]

    const [openKey, setOpenKey] = useState<string | null>(null)
    const [selectedSubKeyByGroup, setSelectedSubKeyByGroup] = useState<Record<string, string>>({})

    const [reorderScope, setReorderScope] = useState<ReorderScope>(null)
    const [parentKeysDraft, setParentKeysDraft] = useState<string[] | null>(null)
    const [subKeysDraft, setSubKeysDraft] = useState<string[] | null>(null)
    const [productIdsDraft, setProductIdsDraft] = useState<number[] | null>(null)
    const [reorderPick, setReorderPick] = useState<string | null>(null)
    const [committingReorder, setCommittingReorder] = useState(false)

    const openGroupBase = useMemo(
        () => (openKey ? (grouped as GroupedGroup[]).find((g) => g.key === openKey) ?? null : null),
        [grouped, openKey]
    )

    const activeSubKeyForOpen = useMemo(() => {
        if (!openGroupBase) return null
        if (openGroupBase._subList.length <= 1) return openGroupBase._subList[0]?.key ?? null
        return selectedSubKeyByGroup[openGroupBase.key] || openGroupBase._subList[0]?.key || null
    }, [openGroupBase, selectedSubKeyByGroup])

    const displayGrouped = useMemo(
        () =>
            applyReorderDrafts(
                grouped as GroupedGroup[],
                reorderScope,
                openKey,
                activeSubKeyForOpen,
                parentKeysDraft,
                subKeysDraft,
                productIdsDraft
            ),
        [grouped, reorderScope, openKey, activeSubKeyForOpen, parentKeysDraft, subKeysDraft, productIdsDraft]
    )

    const openGroup = useMemo(
        () => (openKey ? displayGrouped.find((g) => g.key === openKey) ?? null : null),
        [displayGrouped, openKey]
    )

    /** Sub visible en el modal (para «Reordenar platos»): vacío si hay pestañas y ninguna elegida. */
    const modalProductSub = useMemo(() => {
        if (!openGroup) return null
        const list =
            openGroup._subList.length > 1
                ? openGroup._subList.filter((s) => s.key === selectedSubKeyByGroup[openGroup.key])
                : openGroup._subList
        return list[0] ?? null
    }, [openGroup, selectedSubKeyByGroup])

    useEffect(() => {
        if (reorderScope === 'parents') {
            setOpenKey(null)
        }
    }, [reorderScope])

    const handleParentReorderTap = useCallback(
        (groupKey: string) => {
            if (!parentKeysDraft || !isUuidLike(groupKey)) return
            if (!reorderPick) {
                setReorderPick(groupKey)
                return
            }
            if (reorderPick === groupKey) {
                setReorderPick(null)
                return
            }
            const from = parentKeysDraft.indexOf(reorderPick)
            const to = parentKeysDraft.indexOf(groupKey)
            if (from < 0 || to < 0) {
                setReorderPick(null)
                return
            }
            setParentKeysDraft(arrayMove(parentKeysDraft, from, to))
            setReorderPick(null)
        },
        [parentKeysDraft, reorderPick]
    )

    const handleSubReorderTap = useCallback(
        (subKey: string) => {
            if (!subKeysDraft || !isUuidLike(subKey)) return
            if (!reorderPick) {
                setReorderPick(subKey)
                return
            }
            if (reorderPick === subKey) {
                setReorderPick(null)
                return
            }
            const from = subKeysDraft.indexOf(reorderPick)
            const to = subKeysDraft.indexOf(subKey)
            if (from < 0 || to < 0) {
                setReorderPick(null)
                return
            }
            setSubKeysDraft(arrayMove(subKeysDraft, from, to))
            setReorderPick(null)
        },
        [subKeysDraft, reorderPick]
    )

    const handleProductReorderTap = useCallback(
        (articuloId: number) => {
            if (!productIdsDraft) return
            const idStr = String(articuloId)
            if (!reorderPick) {
                setReorderPick(idStr)
                return
            }
            if (reorderPick === idStr) {
                setReorderPick(null)
                return
            }
            const from = productIdsDraft.indexOf(Number(reorderPick))
            const to = productIdsDraft.indexOf(articuloId)
            if (from < 0 || to < 0) {
                setReorderPick(null)
                return
            }
            setProductIdsDraft(arrayMove(productIdsDraft, from, to))
            setReorderPick(null)
        },
        [productIdsDraft, reorderPick]
    )

    const cancelReorder = useCallback(() => {
        setReorderScope(null)
        setParentKeysDraft(null)
        setSubKeysDraft(null)
        setProductIdsDraft(null)
        setReorderPick(null)
    }, [])

    const commitReorder = useCallback(async () => {
        if (!reorderScope || committingReorder) return
        setCommittingReorder(true)
        try {
            let ok = true
            if (reorderScope === 'parents' && parentKeysDraft && onPersistParentCategoryOrder) {
                ok = await onPersistParentCategoryOrder(parentKeysDraft)
            } else if (reorderScope === 'subs' && openKey && subKeysDraft && onPersistChildCategoryOrder) {
                ok = await onPersistChildCategoryOrder(openKey, subKeysDraft)
            } else if (
                reorderScope === 'products' &&
                openKey &&
                activeSubKeyForOpen &&
                productIdsDraft &&
                onPersistProductOrder
            ) {
                ok = await onPersistProductOrder(openKey, activeSubKeyForOpen, productIdsDraft)
            }
            if (ok) {
                cancelReorder()
            }
        } finally {
            setCommittingReorder(false)
        }
    }, [
        reorderScope,
        committingReorder,
        parentKeysDraft,
        subKeysDraft,
        productIdsDraft,
        openKey,
        activeSubKeyForOpen,
        onPersistParentCategoryOrder,
        onPersistChildCategoryOrder,
        onPersistProductOrder,
        cancelReorder,
    ])

    if (items.length === 0) {
        return (
            <div className="rounded-xl bg-white p-6 text-center">
                <p className="text-sm font-medium text-zinc-500">No hay platos en carta con mapeo TPV todavía.</p>
            </div>
        )
    }

    const headerToggle = (groupKey: string) => {
        setSelectedSubKeyByGroup((p) => {
            const n = { ...p }
            delete n[groupKey]
            return n
        })
        setOpenKey((prev) => (prev === groupKey ? null : groupKey))
    }

    const gridBlock = (
        <div
            className={cn(
                'grid grid-cols-1 gap-3 sm:gap-4',
                hideLangPicker && 'min-h-0 flex-1 pt-0',
                !hideLangPicker && 'mt-4 sm:mt-5'
            )}
            style={
                hideLangPicker && displayGrouped.length > 0
                    ? {
                          gridTemplateRows: `repeat(${displayGrouped.length}, minmax(4.5rem, 1fr))`,
                      }
                    : undefined
            }
        >
            {displayGrouped.map((group) => {
                const isOpen = openKey === group.key
                const headerMain = (
                    <>
                        <button
                            type="button"
                            onClick={() => headerToggle(group.key)}
                            className={cn(
                                'flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2.5 active:bg-zinc-50 sm:px-3',
                                hideLangPicker ? 'min-h-0 h-full' : 'min-h-[52px]'
                            )}
                            aria-expanded={isOpen}
                        >
                            <span className="flex min-w-0 max-w-full flex-1 items-center justify-center gap-2 sm:gap-3">
                                {group.coverPhotoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- URL desde Storage/receta
                                    <img
                                        src={group.coverPhotoUrl}
                                        alt=""
                                        className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain object-center sm:h-14 sm:w-14"
                                    />
                                ) : null}
                                <span className="min-w-0 max-w-[85%] text-center text-sm font-black uppercase leading-tight tracking-wide text-[#36606F] sm:max-w-none sm:text-base md:text-lg">
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
                            'overflow-hidden rounded-2xl bg-white transition-colors duration-200',
                            isOpen ? 'bg-zinc-50' : 'hover:bg-zinc-50/70',
                            hideLangPicker && 'flex min-h-0 flex-1 flex-col'
                        )}
                    >
                        <div
                            className={cn(
                                'flex w-full items-stretch',
                                hideLangPicker ? 'min-h-0 flex-1' : 'min-h-[52px]'
                            )}
                        >
                            {editMode && onPersistParentCategoryOrder && !reorderScope ? (
                                <button
                                    type="button"
                                    className={cn(
                                        'flex w-11 shrink-0 touch-manipulation items-center justify-center bg-zinc-50/80 text-[#36606F] active:bg-zinc-100 sm:w-12',
                                        hideLangPicker ? 'min-h-0 self-stretch' : 'min-h-[52px]'
                                    )}
                                    aria-label="Cambiar posición de secciones"
                                    title="Cambiar posición de secciones"
                                    onClick={(e) => {
                                        e.preventDefault()
                                        e.stopPropagation()
                                        setOpenKey(null)
                                        setReorderPick(null)
                                        setParentKeysDraft(groupedRef.current.map((g) => g.key))
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

                const parentReorderCard = (
                    <div
                        className={cn(
                            'overflow-hidden rounded-2xl bg-white transition-colors duration-200',
                            isOpen ? 'bg-zinc-50' : 'hover:bg-zinc-50/70',
                            reorderPick === group.key && isUuidLike(group.key) && 'bg-amber-50/80',
                            hideLangPicker && 'flex min-h-0 flex-1 flex-col'
                        )}
                    >
                        <div
                            className={cn(
                                'flex w-full items-stretch',
                                hideLangPicker ? 'min-h-0 flex-1' : 'min-h-[52px]'
                            )}
                        >
                            <button
                                type="button"
                                disabled={!isUuidLike(group.key)}
                                onClick={() => handleParentReorderTap(group.key)}
                                className={cn(
                                    'flex min-w-0 flex-1 items-center justify-center gap-2 px-2 py-2.5 active:bg-zinc-50 sm:px-3',
                                    hideLangPicker ? 'min-h-0 h-full' : 'min-h-[52px]',
                                    !isUuidLike(group.key) && 'cursor-not-allowed opacity-50'
                                )}
                            >
                                <span className="flex min-w-0 max-w-full flex-1 items-center justify-center gap-2 sm:gap-3">
                                    {group.coverPhotoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- URL desde Storage/receta
                                        <img
                                            src={group.coverPhotoUrl}
                                            alt=""
                                            className="h-11 w-11 shrink-0 rounded-lg bg-white object-contain object-center sm:h-14 sm:w-14"
                                        />
                                    ) : null}
                                    <span className="min-w-0 max-w-[85%] text-center text-sm font-black uppercase leading-tight tracking-wide text-[#36606F] sm:max-w-none sm:text-base md:text-lg">
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
                        </div>
                    </div>
                )

                return (
                    <Fragment key={group.key}>
                        <div className={cn(hideLangPicker && 'flex h-full min-h-0 flex-col')}>
                            {reorderScope === 'parents' ? parentReorderCard : headerCard}
                        </div>
                    </Fragment>
                )
            })}
        </div>
    )

    return (
        <div className={hideLangPicker ? 'flex min-h-0 flex-1 flex-col' : 'space-y-6'}>
            {!hideLangPicker ? (
                <div className="w-full pt-1">
                    <CartaLangPicker lang={lang} onChange={setLang} />
                </div>
            ) : null}

            {reorderScope ? (
                <div className="flex shrink-0 flex-col gap-2 rounded-xl bg-amber-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span className="flex min-w-0 items-start gap-2 text-[11px] font-black uppercase leading-snug tracking-wide text-amber-950 sm:items-center">
                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 sm:mt-0" aria-hidden />
                        <span className="min-w-0">
                            {reorderScope === 'parents' &&
                                '1) Pulsa la sección a mover. 2) Pulsa la posición destino (el resto se corre). 3) Guardar orden.'}
                            {reorderScope === 'subs' &&
                                '1) Pulsa la pestaña a mover. 2) Pulsa la posición destino. 3) Guardar orden.'}
                            {reorderScope === 'products' &&
                                '1) Pulsa el plato a mover. 2) Pulsa el destino (otra tarjeta). 3) Guardar orden.'}
                        </span>
                    </span>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                        <button
                            type="button"
                            className="min-h-[48px] rounded-xl bg-zinc-100 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-800 active:bg-zinc-200/80"
                            onClick={cancelReorder}
                            disabled={committingReorder}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="inline-flex min-h-[48px] min-w-[140px] items-center justify-center gap-2 rounded-xl bg-[#36606F] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white active:bg-[#2d4f5c] disabled:opacity-60"
                            onClick={() => void commitReorder()}
                            disabled={committingReorder}
                        >
                            {committingReorder ? (
                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                            ) : null}
                            Guardar orden
                        </button>
                    </div>
                </div>
            ) : null}

            {gridBlock}

            {openGroup ? (
                <div
                    className="fixed inset-0 z-[250] flex items-center justify-center p-4 pb-safe pt-4 animate-in fade-in duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="staff-carta-section-modal-title"
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px] transition-opacity"
                        aria-label="Cerrar"
                        onClick={() => setOpenKey(null)}
                    />
                    <div
                        className="relative z-10 flex w-full max-w-lg max-h-[82vh] min-h-0 flex-col overflow-hidden rounded-[22px] bg-white animate-in zoom-in-95 duration-200 sm:max-h-[78vh] sm:max-w-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex shrink-0 items-center gap-1.5 bg-white px-2 py-2 sm:gap-2 sm:px-3 sm:py-2.5">
                            <h2
                                id="staff-carta-section-modal-title"
                                className="min-w-0 flex-1 truncate text-left text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm"
                            >
                                {openGroup.title}
                            </h2>
                            {editMode &&
                            !reorderScope &&
                            ((onPersistChildCategoryOrder && openGroup._subList.length > 1) ||
                                (onPersistProductOrder &&
                                    modalProductSub &&
                                    modalProductSub.rows.length > 0)) ? (
                                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1 sm:gap-1.5">
                                    {onPersistChildCategoryOrder && openGroup._subList.length > 1 ? (
                                        <button
                                            type="button"
                                            className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                            onClick={() => {
                                                setReorderPick(null)
                                                setSubKeysDraft(openGroup._subList.map((s) => s.key))
                                                setReorderScope('subs')
                                            }}
                                        >
                                            Reordenar pestañas
                                        </button>
                                    ) : null}
                                    {onPersistProductOrder &&
                                    modalProductSub &&
                                    modalProductSub.rows.length > 0 ? (
                                        <button
                                            type="button"
                                            className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                            onClick={() => {
                                                setReorderPick(null)
                                                setProductIdsDraft(modalProductSub.rows.map((r) => r.articulo_id))
                                                setReorderScope('products')
                                            }}
                                        >
                                            Reordenar platos
                                        </button>
                                    ) : null}
                                </div>
                            ) : null}
                            <button
                                type="button"
                                className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                aria-label="Cerrar"
                                onClick={() => setOpenKey(null)}
                            >
                                <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                            </button>
                        </div>

                        {reorderScope === 'subs' || reorderScope === 'products' ? (
                            <div className="shrink-0 bg-amber-50 px-2 py-2 sm:px-3 sm:py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-start gap-2 text-[11px] font-black uppercase leading-snug tracking-wide text-amber-950 sm:items-center">
                                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 sm:mt-0" aria-hidden />
                                        <span className="min-w-0">
                                            {reorderScope === 'subs'
                                                ? '1) Pulsa la pestaña a mover. 2) Pulsa la posición destino. 3) Guardar orden.'
                                                : '1) Pulsa el plato a mover. 2) Pulsa el destino (otra tarjeta). 3) Guardar orden.'}
                                        </span>
                                    </span>
                                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                                        <button
                                            type="button"
                                            className="min-h-[48px] rounded-xl bg-zinc-100 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-800 active:bg-zinc-200/80"
                                            onClick={cancelReorder}
                                            disabled={committingReorder}
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            className="inline-flex min-h-[48px] min-w-[140px] items-center justify-center gap-2 rounded-xl bg-[#36606F] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white active:bg-[#2d4f5c] disabled:opacity-60"
                                            onClick={() => void commitReorder()}
                                            disabled={committingReorder}
                                        >
                                            {committingReorder ? (
                                                <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                                            ) : null}
                                            Guardar orden
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {editMode &&
                        !reorderScope &&
                        openGroup._subList.length === 1 &&
                        onEditChildCategory &&
                        isUuidLike(openGroup._subList[0]!.key) ? (
                            <div className="flex shrink-0 items-center justify-center gap-1 bg-white px-2 py-2 sm:px-3">
                                <span className="min-w-0 max-w-[75%] truncate text-center text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-[11px]">
                                    {subPickerButtonLabel(
                                        openGroup._subList[0]!,
                                        lang,
                                        openGroup.parentTitleRaw,
                                        tPublicUi(lang).uncategorized
                                    )}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onEditChildCategory(openGroup._subList[0]!.key)}
                                    className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100 sm:min-h-[48px] sm:min-w-[48px]"
                                    aria-label="Editar subcategoría"
                                    title="Editar subcategoría"
                                >
                                    <Pencil className="h-4 w-4 sm:h-5 sm:w-5" strokeWidth={2.5} />
                                </button>
                            </div>
                        ) : null}

                        {openGroup._subList.length > 1 &&
                        (selectedSubKeyByGroup[openGroup.key] || reorderScope === 'subs') ? (
                            <div className="shrink-0 bg-white px-2.5 pb-2.5 pt-2 sm:px-3">
                                {reorderScope === 'subs' ? (
                                    <div className="flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto sm:gap-1.5">
                                        {openGroup._subList.map((sub) => {
                                            const sel = selectedSubKeyByGroup[openGroup.key]
                                            const isActive = sel === sub.key
                                            const picked = reorderPick === sub.key && isUuidLike(sub.key)
                                            return (
                                                <div key={sub.key} className="relative min-w-0 flex-1 basis-0">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (reorderScope === 'subs') {
                                                                handleSubReorderTap(sub.key)
                                                                return
                                                            }
                                                            setSelectedSubKeyByGroup((p) => ({
                                                                ...p,
                                                                [openGroup.key]: sub.key,
                                                            }))
                                                        }}
                                                        className={cn(
                                                            'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-lg px-0.5 py-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:rounded-xl sm:px-1.5 sm:py-2 sm:text-[11px]',
                                                            'bg-transparent border-0 shadow-none',
                                                            isActive
                                                                ? 'text-[#36606F]'
                                                                : 'text-[#36606F]/60 hover:text-[#36606F] active:opacity-80',
                                                            picked && 'bg-amber-100/90'
                                                        )}
                                                    >
                                                        <span className="line-clamp-3 min-w-0">
                                                            {subPickerButtonLabel(
                                                                sub,
                                                                lang,
                                                                openGroup.parentTitleRaw,
                                                                tPublicUi(lang).uncategorized
                                                            )}
                                                        </span>
                                                    </button>
                                                </div>
                                            )
                                        })}
                                    </div>
                                ) : (
                                    <div className="flex w-full min-w-0 flex-nowrap gap-1 overflow-x-auto sm:gap-1.5">
                                        {openGroup._subList.map((sub) => {
                                            const sel = selectedSubKeyByGroup[openGroup.key]
                                            const isActive = sel === sub.key
                                            return (
                                                <div key={sub.key} className="relative min-w-0 flex-1 basis-0">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setSelectedSubKeyByGroup((p) => ({
                                                                ...p,
                                                                [openGroup.key]: sub.key,
                                                            }))
                                                        }
                                                        className={cn(
                                                            'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-lg px-0.5 py-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:rounded-xl sm:px-1.5 sm:py-2 sm:text-[11px]',
                                                            'bg-transparent border-0 shadow-none',
                                                            editMode &&
                                                                onEditChildCategory &&
                                                                isUuidLike(sub.key) &&
                                                                'pr-5 sm:pr-6',
                                                            isActive
                                                                ? 'text-[#36606F]'
                                                                : 'text-[#36606F]/60 hover:text-[#36606F] active:opacity-80'
                                                        )}
                                                    >
                                                        <span className="line-clamp-3 min-w-0">
                                                            {subPickerButtonLabel(
                                                                sub,
                                                                lang,
                                                                openGroup.parentTitleRaw,
                                                                tPublicUi(lang).uncategorized
                                                            )}
                                                        </span>
                                                    </button>
                                                    {editMode && onEditChildCategory && isUuidLike(sub.key) ? (
                                                        <span
                                                            className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-stretch pr-0.5"
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                e.stopPropagation()
                                                            }}
                                                        >
                                                            <button
                                                                type="button"
                                                                onClick={() => onEditChildCategory(sub.key)}
                                                                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#36606F] active:bg-zinc-100 sm:min-h-[44px] sm:min-w-[44px]"
                                                                aria-label="Editar subcategoría"
                                                                title="Editar subcategoría"
                                                            >
                                                                <Pencil className="h-4 w-4" strokeWidth={2.5} />
                                                            </button>
                                                        </span>
                                                    ) : null}
                                                </div>
                                            )
                                        })}
                                    </div>
                                )}
                            </div>
                        ) : null}

                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-2.5 pb-4 pt-2 custom-scrollbar sm:px-3 sm:pb-5 sm:pt-2.5">
                            {openGroup._subList.length > 1 &&
                            !selectedSubKeyByGroup[openGroup.key] &&
                            reorderScope !== 'subs' ? (
                                <div className="px-1 py-2 sm:px-2">
                                    <div className="flex w-full flex-nowrap gap-2 overflow-x-auto pb-0.5">
                                        {openGroup._subList.map((sub) => (
                                            <button
                                                key={sub.key}
                                                type="button"
                                                onClick={() =>
                                                    setSelectedSubKeyByGroup((p) => ({
                                                        ...p,
                                                        [openGroup.key]: sub.key,
                                                    }))
                                                }
                                                className="flex min-h-[48px] min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-xl bg-white px-2 py-2 text-center text-[11px] font-black uppercase leading-tight tracking-wide text-[#36606F] active:bg-zinc-50 sm:min-h-[52px] sm:px-3 sm:text-xs"
                                            >
                                                <span className="line-clamp-3 min-w-0">
                                                    {subPickerButtonLabel(
                                                        sub,
                                                        lang,
                                                        openGroup.parentTitleRaw,
                                                        tPublicUi(lang).uncategorized
                                                    )}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4">
                                    {(openGroup._subList.length > 1
                                        ? openGroup._subList.filter(
                                              (s) => s.key === selectedSubKeyByGroup[openGroup.key]
                                          )
                                        : openGroup._subList
                                    ).map((sub) => (
                                        <section key={sub.key} className="space-y-3">
                                            {reorderScope === 'products' &&
                                            sub.key === activeSubKeyForOpen ? (
                                                <div className="grid grid-cols-3 items-stretch gap-2 md:gap-3">
                                                    {sub.rows.map((row) => {
                                                        const picked =
                                                            reorderPick === String(row.articulo_id)
                                                        return (
                                                            <div
                                                                key={row.articulo_id}
                                                                role="presentation"
                                                                className={cn(
                                                                    'h-full cursor-pointer rounded-2xl transition-colors',
                                                                    picked && 'bg-amber-100/90'
                                                                )}
                                                                onClick={(e) => {
                                                                    if (
                                                                        (e.target as HTMLElement).closest(
                                                                            'button'
                                                                        )
                                                                    ) {
                                                                        return
                                                                    }
                                                                    handleProductReorderTap(row.articulo_id)
                                                                }}
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
                                                                    onReorderTap={handleProductReorderTap}
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 items-stretch gap-2 md:gap-3">
                                                    {mergeEnteroMedioForCartaDisplay(sub.rows).map((row) => (
                                                        <div key={row.articulo_id} className="h-full">
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
                </div>
            ) : null}
        </div>
    )
}
