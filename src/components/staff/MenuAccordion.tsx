'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaCategoryCard, CartaCategoryGrid } from '@/components/carta/CartaCategoryGrid'
import { CartaCoversLoadingGate } from '@/components/carta/CartaCoversLoadingGate'
import {
  collectCartaProductPhotoUrls,
  collectPlatoMarbellaPhotoUrls,
} from '@/lib/carta-modal-images'
import { uniqueCartaCoverUrls } from '@/lib/carta-cover-preload'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { CartaSubcategoryPickerButton } from '@/components/carta/CartaSubcategoryPickerButton'
import { CartaStaffMenuProductCard } from '@/components/carta/CartaStaffMenuProductCard'
import { cn } from '@/lib/utils'
import { ChevronLeft, GripVertical, Loader2, Pencil, X } from 'lucide-react'
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
import { PlatoMarbellaMenuView } from '@/components/carta/PlatoMarbellaMenuView'
import {
    PlatoMarbellaModalScheduleFooter,
    PlatoMarbellaModalSubheader,
} from '@/components/carta/PlatoMarbellaModalChrome'
import { PlatoMarbellaModalHeaderBar } from '@/components/carta/PlatoMarbellaModalHeaderBar'
import { PlatoMarbellaStaffGridView } from '@/components/carta/PlatoMarbellaStaffGridView'
import {
    applyPlatoMarbellaMergeIntoPlatosParentGroup,
    bucketMenuRowForPlatoMarbella,
    formatPlatoMarbellaMenuPrice,
    groupPlatoMarbellaItems,
    platoMarbellaRowsForReorderSection,
    platoMarbellaCategoryIdFromCatalog,
    platoMarbellaSlotsForLang,
    platosParentCategoryIdForPlatoMarbella,
    PLATO_MARBELLA_SLOTS,
    type MenuCategoryCatalogEntry,
    type PlatoMarbellaReorderSection,
    type PlatoMarbellaSlot,
} from '@/lib/carta-plato-marbella'
import { tPlatoMarbellaUi } from '@/lib/carta-menu-i18n'
import {
    type CartaPhotoScale,
    type CartaProductGridRowDensity,
    cartaProductGridRowDensity,
    chunkCartaProductGridRows,
    getCartaProductGridRowFrameStyle,
    isCartaDrinksSection,
} from '@/lib/carta-product-photo'

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
    category_child_slug?: string | null
    plato_marbella_slot?: string | null
    plato_marbella_is_menu_price?: boolean | null
    plato_marbella_hide_name?: boolean | null
    recipe_id: string
    recipe_name: string
    descripcion: string | null
    precio: number | string | null
    /** Par entero/medio fusionado (solo UI): precio del artículo medio. */
    precio_medio_display?: number | string | null
    carta_dual_racion_enabled?: boolean | null
    override_precio_medio?: number | string | null
    carta_racion_entero_es?: string | null
    carta_racion_entero_ca?: string | null
    carta_racion_entero_en?: string | null
    carta_racion_medio_es?: string | null
    carta_racion_medio_ca?: string | null
    carta_racion_medio_en?: string | null
    photo_url: string | null
    carta_photo_scale?: CartaPhotoScale | string | null
    /** `digital_menu_overrides.sort_order` (orden dentro de la subcategoría en carta). */
    sort_order?: number | null
    /** Desde `map_tpv_receta.factor_porcion` vía vista carta. */
    tpv_factor_porcion?: number | null
}

