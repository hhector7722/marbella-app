'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
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
  category_parent_cover_photo_url: string | null
  category_child_id: string | null
  category_child_name: string | null
  category_child_sort_order: number | null
}

type Group = {
  key: string
  title: string
  sortOrder: number
  coverPhotoUrl: string | null
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

export function PublicCarta({
  items,
  cartaEditHref,
}: {
  items: PublicMenuRow[]
  cartaEditHref: string | null
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [lang, setLang] = useState<CartaLang>('es')

  const grouped = useMemo(() => {
    const groups = new Map<string, Group>()

    for (const row of items) {
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
        coverPhotoUrl: null as string | null,
        subs: new Map(),
      }
      const cov = row.category_parent_cover_photo_url?.trim()
      if (cov) g.coverPhotoUrl = cov

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
  }, [items, lang])

  return (
    <main className="min-h-screen bg-zinc-100">
      <div className="mx-auto w-full max-w-4xl px-5 pb-12 pt-8 md:px-10 md:pb-16 md:pt-10">
        <header className="grid grid-cols-3 items-center gap-2 pb-2 pt-1">
          <div className="flex shrink-0 justify-start">
            <div className="rounded-lg bg-[#36606F] px-2 py-1.5">
              <Image
                src="/icons/logo-white.png"
                alt="Bar La Marbella"
                width={120}
                height={32}
                className="h-5 w-auto max-w-[110px]"
                priority
              />
            </div>
          </div>

          <CartaLangPicker lang={lang} onChange={setLang} />

          <div className="flex shrink-0 justify-end">
            {cartaEditHref ? (
              <Link
                href={cartaEditHref}
                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-200/60 active:bg-zinc-200"
                aria-label="Editar carta"
                title="Editar carta"
              >
                <Pencil className="h-5 w-5" strokeWidth={2.25} />
              </Link>
            ) : (
              <span className="inline-flex min-h-[48px] min-w-[48px]" aria-hidden />
            )}
          </div>
        </header>

        <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:mt-10">
          {grouped.map((group) => {
            const isOpen = openKey === group.key
            return (
              <div
                key={group.key}
                className={cn(
                  'overflow-hidden rounded-xl border border-zinc-200/60 bg-white/85 shadow-none backdrop-blur-[2px]',
                  isOpen && 'sm:col-span-2'
                )}
              >
                <button
                  type="button"
                  onClick={() =>
                    setOpenKey((current) => (current === group.key ? null : group.key))
                  }
                  className="flex min-h-[52px] w-full items-center justify-center px-3 py-2.5 active:bg-white/60"
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 max-w-full items-center justify-center gap-3">
                    {!isOpen && group.coverPhotoUrl ? (
                    <span className="relative h-11 w-11 shrink-0 overflow-hidden">
                      <Image
                        src={group.coverPhotoUrl}
                        alt=""
                        fill
                        sizes="44px"
                          className="object-contain object-center"
                        />
                      </span>
                    ) : null}
                    <span className="min-w-0 text-center text-sm font-black uppercase tracking-widest text-[#36606F]">
                      {group.title}
                    </span>
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-zinc-200/50 px-3 pb-4 pt-3">
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

                          <div className="grid grid-cols-3 gap-2 sm:gap-3">
                            {sub.rows.map((row) => (
                              <div
                                key={row.articulo_id}
                                className="flex flex-col overflow-hidden rounded-2xl bg-white"
                              >
                                {row.category_parent_name && ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name) ? (
                                  <div className="relative h-16 w-full shrink-0 bg-white">
                                    {row.photo_url ? (
                                      <Image
                                        src={row.photo_url}
                                        alt={getCartaDisplayName(row, lang)}
                                        fill
                                        sizes="(max-width: 640px) 33vw, 20vw"
                                        className="object-contain p-2"
                                      />
                                    ) : (
                                      <div className="h-full w-full bg-white" />
                                    )}
                                  </div>
                                ) : null}
                                <div className="flex min-h-[48px] shrink-0 items-center justify-center px-2 py-1">
                                  <span className="text-center text-xs font-black tabular-nums text-[#36606F]">
                                    {formatPrice(row.precio)}
                                  </span>
                                </div>
                                <div className="flex min-h-[48px] flex-1 items-center justify-center px-2 pb-2 pt-0">
                                  <p
                                    className="line-clamp-3 w-full text-center text-[11px] font-bold leading-snug text-zinc-900"
                                    title={getCartaDisplayName(row, lang)}
                                  >
                                    {getCartaDisplayName(row, lang)}
                                  </p>
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

