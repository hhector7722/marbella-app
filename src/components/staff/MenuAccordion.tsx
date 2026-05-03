'use client'

import { useMemo, useState } from 'react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { cn } from '@/lib/utils'
import { CheckCircle2, Loader2, Pencil } from 'lucide-react'
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
    onEditProduct,
    onToggleProductActive,
    productToggleBusyId,
}: {
    row: DigitalMenuRow
    lang: CartaLang
    editMode?: boolean
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
                    editMode && onEditProduct && 'cursor-pointer touch-manipulation active:bg-zinc-50'
                )}
                role={editMode && onEditProduct ? 'button' : undefined}
                tabIndex={editMode && onEditProduct ? 0 : undefined}
                onClick={
                    editMode && onEditProduct
                        ? () => {
                              onEditProduct(row.articulo_id)
                          }
                        : undefined
                }
                onKeyDown={
                    editMode && onEditProduct
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
                s.rows.sort((a, b) =>
                    getCartaDisplayName(a, lang).localeCompare(getCartaDisplayName(b, lang), 'es', {
                        sensitivity: 'base',
                    })
                )
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

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-zinc-500">No hay platos en carta con mapeo TPV todavía.</p>
            </div>
        )
    }

    return (
        <div className={hideLangPicker ? undefined : 'space-y-6'}>
            {!hideLangPicker ? (
                <div className="w-full pt-1">
                    <CartaLangPicker lang={lang} onChange={setLang} />
                </div>
            ) : null}

            <div
                className={cn(
                    'grid grid-cols-2 gap-2 sm:gap-4',
                    hideLangPicker && 'pt-0'
                )}
            >
                {grouped.map((group, idx) => {
                    const isOpen = openKey === group.key
                    return (
                        <div key={group.key} className="contents">
                            <div
                                className={cn(
                                    'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
                                    isOpen
                                        ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20'
                                        : 'border-zinc-200/60'
                                )}
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setOpenKey((current) => {
                                            if (current === group.key) {
                                                setSelectedSubKeyByGroup((p) => {
                                                    const n = { ...p }
                                                    delete n[group.key]
                                                    return n
                                                })
                                                return null
                                            }
                                            setSelectedSubKeyByGroup((p) => {
                                                const n = { ...p }
                                                delete n[group.key]
                                                return n
                                            })
                                            return group.key
                                        })
                                    }}
                                    className="flex min-h-[52px] w-full shrink-0 items-center justify-start gap-2 px-3 py-2.5 text-left active:bg-zinc-50 sm:px-4"
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
                                    {editMode && isUuidLike(group.key) && onEditParentCategory ? (
                                        <span
                                            className="shrink-0"
                                            onClick={(e) => {
                                                e.preventDefault()
                                                e.stopPropagation()
                                            }}
                                        >
                                            <button
                                                type="button"
                                                onClick={() => onEditParentCategory(group.key)}
                                                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                                                aria-label="Editar categoría"
                                                title="Editar categoría"
                                            >
                                                <Pencil className="h-5 w-5" strokeWidth={2.5} />
                                            </button>
                                        </span>
                                    ) : null}
                                </button>
                            </div>

                            {openGroup && insertAfterIndex === idx ? (
                                <div className="col-span-2 overflow-hidden rounded-xl border-2 border-[#36606F] bg-white shadow-md ring-1 ring-[#36606F]/20">
                                    <div className="px-3 pb-3 pt-3">
                                        {openGroup._subList.length > 1 ? (
                                            <div className="mb-3 flex w-full min-w-0 gap-1.5 sm:gap-2">
                                                {openGroup._subList.map((sub) => {
                                                    const sel = selectedSubKeyByGroup[openGroup.key]
                                                    const isActive = sel === sub.key
                                                    return (
                                                        <button
                                                            key={sub.key}
                                                            type="button"
                                                            onClick={() =>
                                                                setSelectedSubKeyByGroup((p) => ({
                                                                    ...p,
                                                                    [openGroup.key]: sub.key,
                                                                }))
                                                            }
                                                            className={cn(
                                                                'flex min-h-[48px] min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-xl border px-1 py-2 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:px-2 sm:text-[11px]',
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
                                                    )
                                                })}
                                            </div>
                                        ) : null}

                                        {openGroup._subList.length > 1 &&
                                        !selectedSubKeyByGroup[openGroup.key] ? null : (
                                            <div className="space-y-5">
                                                {(openGroup._subList.length > 1
                                                    ? openGroup._subList.filter(
                                                          (s) =>
                                                              s.key ===
                                                              selectedSubKeyByGroup[openGroup.key]
                                                      )
                                                    : openGroup._subList
                                                ).map((sub) => (
                                                    <section key={sub.key} className="space-y-3">
                                                        <div className="grid grid-cols-3 items-stretch gap-3 md:gap-4">
                                                            {sub.rows.map((row) => (
                                                                <MenuCard
                                                                    key={row.articulo_id}
                                                                    row={row}
                                                                    lang={lang}
                                                                    editMode={editMode}
                                                                    onEditProduct={onEditProduct}
                                                                    onToggleProductActive={onToggleProductActive}
                                                                    productToggleBusyId={productToggleBusyId}
                                                                />
                                                            ))}
                                                        </div>
                                                    </section>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