type GroupedSub = {
    key: string
    title: string
    sortOrder: number
    rows: DigitalMenuRow[]
    coverPhotoUrl: string | null
    coverPhotoScale: CartaPhotoScale
}
type GroupedGroup = {
    key: string
    title: string
    /** Nombre padre en BD (español base) para orden fijo */
    parentTitleRaw: string
    sortOrder: number
    coverPhotoUrl: string | null
    coverPhotoScale: CartaPhotoScale
    _subList: GroupedSub[]
    _platoMarbellaBundleRows?: DigitalMenuRow[]
    _platoMarbellaLauncherArticuloId?: number
    _platoMarbellaHostSubKey?: string
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
    platoMarbellaCategoryId,
    onPlatoMarbellaSlotChange,
    platoMarbellaSlotSavingId,
    onPlatoMarbellaHideNameChange,
    platoMarbellaHideNameBusyId,
    menuCategories,
    showEmptyMenuChildCategories = false,
    categoryCoverById = {},
    categoryCoverScaleById = {},
    homeCompact = false,
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
    platoMarbellaCategoryId?: string | null
    onPlatoMarbellaSlotChange?: (
        articuloId: number,
        slot: PlatoMarbellaSlot | null,
        isMenuPrice: boolean
    ) => void | Promise<void>
    platoMarbellaSlotSavingId?: number | null
    onPlatoMarbellaHideNameChange?: (articuloId: number, hideName: boolean) => void | Promise<void>
    platoMarbellaHideNameBusyId?: number | null
    /** Catálogo menu (scope=menu) para pestañas vacías y reagrupar Plato Marbella. */
    menuCategories?: MenuCategoryCatalogEntry[]
    showEmptyMenuChildCategories?: boolean
    categoryCoverById?: Record<string, string | null>
    categoryCoverScaleById?: Record<string, CartaPhotoScale>
    /** Home staff/carta: grid más compacto sin scroll */
    homeCompact?: boolean
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
            coverPhotoScale: CartaPhotoScale
            subs: Map<string, { title: string; sortOrder: number; rows: DigitalMenuRow[] }>
        }

        const catalog = menuCategories ?? []
        const pmCategoryId =
            platoMarbellaCategoryId ?? platoMarbellaCategoryIdFromCatalog(catalog)

        const groups = new Map<string, Group>()
        for (const raw of items) {
            const row = bucketMenuRowForPlatoMarbella(raw, pmCategoryId, catalog)
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
                coverPhotoScale: categoryCoverScaleById[parentKey] ?? 'm',
                subs: new Map(),
            }
            const cov =
                row.category_parent_cover_photo_url?.trim() ||
                categoryCoverById[parentKey]?.trim() ||
                null
            if (cov) g.coverPhotoUrl = cov
            if (categoryCoverScaleById[parentKey]) {
                g.coverPhotoScale = categoryCoverScaleById[parentKey]
            }

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
            if (showEmptyMenuChildCategories && catalog.length) {
                for (const cat of catalog) {
                    if (cat.parent_id !== g.key || g.subs.has(cat.id)) continue
                    if (cat.id === pmCategoryId) continue
                    const childTitleRaw = cat.name.trim()
                    g.subs.set(cat.id, {
                        title: childTitleRaw,
                        sortOrder: cat.sort_order ?? 9999,
                        rows: [],
                    })
                }
            }

            applyPlatoMarbellaMergeIntoPlatosParentGroup(g, pmCategoryId, catalog)

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
                coverPhotoUrl: categoryCoverById[s.key] ?? null,
                coverPhotoScale: categoryCoverScaleById[s.key] ?? 'm',
            }))
        }

        return groupList as unknown as GroupedGroup[]
    }, [
        items,
        lang,
        menuCategories,
        platoMarbellaCategoryId,
        showEmptyMenuChildCategories,
        categoryCoverById,
        categoryCoverScaleById,
    ])

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
    const [platoLightbox, setPlatoLightbox] = useState<{ src: string; alt: string } | null>(null)
    const [platoMarbellaReorderSection, setPlatoMarbellaReorderSection] =
        useState<PlatoMarbellaReorderSection>('entrante')
    const [platoMarbellaDetailOpen, setPlatoMarbellaDetailOpen] = useState(false)
    const [reorderPlatoMarbellaBundle, setReorderPlatoMarbellaBundle] = useState(false)

    const pmCategoryIdResolved =
        platoMarbellaCategoryId ?? platoMarbellaCategoryIdFromCatalog(menuCategories ?? [])

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

    const openHasMultipleSubs = (openGroup?._subList.length ?? 0) > 1
    const openSelectedSubKey = openGroup ? selectedSubKeyByGroup[openGroup.key] : undefined
    const openShowSubPicker =
        openHasMultipleSubs && !openSelectedSubKey && reorderScope !== 'subs'
    const openShowSubTabs =
        openHasMultipleSubs && (Boolean(openSelectedSubKey) || reorderScope === 'subs')

    const homeCategoryCoverUrls = useMemo(
        () => displayGrouped.map((g) => g.coverPhotoUrl),
        [displayGrouped]
    )

    const platoBundleRows = openGroup?._platoMarbellaBundleRows ?? null
    const platoLauncherArticuloId = openGroup?._platoMarbellaLauncherArticuloId
    const hasPlatoMarbellaBundle = (platoBundleRows?.length ?? 0) > 0
    const platoMarbellaGrouped = useMemo(
        () => (platoBundleRows ? groupPlatoMarbellaItems(platoBundleRows) : null),
        [platoBundleRows]
    )
    const platoGridMenuPrice = platoMarbellaGrouped?.menuPrice ?? null
    const platoLauncherTitle = tPlatoMarbellaUi(lang).menuModalTitle
    const platoLauncherPriceLabel =
        platoGridMenuPrice != null ? formatPlatoMarbellaMenuPrice(platoGridMenuPrice) : undefined
    const platosParentId = platosParentCategoryIdForPlatoMarbella(menuCategories ?? [])
    const isOpenPlatosParent = Boolean(openGroup && platosParentId && openGroup.key === platosParentId)

    useEffect(() => {
        if (!openKey) setPlatoMarbellaDetailOpen(false)
    }, [openKey])

    useEffect(() => {
        setPlatoMarbellaDetailOpen(false)
    }, [openSelectedSubKey])

    const openPlatoMarbella = Boolean(
        platoMarbellaDetailOpen && hasPlatoMarbellaBundle && !openShowSubPicker
    )

    const openModalImageUrls = useMemo(() => {
        if (!openGroup) return []
        if (openShowSubPicker) {
            return uniqueCartaCoverUrls(openGroup._subList.map((s) => s.coverPhotoUrl))
        }
        if (openPlatoMarbella && platoBundleRows && platoBundleRows.length > 0) {
            return collectPlatoMarbellaPhotoUrls(platoBundleRows)
        }
        const subs =
            openHasMultipleSubs && openSelectedSubKey
                ? openGroup._subList.filter((s) => s.key === openSelectedSubKey)
                : openGroup._subList
        return collectCartaProductPhotoUrls(subs.flatMap((s) => s.rows))
    }, [
        openGroup,
        openShowSubPicker,
        openPlatoMarbella,
        platoBundleRows,
        openHasMultipleSubs,
        openSelectedSubKey,
    ])

    const openPlatoMenuPrice = useMemo(() => {
        if (!openPlatoMarbella || !platoBundleRows) return null
        return groupPlatoMarbellaItems(platoBundleRows).menuPrice
    }, [openPlatoMarbella, platoBundleRows])

    const showPlatoModalChrome =
        openPlatoMarbella && !openShowSubPicker && reorderScope !== 'products'

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
        setPlatoMarbellaReorderSection('entrante')
        setReorderPlatoMarbellaBundle(false)
    }, [])

    const startSubProductReorder = useCallback((subRows: DigitalMenuRow[]) => {
        setReorderPlatoMarbellaBundle(false)
        setPlatoMarbellaDetailOpen(false)
        setReorderPick(null)
        setProductIdsDraft(subRows.map((r) => r.articulo_id))
        setReorderScope('products')
    }, [])

    const startPlatoMarbellaProductReorder = useCallback(
        (subRows: DigitalMenuRow[], section: PlatoMarbellaReorderSection = 'entrante') => {
            setReorderPlatoMarbellaBundle(true)
            setPlatoMarbellaDetailOpen(true)
            setPlatoMarbellaReorderSection(section)
            setProductIdsDraft(
                platoMarbellaRowsForReorderSection(subRows, section).map((r) => r.articulo_id)
            )
            setReorderPick(null)
            setReorderScope('products')
        },
        []
    )

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
                productIdsDraft &&
                onPersistProductOrder
            ) {
                const subKey = reorderPlatoMarbellaBundle
                    ? pmCategoryIdResolved
                    : activeSubKeyForOpen ?? openGroup?._platoMarbellaHostSubKey ?? null
                if (subKey) {
                    ok = await onPersistProductOrder(openKey, subKey, productIdsDraft)
                }
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
        reorderPlatoMarbellaBundle,
        pmCategoryIdResolved,
        openGroup?._platoMarbellaHostSubKey,
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
        <CartaCoversLoadingGate
            urls={homeCategoryCoverUrls}
            className={cn(
                'w-full',
                hideLangPicker && 'min-h-0 flex-1',
                !hideLangPicker && 'mt-4 sm:mt-5'
            )}
        >
            <CartaCategoryGrid
                compact={homeCompact}
                className={cn(hideLangPicker && 'min-h-0 flex-1 pt-0', !hideLangPicker && 'mt-0')}
            >
            {displayGrouped.map((group) => {
                const isOpen = openKey === group.key

                if (reorderScope === 'parents') {
                    return (
                        <CartaCategoryCard
                            key={group.key}
                            title={group.title}
                            coverPhotoUrl={group.coverPhotoUrl}
                            coverPhotoScale={group.coverPhotoScale}
                            nativeImg
                            highlighted={reorderPick === group.key && isUuidLike(group.key)}
                            disabled={!isUuidLike(group.key)}
                            onClick={() => handleParentReorderTap(group.key)}
                        />
                    )
                }

                return (
                    <div key={group.key} className="flex min-w-0 w-full items-stretch">
                        {editMode && onPersistParentCategoryOrder && !reorderScope ? (
                            <button
                                type="button"
                                className="flex w-10 shrink-0 touch-manipulation items-center justify-center self-stretch bg-zinc-50/80 text-[#36606F] active:bg-zinc-100 sm:w-11"
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
                        <CartaCategoryCard
                            className="min-w-0 flex-1"
                            compact={homeCompact}
                            title={group.title}
                            coverPhotoUrl={group.coverPhotoUrl}
                            coverPhotoScale={group.coverPhotoScale}
                            nativeImg
                            ariaExpanded={isOpen}
                            onClick={() => headerToggle(group.key)}
                            overlay={
                                editMode && isUuidLike(group.key) && onEditParentCategory ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            onEditParentCategory(group.key)
                                        }}
                                        className="absolute right-0 top-0 z-20 flex min-h-[44px] min-w-[44px] items-center justify-center text-[#36606F] active:opacity-70 sm:min-h-[48px] sm:min-w-[48px]"
                                        aria-label="Editar categoría"
                                        title="Editar categoría"
                                    >
                                        <Pencil className="h-5 w-5" strokeWidth={2.5} />
                                    </button>
                                ) : null
                            }
                        />
                    </div>
                )
            })}
            </CartaCategoryGrid>
        </CartaCoversLoadingGate>
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
                    aria-labelledby={
                        openShowSubPicker || openShowSubTabs ? undefined : 'staff-carta-section-modal-title'
                    }
                    aria-label={
                        openShowSubPicker || openShowSubTabs ? openGroup.title : undefined
                    }
                >
                    <button
                        type="button"
                        className="absolute inset-0 bg-zinc-900/30 backdrop-blur-[2px] transition-opacity"
                        aria-label="Cerrar"
                        onClick={() => setOpenKey(null)}
                    />
                    <div
                        className={cn(
                            'relative z-10 flex w-full max-w-lg flex-col overflow-hidden rounded-[22px] bg-white animate-in zoom-in-95 duration-200 sm:max-w-xl',
                            openShowSubPicker
                                ? 'h-auto'
                                : showPlatoModalChrome
                                  ? 'h-[82vh] min-h-0 sm:h-[78vh]'
                                  : 'max-h-[82vh] min-h-0 sm:max-h-[78vh]'
                        )}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {!openShowSubPicker ? (
                        openPlatoMarbella && !openShowSubTabs ? (
                            <PlatoMarbellaModalHeaderBar
                                backLabel={tPlatoMarbellaUi(lang).backToPlatos}
                                onBackToPlatos={() => setPlatoMarbellaDetailOpen(false)}
                                onClose={() => setOpenKey(null)}
                            />
                        ) : (
                        <div
                            className={cn(
                                'flex shrink-0 bg-white px-2 sm:px-3',
                                showPlatoModalChrome && openShowSubTabs
                                    ? 'flex-col gap-0 py-1 sm:py-1.5'
                                    : openShowSubTabs
                                      ? 'flex-col gap-1 py-2 sm:gap-1.5 sm:py-2.5'
                                      : 'items-center gap-1.5 py-2 sm:gap-2 sm:py-2.5'
                            )}
                        >
                            {openShowSubTabs ? (
                                <div className="flex min-w-0 items-center justify-between gap-1.5">
                                    {editMode &&
                                    !reorderScope &&
                                    ((onPersistChildCategoryOrder && openGroup._subList.length > 1) ||
                                        (onPersistProductOrder &&
                                            modalProductSub &&
                                            modalProductSub.rows.length > 0)) ? (
                                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-start gap-1 sm:gap-1.5">
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
                                                <>
                                                    <button
                                                        type="button"
                                                        className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                                        onClick={() =>
                                                            startSubProductReorder(modalProductSub.rows)
                                                        }
                                                    >
                                                        {tPlatoMarbellaUi(lang).staffReorderPlatos}
                                                    </button>
                                                    {hasPlatoMarbellaBundle && platoBundleRows ? (
                                                        <button
                                                            type="button"
                                                            className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                                            onClick={() =>
                                                                startPlatoMarbellaProductReorder(
                                                                    platoBundleRows,
                                                                    'entrante'
                                                                )
                                                            }
                                                        >
                                                            {tPlatoMarbellaUi(lang).staffOrganizeMarbellaMenu}
                                                        </button>
                                                    ) : null}
                                                </>
                                            ) : null}
                                        </div>
                                    ) : (
                                        <span className="min-w-0 flex-1" aria-hidden />
                                    )}
                                    <button
                                        type="button"
                                        className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                        aria-label="Cerrar"
                                        onClick={() => setOpenKey(null)}
                                    >
                                        <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                                    </button>
                                </div>
                            ) : null}
                            {openShowSubTabs ? (
                                <div className="flex min-w-0 overflow-x-auto pb-0.5">
                                    <div className="flex w-full min-w-0 flex-nowrap gap-1 sm:gap-1.5">
                                        {openGroup._subList.map((sub) => {
                                            const isActive = openSelectedSubKey === sub.key
                                            const picked =
                                                reorderScope === 'subs' &&
                                                reorderPick === sub.key &&
                                                isUuidLike(sub.key)
                                            if (reorderScope === 'subs') {
                                                return (
                                                    <div
                                                        key={sub.key}
                                                        className="relative min-w-0 flex-1 basis-0"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() => handleSubReorderTap(sub.key)}
                                                            className={cn(
                                                                'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center rounded-lg px-0.5 py-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:rounded-xl sm:px-1.5 sm:py-2 sm:text-[11px]',
                                                                'border-0 bg-transparent shadow-none',
                                                                isActive
                                                                    ? 'text-[#36606F]'
                                                                    : 'text-[#36606F]/60 active:opacity-80',
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
                                            }
                                            return (
                                                <CartaSubcategoryPickerButton
                                                    key={sub.key}
                                                    variant="label"
                                                    label={subPickerButtonLabel(
                                                        sub,
                                                        lang,
                                                        openGroup.parentTitleRaw,
                                                        tPublicUi(lang).uncategorized
                                                    )}
                                                    isActive={isActive}
                                                    className={
                                                        editMode &&
                                                        onEditChildCategory &&
                                                        isUuidLike(sub.key)
                                                            ? 'pr-5 sm:pr-6'
                                                            : undefined
                                                    }
                                                    onClick={() =>
                                                        setSelectedSubKeyByGroup((p) => ({
                                                            ...p,
                                                            [openGroup.key]: sub.key,
                                                        }))
                                                    }
                                                    overlay={
                                                        editMode &&
                                                        onEditChildCategory &&
                                                        isUuidLike(sub.key) ? (
                                                            <span
                                                                className="absolute right-0 top-1/2 z-10 flex -translate-y-1/2 items-stretch pr-0.5"
                                                                onClick={(e) => {
                                                                    e.preventDefault()
                                                                    e.stopPropagation()
                                                                }}
                                                            >
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        onEditChildCategory(sub.key)
                                                                    }
                                                                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[#36606F] active:bg-zinc-100 sm:min-h-[44px] sm:min-w-[44px]"
                                                                    aria-label="Editar subcategoría"
                                                                    title="Editar subcategoría"
                                                                >
                                                                    <Pencil
                                                                        className="h-4 w-4"
                                                                        strokeWidth={2.5}
                                                                    />
                                                                </button>
                                                            </span>
                                                        ) : null
                                                    }
                                                />
                                            )
                                        })}
                                    </div>
                                </div>
                            ) : openPlatoMarbella ? (
                                <span className="min-w-0 flex-1" aria-hidden />
                            ) : (
                                <h2
                                    id="staff-carta-section-modal-title"
                                    className="min-w-0 flex-1 truncate text-left text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm"
                                >
                                    {openGroup.title}
                                </h2>
                            )}
                            {!openShowSubTabs &&
                            editMode &&
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
                                        <>
                                            <button
                                                type="button"
                                                className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                                onClick={() => startSubProductReorder(modalProductSub.rows)}
                                            >
                                                {tPlatoMarbellaUi(lang).staffReorderPlatos}
                                            </button>
                                            {hasPlatoMarbellaBundle && platoBundleRows ? (
                                                <button
                                                    type="button"
                                                    className="min-h-[48px] shrink-0 border-0 bg-transparent px-2 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] shadow-none outline-none ring-0 active:opacity-70 sm:px-2.5 sm:text-[11px]"
                                                    onClick={() =>
                                                        startPlatoMarbellaProductReorder(
                                                            platoBundleRows,
                                                            'entrante'
                                                        )
                                                    }
                                                >
                                                    {tPlatoMarbellaUi(lang).staffOrganizeMarbellaMenu}
                                                </button>
                                            ) : null}
                                        </>
                                    ) : null}
                                </div>
                            ) : null}
                            {editMode &&
                            isOpenPlatosParent &&
                            hasPlatoMarbellaBundle &&
                            !openPlatoMarbella &&
                            !openShowSubPicker &&
                            !reorderScope ? (
                                <button
                                    type="button"
                                    className="min-h-[48px] shrink-0 rounded-xl border border-[#36606F]/25 bg-[#36606F]/8 px-3 py-1 text-[10px] font-black uppercase leading-tight tracking-wide text-[#36606F] active:bg-[#36606F]/15 sm:text-[11px]"
                                    onClick={() => setPlatoMarbellaDetailOpen(true)}
                                >
                                    {tPlatoMarbellaUi(lang).staffOpenConfig}
                                </button>
                            ) : null}
                            {!openShowSubTabs ? (
                                <button
                                    type="button"
                                    className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                    aria-label="Cerrar"
                                    onClick={() => setOpenKey(null)}
                                >
                                    <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
                                </button>
                            ) : null}
                        </div>
                        )
                        ) : null}

                        {reorderScope === 'subs' || reorderScope === 'products' ? (
                            <div className="shrink-0 bg-amber-50 px-2 py-2 sm:px-3 sm:py-2.5">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="flex min-w-0 items-start gap-2 text-[11px] font-black uppercase leading-snug tracking-wide text-amber-950 sm:items-center">
                                        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 sm:mt-0" aria-hidden />
                                        <span className="min-w-0">
                                            {reorderScope === 'subs'
                                                ? '1) Pulsa la pestaña a mover. 2) Pulsa la posición destino. 3) Guardar orden.'
                                                : reorderPlatoMarbellaBundle
                                                  ? tPlatoMarbellaUi(lang).staffReorderHint
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
                                {reorderScope === 'products' && reorderPlatoMarbellaBundle && platoBundleRows ? (
                                    <div className="mt-2 space-y-1.5 border-t border-amber-200/80 pt-2">
                                        <p className="text-center text-[10px] font-black uppercase tracking-wide text-amber-900">
                                            {tPlatoMarbellaUi(lang).staffReorderPickSection}
                                        </p>
                                        <div className="flex flex-wrap justify-center gap-1">
                                            {PLATO_MARBELLA_SLOTS.map((slot) => (
                                                <button
                                                    key={slot}
                                                    type="button"
                                                    className={cn(
                                                        'min-h-[48px] rounded-lg px-3 text-[10px] font-black uppercase tracking-wide',
                                                        platoMarbellaReorderSection === slot
                                                            ? 'bg-[#36606F] text-white'
                                                            : 'bg-white text-[#36606F] active:bg-zinc-100'
                                                    )}
                                                    onClick={() =>
                                                        startPlatoMarbellaProductReorder(platoBundleRows, slot)
                                                    }
                                                >
                                                    {platoMarbellaSlotsForLang(lang)[slot]}
                                                </button>
                                            ))}
                                            <button
                                                type="button"
                                                className={cn(
                                                    'min-h-[48px] rounded-lg px-3 text-[10px] font-black uppercase tracking-wide',
                                                    platoMarbellaReorderSection === 'unassigned'
                                                        ? 'bg-amber-600 text-white'
                                                        : 'bg-white text-amber-900 active:bg-amber-100'
                                                )}
                                                onClick={() =>
                                                    startPlatoMarbellaProductReorder(
                                                        platoBundleRows,
                                                        'unassigned'
                                                    )
                                                }
                                            >
                                                {tPlatoMarbellaUi(lang).unassigned}
                                            </button>
                                        </div>
                                    </div>
                                ) : null}
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

                        {showPlatoModalChrome && openGroup ? (
                            <PlatoMarbellaModalSubheader
                                subTitle={tPlatoMarbellaUi(lang).menuModalTitle}
                                menuPrice={openPlatoMenuPrice}
                            />
                        ) : null}

                        <CartaCoversLoadingGate
                            urls={openModalImageUrls}
                            className={cn(
                                'bg-white',
                                openShowSubPicker
                                    ? 'min-h-[220px] px-2.5 py-3 sm:px-3 sm:py-4'
                                    : cn(
                                          'flex min-h-[min(50vh,320px)] flex-1 flex-col',
                                          showPlatoModalChrome
                                              ? 'overflow-hidden px-0 pb-0 pt-0 sm:px-0'
                                              : 'overflow-y-auto overscroll-contain px-2.5 pb-4 pt-2 custom-scrollbar sm:px-3 sm:pb-5 sm:pt-2.5'
                                      )
                            )}
                        >
                            {openShowSubPicker ? (
                                    <div className="px-0.5 sm:px-1">
                                        <div className="flex w-full flex-nowrap gap-2 overflow-x-auto pb-0.5">
                                            {openGroup._subList.map((sub) => (
                                                <CartaSubcategoryPickerButton
                                                    key={sub.key}
                                                    variant="grid"
                                                    label={subPickerButtonLabel(
                                                        sub,
                                                        lang,
                                                        openGroup.parentTitleRaw,
                                                        tPublicUi(lang).uncategorized
                                                    )}
                                                    coverPhotoUrl={sub.coverPhotoUrl}
                                                    coverPhotoScale={sub.coverPhotoScale}
                                                    onClick={() =>
                                                        setSelectedSubKeyByGroup((p) => ({
                                                            ...p,
                                                            [openGroup.key]: sub.key,
                                                        }))
                                                    }
                                                />
                                            ))}
                                        </div>
                                    </div>
                            ) : openPlatoMarbella && platoBundleRows ? (
                                <div className="flex min-h-0 flex-1 flex-col">
                                    {reorderScope === 'products' && reorderPlatoMarbellaBundle ? (
                                        <PlatoMarbellaStaffGridView
                                            rows={platoBundleRows}
                                            lang={lang}
                                            launcherArticuloId={platoLauncherArticuloId ?? null}
                                            reorderMode
                                            reorderSection={platoMarbellaReorderSection}
                                            reorderPick={reorderPick}
                                            onReorderTap={handleProductReorderTap}
                                            orderedIds={productIdsDraft}
                                        />
                                    ) : editMode ? (
                                        <PlatoMarbellaStaffGridView
                                            rows={platoBundleRows}
                                            lang={lang}
                                            launcherArticuloId={platoLauncherArticuloId ?? null}
                                            onEditProduct={onEditProduct}
                                            onToggleProductActive={onToggleProductActive}
                                            productToggleBusyId={productToggleBusyId}
                                        />
                                    ) : (
                                        <PlatoMarbellaMenuView
                                            rows={platoBundleRows}
                                            lang={lang}
                                            showUnassigned
                                            launcherArticuloId={platoLauncherArticuloId ?? null}
                                            className="min-h-0 flex-1"
                                            onPhotoClick={(src, alt) =>
                                                setPlatoLightbox({ src, alt })
                                            }
                                        />
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-3 sm:space-y-4">
                                    {(openHasMultipleSubs
                                        ? openGroup._subList.filter((s) => s.key === openSelectedSubKey)
                                        : openGroup._subList
                                    ).map((sub) => (
                                        <section key={sub.key} className="space-y-3">
                                            {reorderScope === 'products' &&
                                            !reorderPlatoMarbellaBundle &&
                                            sub.key ===
                                                (activeSubKeyForOpen ?? openGroup._platoMarbellaHostSubKey) ? (
                                                <div className="flex flex-col gap-y-2 sm:gap-y-2.5">
                                                    {chunkCartaProductGridRows(sub.rows, 3).map((chunk, chunkIdx) => {
                                                        const rowDensity = cartaProductGridRowDensity(chunk)
                                                        const isDrinkRow = isCartaDrinksSection(
                                                            chunk[0]?.category_parent_name
                                                        )
                                                        const rowFrameStyle = getCartaProductGridRowFrameStyle(
                                                            chunk,
                                                            isDrinkRow
                                                        )
                                                        return (
                                                            <div
                                                                key={chunkIdx}
                                                                className={cn(
                                                                    'grid grid-cols-3 items-stretch gap-x-2 md:gap-x-3',
                                                                    rowDensity === 'compact' && 'gap-y-0',
                                                                    rowDensity === 'cozy' && 'gap-y-1',
                                                                    rowDensity === 'normal' && 'gap-y-2.5 md:gap-y-3'
                                                                )}
                                                            >
                                                                {chunk.map((row) => {
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
                                                                <CartaStaffMenuProductCard
                                                                    row={row}
                                                                    lang={lang}
                                                                    editMode={editMode}
                                                                    productReorderMode={
                                                                        reorderScope === 'products' &&
                                                                        !reorderPlatoMarbellaBundle
                                                                    }
                                                                    onEditProduct={onEditProduct}
                                                                    onToggleProductActive={
                                                                        onToggleProductActive
                                                                    }
                                                                    productToggleBusyId={
                                                                        productToggleBusyId
                                                                    }
                                                                    onReorderTap={handleProductReorderTap}
                                                                    rowDensity={rowDensity}
                                                                    photoFrameStyle={rowFrameStyle}
                                                                    isPlatoMarbellaLauncher={
                                                                        platoLauncherArticuloId != null &&
                                                                        row.articulo_id === platoLauncherArticuloId &&
                                                                        hasPlatoMarbellaBundle
                                                                    }
                                                                    onOpenPlatoMarbella={() =>
                                                                        setPlatoMarbellaDetailOpen(true)
                                                                    }
                                                                    platoLauncherTitle={platoLauncherTitle}
                                                                    platoLauncherPriceLabel={platoLauncherPriceLabel}
                                                                />
                                                            </div>
                                                        )
                                                    })}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-y-2 sm:gap-y-2.5">
                                                    {chunkCartaProductGridRows(
                                                        mergeEnteroMedioForCartaDisplay(sub.rows),
                                                        3
                                                    ).map((chunk, chunkIdx) => {
                                                        const rowDensity = cartaProductGridRowDensity(chunk)
                                                        const isDrinkRow = isCartaDrinksSection(
                                                            chunk[0]?.category_parent_name
                                                        )
                                                        const rowFrameStyle = getCartaProductGridRowFrameStyle(
                                                            chunk,
                                                            isDrinkRow
                                                        )
                                                        return (
                                                            <div
                                                                key={chunkIdx}
                                                                className={cn(
                                                                    'grid grid-cols-3 items-stretch gap-x-2 md:gap-x-3',
                                                                    rowDensity === 'compact' && 'gap-y-0',
                                                                    rowDensity === 'cozy' && 'gap-y-1',
                                                                    rowDensity === 'normal' && 'gap-y-2.5 md:gap-y-3'
                                                                )}
                                                            >
                                                                {chunk.map((row) => (
                                                        <div key={row.articulo_id} className="h-full">
                                                            <CartaStaffMenuProductCard
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
                                                                rowDensity={rowDensity}
                                                                photoFrameStyle={rowFrameStyle}
                                                                isPlatoMarbellaLauncher={
                                                                    platoLauncherArticuloId != null &&
                                                                    row.articulo_id === platoLauncherArticuloId &&
                                                                    hasPlatoMarbellaBundle
                                                                }
                                                                onOpenPlatoMarbella={() =>
                                                                    setPlatoMarbellaDetailOpen(true)
                                                                }
                                                                platoLauncherTitle={platoLauncherTitle}
                                                                platoLauncherPriceLabel={platoLauncherPriceLabel}
                                                            />
                                                        </div>
                                                    ))}
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </section>
                                    ))}
                                </div>
                            )}
                        </CartaCoversLoadingGate>
                        {showPlatoModalChrome ? (
                            <PlatoMarbellaModalScheduleFooter lang={lang} />
                        ) : null}
                    </div>
                </div>
            ) : null}

            <CartaImageLightbox
                src={platoLightbox?.src ?? null}
                alt={platoLightbox?.alt ?? ''}
                title={platoLightbox?.alt ?? ''}
                open={platoLightbox != null}
                onClose={() => setPlatoLightbox(null)}
            />
        </div>
    )
}
