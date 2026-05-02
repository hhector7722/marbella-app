'use client'

import { useMemo, useState } from 'react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { cn } from '@/lib/utils'
import {
    type CartaLang,
    getCartaDisplayName,
    prettifyChildTitle,
    translateChildCategoryTitle,
    translateParentCategoryTitle,
} from '@/lib/carta-menu-i18n'

export type DigitalMenuRow = {
    articulo_id: number
    articulo_nombre: string
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

function MenuCard({ row, lang }: { row: DigitalMenuRow; lang: CartaLang }) {
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const priceStr = formatPriceDisplay(row.precio)
    const showPrice = priceStr.trim() !== ''
    const displayName = getCartaDisplayName(row, lang)

    return (
        <div
            className={cn(
                'flex h-full flex-col overflow-hidden rounded-2xl bg-white'
            )}
        >
            <div className="w-full shrink-0 bg-white">
                <div className="h-14 w-full bg-white sm:h-16">
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
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-2 pb-3 pt-1">
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

export function MenuAccordion({
    items,
    lang: controlledLang,
    onLangChange,
    hideLangPicker = false,
}: {
    items: DigitalMenuRow[]
    lang?: CartaLang
    onLangChange?: (next: CartaLang) => void
    hideLangPicker?: boolean
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
                    'grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4',
                    hideLangPicker && 'pt-0'
                )}
            >
                {grouped.map((group) => {
                    const isOpen = openKey === group.key
                    return (
                        <div
                            key={group.key}
                            className={cn(
                                'overflow-hidden rounded-xl border border-zinc-200/60 bg-white shadow-sm',
                                isOpen && 'md:col-span-2'
                            )}
                        >
                            <button
                                type="button"
                                onClick={() =>
                                    setOpenKey((current) => (current === group.key ? null : group.key))
                                }
                                className="flex min-h-[52px] w-full items-center justify-center px-3 py-2.5 active:bg-zinc-50"
                                aria-expanded={isOpen}
                            >
                                <span className="flex min-w-0 max-w-full items-center justify-center gap-3">
                                    {!isOpen && group.coverPhotoUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element -- URL desde Storage/receta
                                        <img
                                            src={group.coverPhotoUrl}
                                            alt=""
                                            className="h-10 w-10 shrink-0 object-contain object-center"
                                        />
                                    ) : null}
                                    <span className="min-w-0 text-center text-sm font-black uppercase tracking-wide text-[#36606F]">
                                        {group.title}
                                    </span>
                                </span>
                            </button>
                            {isOpen ? (
                                <div className="shrink-0 border-t border-zinc-200/50 px-3 pb-3 pt-1">
                                    <div className="max-h-[min(72vh,720px)] overflow-y-auto pr-1 space-y-5">
                                        {group._subList.map((sub) => (
                                            <section key={sub.key} className="space-y-3">
                                                {sub.title ? (
                                                    <div className="px-1">
                                                        <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                                                            {sub.title}
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <div className="grid grid-cols-3 gap-3 md:gap-4 items-stretch">
                                                    {sub.rows.map((row) => (
                                                        <MenuCard key={row.articulo_id} row={row} lang={lang} />
                                                    ))}
                                                </div>
                                            </section>
                                        ))}
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
