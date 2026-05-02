'use client'

import { useMemo, useState } from 'react'
import { ChevronDown } from 'lucide-react'
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
    const priceStr = formatPriceDisplay(row.precio)
    const showPrice = priceStr.trim() !== ''
    const displayName = abbreviateMenuName(getCartaDisplayName(row, lang))

    return (
        <div
            className={cn(
                'flex h-full flex-col overflow-hidden rounded-2xl bg-white'
            )}
        >
            <div className="w-full shrink-0 bg-white">
                <div className="h-28 w-full bg-white sm:h-32">
                    {row.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URLs arbitrarias desde BD
                        <img
                            src={row.photo_url}
                            alt=""
                            className="h-full w-full object-contain p-2"
                        />
                    ) : (
                        <div className="h-full w-full bg-white" />
                    )}
                </div>
            </div>

            <div className="flex min-h-[48px] min-w-0 flex-1 flex-col justify-start p-4">
                <div className="flex items-center justify-between gap-3">
                    <h3
                        className="min-w-0 flex-1 text-left font-black text-zinc-900 leading-none truncate text-[clamp(10px,1.3vw,13px)]"
                        title={getCartaDisplayName(row, lang)}
                    >
                        {displayName}
                    </h3>
                    {showPrice ? (
                        <span className="shrink-0 text-right font-mono font-black text-[#36606F] whitespace-nowrap leading-none text-[clamp(10px,1.2vw,13px)]">
                            {priceStr}
                        </span>
                    ) : (
                        <span className="shrink-0 text-right font-mono font-black text-transparent select-none whitespace-nowrap leading-none text-[clamp(10px,1.2vw,13px)]">
                            00.00€
                        </span>
                    )}
                </div>
            </div>
        </div>
    )
}

function abbreviateMenuName(name: string, maxLen = 26) {
    const cleaned = name.replace(/\s+/g, ' ').trim()
    if (cleaned.length <= maxLen) return cleaned

    const words = cleaned.split(' ')
    let out = ''
    for (const w of words) {
        const next = out ? `${out} ${w}` : w
        if (next.length <= maxLen - 1) {
            out = next
            continue
        }
        break
    }
    if (!out) return cleaned.slice(0, maxLen - 1).trimEnd() + '…'
    if (out.length < cleaned.length) return out.trimEnd() + '…'
    return out
}

export function MenuAccordion({ items }: { items: DigitalMenuRow[] }) {
    const [lang, setLang] = useState<CartaLang>('es')

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

    const [openKey, setOpenKey] = useState<string | null>(() => grouped[0]?.key ?? null)

    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-zinc-100 bg-white p-6 text-center shadow-sm">
                <p className="text-sm font-medium text-zinc-500">No hay platos en carta con mapeo TPV todavía.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            <div className="flex w-full min-h-12 items-center justify-center gap-1 rounded-xl border border-zinc-100 bg-white p-1.5 shadow-sm">
                <LangSeg active={lang === 'es'} onClick={() => setLang('es')}>
                    Español
                </LangSeg>
                <LangSeg active={lang === 'ca'} onClick={() => setLang('ca')}>
                    Català
                </LangSeg>
                <LangSeg active={lang === 'en'} onClick={() => setLang('en')}>
                    English
                </LangSeg>
            </div>

            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {grouped.map((group) => {
                    const isOpen = openKey === group.key
                    return (
                        <div
                            key={group.key}
                            className="overflow-hidden rounded-xl border border-zinc-100 bg-white shadow-sm"
                        >
                            <button
                                type="button"
                                onClick={() => setOpenKey((o) => (o === group.key ? null : group.key))}
                                className="flex min-h-[48px] w-full items-center justify-between gap-3 p-4 text-left active:bg-zinc-50/80"
                                aria-expanded={isOpen}
                            >
                                {!isOpen && group.coverPhotoUrl ? (
                                    // eslint-disable-next-line @next/next/no-img-element -- URL desde Storage/receta
                                    <img
                                        src={group.coverPhotoUrl}
                                        alt=""
                                        className="h-12 w-12 shrink-0 rounded-xl border border-zinc-100 object-cover"
                                    />
                                ) : null}
                                <span className="min-w-0 flex-1 text-sm font-black uppercase tracking-wide text-[#36606F]">
                                    {group.title}
                                </span>
                                <ChevronDown
                                    className={cn(
                                        'h-5 w-5 shrink-0 text-zinc-400 transition-transform',
                                        isOpen && 'rotate-180'
                                    )}
                                    aria-hidden
                                />
                            </button>
                            {isOpen ? (
                                <div className="shrink-0 border-t border-zinc-100 px-3 pb-3 pt-1">
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
                                                <div className="grid grid-cols-2 gap-4 items-stretch">
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

function LangSeg({
    active,
    onClick,
    children,
}: {
    active: boolean
    onClick: () => void
    children: React.ReactNode
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                'min-h-[48px] flex-1 rounded-xl px-3 text-xs font-black uppercase tracking-widest',
                active ? 'bg-[#36606F] text-white' : 'bg-transparent text-[#36606F] active:bg-zinc-50'
            )}
            aria-pressed={active}
        >
            {children}
        </button>
    )
}
