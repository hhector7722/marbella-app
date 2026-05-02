'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronDown, Home, Search } from 'lucide-react'
import {
  type CartaLang,
  getCartaDisplayName,
  prettifyChildTitle,
  tPublicUi,
  translateChildCategoryTitle,
  translateParentCategoryTitle,
} from '@/lib/carta-menu-i18n'

export type PublicMenuRow = {
  articulo_id: number
  carta_nombre: string
  carta_nombre_es: string | null
  carta_nombre_ca: string | null
  carta_nombre_en: string | null
  precio: number | string | null
  photo_url: string | null
  sort_order: number | null
  category_parent_id: string | null
  category_parent_name: string | null
  category_parent_sort_order: number | null
  category_child_id: string | null
  category_child_name: string | null
  category_child_sort_order: number | null
}

type Group = {
  key: string
  title: string
  sortOrder: number
  subs: Map<string, { key: string; title: string; sortOrder: number; rows: PublicMenuRow[] }>
}

function formatPrice(precio: PublicMenuRow['precio']) {
  if (precio == null) return ' '
  const n = typeof precio === 'string' ? Number(precio) : precio
  if (!Number.isFinite(n) || n === 0) return ' '
  return `${n.toFixed(2)}€`
}

function subHeading(lang: CartaLang, parentTitleRaw: string, childTitleRaw: string) {
  const childShort = prettifyChildTitle(parentTitleRaw, childTitleRaw)
  return translateChildCategoryTitle(lang, childShort)
}

export function PublicCarta({ items, homeHref }: { items: PublicMenuRow[]; homeHref: string | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<CartaLang>('es')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => getCartaDisplayName(it, lang).toLowerCase().includes(q))
  }, [items, query, lang])

  const grouped = useMemo(() => {
    const groups = new Map<string, Group>()

    for (const row of filtered) {
      const parentTitleRaw = (row.category_parent_name?.trim() || tPublicUi(lang).uncategorized).trim()
      const parentTitle = translateParentCategoryTitle(lang, parentTitleRaw)
      const parentSort = row.category_parent_sort_order ?? 9999
      const parentKey = row.category_parent_id ?? `__no_parent__:${parentTitle}`

      const childTitle = (row.category_child_name?.trim() || '').trim()
      const childSort = row.category_child_sort_order ?? 9999
      const childKey = row.category_child_id ?? `__no_child__:${childTitle}`

      const g = groups.get(parentKey) ?? {
        key: parentKey,
        title: parentTitle,
        sortOrder: parentSort,
        subs: new Map(),
      }

      const sg =
        g.subs.get(childKey) ?? {
          key: childKey,
          title: subHeading(lang, parentTitleRaw, childTitle),
          sortOrder: childSort,
          rows: [] as PublicMenuRow[],
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
      const subList = Array.from(g.subs.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
        return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' })
      })
      for (const s of subList) {
        s.rows.sort(
          (a, b) =>
            (a.sort_order ?? 9999) - (b.sort_order ?? 9999) ||
            getCartaDisplayName(a, lang).localeCompare(getCartaDisplayName(b, lang), 'es', { sensitivity: 'base' })
        )
      }
      ;(g as any)._subList = subList
    }

    return groupList as Array<Group & { _subList: Array<{ key: string; title: string; sortOrder: number; rows: PublicMenuRow[] }> }>
  }, [filtered, lang])

  useEffect(() => {
    if (openKey != null) return
    const initialKey = grouped[0]?.key ?? null
    if (initialKey) setOpenKey(initialKey)
  }, [grouped, openKey])

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-4xl px-4 pb-10 pt-6">
        <header className="space-y-4">
          <div className="flex w-full min-h-12 items-center justify-center gap-1 rounded-2xl border border-zinc-100 bg-white p-1.5 shadow-sm">
            <LangButton active={lang === 'es'} onClick={() => setLang('es')}>
              Español
            </LangButton>
            <LangButton active={lang === 'ca'} onClick={() => setLang('ca')}>
              Català
            </LangButton>
            <LangButton active={lang === 'en'} onClick={() => setLang('en')}>
              English
            </LangButton>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <div className="shrink-0 rounded-xl bg-[#36606F] px-3 py-2">
                  <img
                    src="/icons/logo-white.png"
                    alt="Bar La Marbella"
                    className="h-6 w-auto"
                    loading="eager"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xs font-black uppercase tracking-widest text-[#36606F]">{tPublicUi(lang).title}</h1>
                  <p className="truncate text-[11px] font-semibold text-zinc-500">{tPublicUi(lang).subtitle}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              {homeHref ? (
                <Link
                  href={homeHref}
                  className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-2xl border border-zinc-100 bg-white p-1 shadow-sm text-[#36606F] active:bg-zinc-50"
                  aria-label="Inicio"
                  title="Inicio"
                >
                  <Home className="h-5 w-5" strokeWidth={2.5} />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 shadow-sm">
            <Search className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tPublicUi(lang).search}
              className="h-12 w-full bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {grouped.map((group) => {
            const isOpen = openKey === group.key
            return (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-zinc-100 bg-white shadow-sm">
                <button
                  type="button"
                  onClick={() => setOpenKey((o) => (o === group.key ? null : group.key))}
                  className="flex min-h-[56px] w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-zinc-50"
                  aria-expanded={isOpen}
                >
                  <span className="text-sm font-black uppercase tracking-widest text-[#36606F]">{group.title}</span>
                  <ChevronDown
                    className={cn('h-5 w-5 shrink-0 text-zinc-400 transition-transform', isOpen && 'rotate-180')}
                    aria-hidden
                  />
                </button>

                {isOpen ? (
                  <div className="border-t border-zinc-100 px-3 pb-4 pt-3">
                    <div className="space-y-5">
                      {group._subList.map((sub) => (
                        <div key={sub.key} className="space-y-3">
                          {sub.title ? (
                            <div className="px-1">
                              <div className="text-[11px] font-black uppercase tracking-widest text-zinc-500">
                                {sub.title}
                              </div>
                            </div>
                          ) : null}

                          <div className="grid grid-cols-2 gap-3">
                            {sub.rows.map((row) => (
                              <div
                                key={row.articulo_id}
                                className="flex flex-col overflow-hidden rounded-2xl bg-white"
                              >
                                {row.category_parent_name && ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name) ? (
                                  <div className="relative h-24 w-full bg-white">
                                    {row.photo_url ? (
                                      <Image
                                        src={row.photo_url}
                                        alt={getCartaDisplayName(row, lang)}
                                        fill
                                        sizes="(max-width: 640px) 50vw, 25vw"
                                        className="object-contain p-2"
                                      />
                                    ) : (
                                      <div className="h-full w-full bg-white" />
                                    )}
                                  </div>
                                ) : null}
                                <div className="flex min-h-[56px] items-center justify-between gap-2 px-3 py-2">
                                  <div className="min-w-0 flex-1">
                                    <div
                                      className="truncate text-sm font-extrabold text-zinc-900"
                                      title={getCartaDisplayName(row, lang)}
                                    >
                                      {getCartaDisplayName(row, lang)}
                                    </div>
                                  </div>
                                  <div className="shrink-0 text-sm font-black tabular-nums text-[#36606F]">
                                    {formatPrice(row.precio)}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      </div>
    </main>
  )
}

function LangButton({
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
        'min-h-[48px] flex-1 rounded-xl px-3 text-xs font-black uppercase tracking-widest sm:flex-none sm:px-6',
        active ? 'bg-[#36606F] text-white' : 'bg-transparent text-[#36606F] active:bg-zinc-50'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
