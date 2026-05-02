'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
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
  const [selectedSubKeyByGroup, setSelectedSubKeyByGroup] = useState<Record<string, string>>({})
  const [lang, setLang] = useState<CartaLang>('es')
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)

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
    <main className="min-h-screen bg-[#5B8FB9]">
      <div className="mx-auto w-full max-w-2xl px-5 pb-12 pt-8 md:px-8 md:pb-14 md:pt-10">
        <header className="grid grid-cols-3 items-center gap-2 pb-2 pt-1">
          <div className="flex shrink-0 justify-start">
            <Image
              src="/icons/logo-white.png"
              alt="Bar La Marbella"
              width={180}
              height={48}
              className="h-8 w-auto max-w-[160px] sm:h-9 sm:max-w-[180px]"
              priority
            />
          </div>

          <CartaLangPicker lang={lang} onChange={setLang} tone="onBlue" />

          <div className="flex shrink-0 justify-end">
            {cartaEditHref ? (
              <Link
                href={cartaEditHref}
                className="inline-flex min-h-[48px] min-w-[48px] items-center justify-center text-white transition-opacity hover:opacity-85 active:opacity-70"
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

        <section className="mt-8 grid grid-cols-2 gap-2 sm:gap-4 md:mt-10">
          {grouped.map((group) => {
            const isOpen = openKey === group.key
            return (
              <div
                key={group.key}
                className={cn(
                  'overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-[border-color,box-shadow] duration-150',
                  isOpen
                    ? 'border-[#36606F] shadow-md ring-1 ring-[#36606F]/20 sm:col-span-2'
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
                  className="flex min-h-[52px] w-full shrink-0 items-center justify-start gap-3 px-4 py-2.5 active:bg-zinc-50"
                  aria-expanded={isOpen}
                >
                  <span className="flex min-w-0 flex-1 items-center justify-start gap-3">
                    {group.coverPhotoUrl ? (
                      <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white">
                        <Image
                          src={group.coverPhotoUrl}
                          alt=""
                          fill
                          sizes="44px"
                          className="object-contain object-center"
                        />
                      </span>
                    ) : null}
                    <span className="min-w-0 text-left text-sm font-black uppercase tracking-widest text-[#36606F]">
                      {group.title}
                    </span>
                  </span>
                </button>

                {isOpen ? (
                  <div className="border-t border-zinc-200/40 bg-white px-3 pb-4 pt-3">
                    {group._subList.length > 1 && !selectedSubKeyByGroup[group.key] ? (
                      <div className="space-y-3">
                        <p className="px-1 text-center text-[11px] font-black uppercase tracking-widest text-zinc-500">
                          {tPublicUi(lang).pickSubcategoryTitle}
                        </p>
                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {group._subList.map((sub) => (
                            <button
                              key={sub.key}
                              type="button"
                              onClick={() =>
                                setSelectedSubKeyByGroup((p) => ({ ...p, [group.key]: sub.key }))
                              }
                              className="flex min-h-[48px] shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-white px-4 py-3 text-center text-sm font-black uppercase tracking-wide text-[#36606F] shadow-sm active:bg-zinc-50"
                            >
                              {sub.title.trim() || tPublicUi(lang).uncategorized}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {group._subList.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setSelectedSubKeyByGroup((p) => {
                                const n = { ...p }
                                delete n[group.key]
                                return n
                              })
                            }
                            className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-black uppercase tracking-widest text-[#36606F] active:bg-zinc-100"
                          >
                            {tPublicUi(lang).backToSubcategories}
                          </button>
                        ) : null}

                        {(group._subList.length > 1
                          ? group._subList.filter((s) => s.key === selectedSubKeyByGroup[group.key])
                          : group._subList
                        ).map((sub) => (
                          <div key={sub.key} className="space-y-3">
                            <div className="grid grid-cols-3 gap-2 sm:gap-3">
                              {sub.rows.map((row) => (
                                <div
                                  key={row.articulo_id}
                                  className="flex flex-col overflow-hidden rounded-2xl bg-white"
                                >
                                  {row.category_parent_name &&
                                  ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name) ? (
                                    row.photo_url ? (
                                      <button
                                        type="button"
                                        className="relative h-12 w-full shrink-0 cursor-zoom-in touch-manipulation bg-white active:bg-zinc-50 sm:h-14"
                                        aria-label="Ver foto ampliada"
                                        onClick={() =>
                                          setLightbox({
                                            src: row.photo_url!,
                                            alt: getCartaDisplayName(row, lang),
                                          })
                                        }
                                      >
                                        <Image
                                          src={row.photo_url}
                                          alt=""
                                          fill
                                          sizes="(max-width: 640px) 33vw, 20vw"
                                          className="pointer-events-none object-contain p-1.5"
                                        />
                                      </button>
                                    ) : (
                                      <div className="relative h-12 w-full shrink-0 bg-white sm:h-14">
                                        <div className="h-full w-full bg-white" />
                                      </div>
                                    )
                                  ) : null}
                                  <div
                                    className={cn(
                                      'flex min-h-0 flex-1 flex-col gap-0.5 px-2 pb-2',
                                      row.category_parent_name &&
                                        ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name)
                                        ? 'pt-1'
                                        : 'pt-2'
                                    )}
                                  >
                                    <p
                                      className="line-clamp-3 w-full text-center text-[11px] font-bold leading-tight text-zinc-900"
                                      title={getCartaDisplayName(row, lang)}
                                    >
                                      {getCartaDisplayName(row, lang)}
                                    </p>
                                    <div className="flex min-h-[44px] shrink-0 items-center justify-center py-0.5">
                                      <span className="text-center text-xs font-black tabular-nums text-[#36606F]">
                                        {formatPrice(row.precio)}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            )
          })}
        </section>
      </div>

      <CartaImageLightbox
        src={lightbox?.src ?? null}
        alt={lightbox?.alt ?? ''}
        title={lightbox?.alt ?? ''}
        open={lightbox != null}
        onClose={() => setLightbox(null)}
      />
    </main>
  )
}

