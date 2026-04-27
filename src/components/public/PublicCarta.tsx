'use client'

import { useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronDown, Home, Search } from 'lucide-react'

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

type Lang = 'es' | 'ca' | 'en'

function t(lang: Lang) {
  const dict = {
    es: { title: 'La carta', subtitle: 'Nombre y precio', search: 'Buscar…', uncategorized: 'Sin categoría', lang: 'Idioma' },
    ca: { title: 'La carta', subtitle: 'Nom i preu', search: 'Cercar…', uncategorized: 'Sense categoria', lang: 'Idioma' },
    en: { title: 'Menu', subtitle: 'Name & price', search: 'Search…', uncategorized: 'Uncategorized', lang: 'Language' },
  } as const
  return dict[lang]
}

function translateCategoryTitle(lang: Lang, raw: string) {
  const s = raw.trim()
  const map: Record<string, { es: string; ca: string; en: string }> = {
    Tapas: { es: 'Tapas', ca: 'Tapes', en: 'Tapas' },
    Bocadillos: { es: 'Bocadillos', ca: 'Entrepans', en: 'Sandwiches' },
    Platos: { es: 'Platos', ca: 'Plats', en: 'Main dishes' },
    Bebidas: { es: 'Bebidas', ca: 'Begudes', en: 'Drinks' },
    'Cafetería': { es: 'Cafetería', ca: 'Cafeteria', en: 'Coffee' },
    Snacks: { es: 'Snacks', ca: 'Snacks', en: 'Snacks' },
    Extras: { es: 'Extras', ca: 'Extres', en: 'Extras' },
    General: { es: 'General', ca: 'General', en: 'General' },
  }
  const hit = map[s]
  if (!hit) return s
  return hit[lang]
}

function getDisplayName(row: PublicMenuRow, lang: Lang) {
  if (lang === 'ca') return row.carta_nombre_ca?.trim() || row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
  if (lang === 'en') return row.carta_nombre_en?.trim() || row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
  return row.carta_nombre_es?.trim() || row.carta_nombre?.trim()
}

export function PublicCarta({ items, homeHref }: { items: PublicMenuRow[]; homeHref: string | null }) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [lang, setLang] = useState<Lang>('es')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => getDisplayName(it, lang).toLowerCase().includes(q))
  }, [items, query, lang])

  const grouped = useMemo(() => {
    const groups = new Map<string, Group>()

    for (const row of filtered) {
      const parentTitleRaw = (row.category_parent_name?.trim() || t(lang).uncategorized).trim()
      const parentTitle = translateCategoryTitle(lang, parentTitleRaw)
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
          title: translateCategoryTitle(lang, prettifyChildTitle(parentTitleRaw, childTitle)),
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
            getDisplayName(a, lang).localeCompare(getDisplayName(b, lang), 'es', { sensitivity: 'base' })
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
      <div className="mx-auto w-full max-w-2xl px-4 pb-10 pt-6">
        <header className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="inline-flex items-center gap-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
                <div className="shrink-0 rounded-xl bg-[#36606F] px-3 py-2">
                  {/* El asset puede ser /public/icons/logo-white (con o sin extensión). */}
                  {/* Si no existe, el navegador simplemente no lo mostrará. */}
                  <img
                    src="/icons/logo-white.png"
                    alt="Bar La Marbella"
                    className="h-6 w-auto"
                    loading="eager"
                  />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xs font-black uppercase tracking-widest text-[#36606F]">{t(lang).title}</h1>
                  <p className="truncate text-[11px] font-semibold text-zinc-500">{t(lang).subtitle}</p>
                </div>
              </div>
            </div>
            <div className="shrink-0">
              <div className="inline-flex h-12 items-center gap-1 rounded-2xl border border-zinc-100 bg-white p-1 shadow-sm">
                {homeHref ? (
                  <Link
                    href={homeHref}
                    className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl bg-transparent text-[#36606F] active:bg-zinc-50"
                    aria-label="Inicio"
                    title="Inicio"
                  >
                    <Home className="h-5 w-5" strokeWidth={2.5} />
                  </Link>
                ) : null}
                <LangButton active={lang === 'es'} onClick={() => setLang('es')}>
                  ES
                </LangButton>
                <LangButton active={lang === 'ca'} onClick={() => setLang('ca')}>
                  CA
                </LangButton>
                <LangButton active={lang === 'en'} onClick={() => setLang('en')}>
                  EN
                </LangButton>
              </div>
            </div>
          </div>

          <div className="flex min-h-[48px] items-center gap-2 rounded-2xl border border-zinc-100 bg-white px-4 shadow-sm">
            <Search className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(lang).search}
              className="h-12 w-full bg-transparent text-sm font-semibold text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
            />
          </div>
        </header>

        <section className="mt-6 space-y-2">
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

                          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
                                        alt={getDisplayName(row, lang)}
                                        fill
                                        sizes="(max-width: 768px) 50vw, 33vw"
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
                                      title={getDisplayName(row, lang)}
                                    >
                                      {getDisplayName(row, lang)}
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

function prettifyChildTitle(parentTitle: string, rawChildTitle: string) {
  if (!rawChildTitle) return ''
  const prefix = `${parentTitle} - `
  if (rawChildTitle.startsWith(prefix)) return rawChildTitle.slice(prefix.length).trim()
  return rawChildTitle
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
        'min-h-[48px] min-w-[48px] rounded-xl px-3 text-xs font-black tracking-widest',
        active ? 'bg-[#36606F] text-white' : 'bg-transparent text-[#36606F] active:bg-zinc-50'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}

