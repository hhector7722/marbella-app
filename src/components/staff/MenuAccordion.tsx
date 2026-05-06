'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { cn } from '@/lib/utils'
import { CheckCircle2, GripVertical, Loader2, Pencil, X } from 'lucide-react'
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
                'flex h-full flex-col items-center overflow-hidden rounded-2xl bg-white',
                editMode && !isActive && 'opacity-75'
            )}
        >
            <div className="flex w-full flex-col items-center px-2 pt-2">
                <div className="relative mx-auto h-14 w-full max-w-[min(100%,8rem)] shrink-0 bg-white sm:h-16">
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
                                className="pointer-events-none h-full w-full max-h-full object-contain object-center p-1.5"
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
                <div className="flex min-h-[44px] w-full shrink-0 items-center justify-center py-0.5">
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
    onPersistParentCategoryOrder?: (orderedParentKeys: string[]) => boolean | Promise<boolean>
    onPersistChildCategoryOrder?: (parentKey: string, orderedChildKeys: string[]) => boolean | Promise<boolean>
    onPersistProductOrder?: (parentKey: string, subKey: string, orderedArticuloIds: number[]) => boolean | Promise<boolean>
}) {
    const [internalLang, setInternalLang] = useState<CartaLang>('es')
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
            const parentTitle = translateParentCategoryTitle(lang, parentTitleRaw)
            const parentSort = row.category_parent_sort_order ?? 9999
            const parentKey = row.category_parent_id ?? `__no_parent__:${parentTitle}`

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
            <div className="rounded-xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
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
        <div className={cn('grid grid-cols-1 gap-2 sm:gap-4', hideLangPicker && 'pt-0')}>
            {displayGrouped.map((group) => {
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
                                : 'border-zinc-200/60'
                        )}
                    >
                        <div className="flex min-h-[52px] w-full items-stretch">
                            {editMode && onPersistParentCategoryOrder && !reorderScope ? (
                                <button
                                    type="button"
                                    className="flex min-h-[52px] w-11 shrink-0 touch-manipulation items-center justify-center border-r border-zinc-100 bg-zinc-50/80 text-[#36606F] active:bg-zinc-100 sm:w-12"
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
                            'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
                            isOpen
                                ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20'
                                : 'border-zinc-200/60',
                            reorderPick === group.key && isUuidLike(group.key) && 'ring-2 ring-amber-500 ring-offset-2 ring-offset-amber-50'
                        )}
                    >
                        <div className="flex min-h-[52px] w-full items-stretch">
                            <button
                                type="button"
                                disabled={!isUuidLike(group.key)}
                                onClick={() => handleParentReorderTap(group.key)}
                                className={cn(
                                    'flex min-h-[52px] min-w-0 flex-1 items-center justify-start gap-2 px-2 py-2.5 text-left active:bg-zinc-50 sm:px-3',
                                    !isUuidLike(group.key) && 'cursor-not-allowed opacity-50'
                                )}
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
                        </div>
                    </div>
                )

                return (
                    <Fragment key={group.key}>
                        {reorderScope === 'parents' ? parentReorderCard : headerCard}
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
                <div className="flex shrink-0 flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
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
                            className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-wide text-zinc-800 min-h-[48px] active:bg-zinc-100"
                            onClick={cancelReorder}
                            disabled={committingReorder}
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            className="inline-flex min-h-[48px] min-w-[140px] items-center justify-center gap-2 rounded-xl border border-[#36606F] bg-[#36606F] px-4 py-2 text-[11px] font-black uppercase tracking-wide text-white active:bg-[#2d4f5c] disabled:opacity-60"
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
                    className="fixed inset-0 z-[250] flex items-end justify-center sm:items-center sm:p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="staff-carta-section-modal-title"
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-[#1e3a45]/55 backdrop-blur-md transition-opacity"
                        aria-label="Cerrar"
                        onClick={() => setOpenKey(null)}
                    />
                    <div className="relative z-10 flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-[1.35rem] bg-white shadow-2xl sm:max-h-[88vh] sm:rounded-2xl">
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3">
                            <h2
                                id="staff-carta-section-modal-title"
                                className="min-w-0 flex-1 text-left text-sm font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-base"
                            >
                                {openGroup.title}
                            </h2>
                            <button
                                type="button"
                                className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                aria-label="Cerrar"
                                onClick={() => setOpenKey(null)}
                            >
                                <X className="h-6 w-6" strokeWidth={2.5} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-5 pt-3 sm:px-4">
                            {editMode &&
                            onPersistChildCategoryOrder &&
                            !reorderScope &&
                            openGroup._subList.length > 1 ? (
                                <div className="mb-2 flex justify-end">
                                    <button
                                        type="button"
                                        className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-wide text-[#36606F] shadow-sm min-h-[44px] active:bg-zinc-50 sm:min-h-[48px]"
                                        onClick={() => {
                                            setReorderPick(null)
                                            setSubKeysDraft(openGroup._subList.map((s) => s.key))
                                            setReorderScope('subs')
                                        }}
                                    >
                                        Reordenar pestañas
                                    </button>
                                </div>
                            ) : null}
                            {openGroup._subList.length > 1 ? (
                                reorderScope === 'subs' ? (
                                    <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                                        {openGroup._subList.map((sub) => {
                                            const sel = selectedSubKeyByGroup[openGroup.key]
                                            const isActive = sel === sub.key
                                            const picked = reorderPick === sub.key && isUuidLike(sub.key)
                                            return (
                                                <div key={sub.key} className="min-w-0 flex-1 basis-0">
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
                                                            'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:px-2 sm:text-[11px]',
                                                            isActive
                                                                ? 'border-[#36606F] bg-white text-[#36606F]'
                                                                : 'border-zinc-200/80 bg-white text-[#36606F] shadow-sm active:bg-zinc-50',
                                                            picked &&
                                                                'ring-2 ring-amber-500 ring-offset-2 ring-offset-amber-50'
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
                                ) : (
                                    <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                                        {openGroup._subList.map((sub) => {
                                            const sel = selectedSubKeyByGroup[openGroup.key]
                                            const isActive = sel === sub.key
                                            return (
                                                <div key={sub.key} className="min-w-0 flex-1 basis-0">
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
                                                        onClick={() => {
                                                            setReorderPick(null)
                                                            setProductIdsDraft(sub.rows.map((r) => r.articulo_id))
                                                            setReorderScope('products')
                                                        }}
                                                    >
                                                        Reordenar platos
                                                    </button>
                                                </div>
                                            ) : null}
                                            {reorderScope === 'products' &&
                                            sub.key === activeSubKeyForOpen ? (
                                                <div className="grid grid-cols-3 items-stretch gap-3 md:gap-4">
                                                    {sub.rows.map((row) => {
                                                        const picked =
                                                            reorderPick === String(row.articulo_id)
                                                        return (
                                                            <div
                                                                key={row.articulo_id}
                                                                role="presentation"
                                                                className={cn(
                                                                    'h-full cursor-pointer rounded-2xl transition-shadow',
                                                                    picked &&
                                                                        'ring-2 ring-amber-500 ring-offset-2 ring-offset-amber-50'
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
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="grid grid-cols-3 items-stretch gap-3 md:gap-4">
                                                    {sub.rows.map((row) => (
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
