'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft, Pencil, X } from 'lucide-react'
import { CartaImageLightbox } from '@/components/carta/CartaImageLightbox'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import {
  type CartaLang,
  DEFAULT_CARTA_LANG,
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
  /** Nombre padre en BD (español base) para orden fijo */
  parentTitleRaw: string
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
  backHref,
  cartaEditHref,
}: {
  items: PublicMenuRow[]
  /** Solo usuarios autenticados: destino del botón volver (Inicio). */
  backHref: string | null
  cartaEditHref: string | null
}) {
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [selectedSubKeyByGroup, setSelectedSubKeyByGroup] = useState<Record<string, string>>({})
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
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
        parentTitleRaw,
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
      return a.parentTitleRaw.localeCompare(b.parentTitleRaw, 'es', { sensitivity: 'base' })
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

  const openGroup = useMemo(
    () => (openKey ? grouped.find((g) => g.key === openKey) ?? null : null),
    [grouped, openKey]
  )

  return (
    <main className="h-[100dvh] bg-[#5B8FB9]">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8">
        <header className="shrink-0 pb-2 pt-0">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 gap-y-1">
            <div className="flex min-h-[52px] items-center justify-start">
              {backHref ? (
                <Link
                  href={backHref}
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center text-white transition-opacity hover:opacity-85 active:opacity-70"
                  aria-label="Volver a inicio"
                  title="Volver a inicio"
                >
                  <ChevronLeft className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.5} />
                </Link>
              ) : null}
            </div>

            <div className="flex justify-center px-1">
              <Image
                src="/icons/logo-white.png"
                alt="Bar La Marbella"
                width={260}
                height={70}
                className="h-11 w-auto max-w-[220px] sm:h-14 sm:max-w-[280px] md:h-[4.25rem] md:max-w-[320px]"
                priority
              />
            </div>

            <div className="flex min-h-[52px] items-center justify-end">
              {cartaEditHref ? (
                <Link
                  href={cartaEditHref}
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-white shadow-none outline-none ring-0 transition-opacity hover:opacity-85 active:opacity-70 focus-visible:opacity-100"
                  aria-label="Editar carta"
                  title="Editar carta"
                >
                  <Pencil className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.25} />
                </Link>
              ) : null}
            </div>
          </div>

          <div className="mt-2 w-full px-0 sm:mt-2.5">
            <CartaLangPicker lang={lang} onChange={setLang} tone="onBlue" layout="spread" />
          </div>
        </header>

        <section className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6 sm:mt-5">
          <div className="grid grid-cols-1 gap-2 sm:gap-4">
            {grouped.map((group) => (
              <div
                key={group.key}
                className="overflow-hidden rounded-xl border-2 border-zinc-200/60 bg-white shadow-sm transition-colors duration-150"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubKeyByGroup((p) => {
                      const n = { ...p }
                      delete n[group.key]
                      return n
                    })
                    setOpenKey((prev) => (prev === group.key ? null : group.key))
                  }}
                  className="flex min-h-[52px] w-full shrink-0 items-center justify-center px-3 py-2.5 active:bg-zinc-50 sm:px-4"
                  aria-expanded={openKey === group.key}
                >
                  <span className="flex min-w-0 max-w-full items-center justify-center gap-2 sm:gap-3">
                    {group.coverPhotoUrl ? (
                      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-white sm:h-11 sm:w-11">
                        <Image
                          src={group.coverPhotoUrl}
                          alt=""
                          fill
                          sizes="40px"
                          className="object-contain object-center"
                        />
                      </span>
                    ) : null}
                    <span className="min-w-0 max-w-[85%] text-center text-[11px] font-black uppercase leading-tight tracking-widest text-[#36606F] sm:max-w-none sm:text-sm">
                      {group.title}
                    </span>
                  </span>
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>

      {openGroup ? (
        <div
          className="fixed inset-0 z-[240] flex items-center justify-center p-4 pb-safe pt-4 animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-labelledby="carta-section-modal-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-[#1e3a45]/55 backdrop-blur-md transition-opacity"
            aria-label="Cerrar"
            onClick={() => setOpenKey(null)}
          />
          {/* Misma idea que modal recetas staff: altura tope fija, cabecera fija, solo el cuerpo hace scroll */}
          <div
            className="relative z-10 flex w-full max-w-lg max-h-[90vh] flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl min-h-0 sm:max-w-xl animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 bg-white px-3 py-2 sm:gap-3 sm:px-3.5 sm:py-2.5">
              <h2
                id="carta-section-modal-title"
                className="min-w-0 flex-1 text-left text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm"
              >
                {openGroup.title}
              </h2>
              <button
                type="button"
                className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
                aria-label="Cerrar"
                onClick={() => setOpenKey(null)}
              >
                <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
              </button>
            </div>

            {openGroup._subList.length > 1 ? (
              <div className="shrink-0 bg-white px-2.5 pb-2.5 pt-2 sm:px-3">
                <div className="flex w-full min-w-0 gap-1 sm:gap-1.5">
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
                          'flex min-h-[48px] min-w-0 flex-1 basis-0 flex-col items-center justify-center rounded-lg border px-0.5 py-1.5 text-center text-[10px] font-black uppercase leading-tight tracking-wide sm:rounded-xl sm:px-1.5 sm:py-2 sm:text-[11px]',
                          isActive
                            ? 'border-[#36606F] bg-white text-[#36606F]'
                            : 'border-zinc-200/80 bg-white text-[#36606F] shadow-sm active:bg-zinc-50'
                        )}
                      >
                        <span className="line-clamp-3 min-w-0">
                          {sub.title.trim() || tPublicUi(lang).uncategorized}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-white px-2.5 pb-4 pt-2 custom-scrollbar sm:px-3 sm:pb-5 sm:pt-2.5">
              {openGroup._subList.length > 1 && !selectedSubKeyByGroup[openGroup.key] ? (
                <p className="py-8 text-center text-sm font-semibold text-zinc-500">
                  {tPublicUi(lang).pickSubcategoryTitle}
                </p>
              ) : (
                <div className="space-y-3 sm:space-y-4">
                  {(openGroup._subList.length > 1
                    ? openGroup._subList.filter((s) => s.key === selectedSubKeyByGroup[openGroup.key])
                    : openGroup._subList
                  ).map((sub) => (
                    <div key={sub.key} className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                        {sub.rows.map((row) => (
                          <div
                            key={row.articulo_id}
                            className="flex flex-col items-center overflow-hidden rounded-2xl bg-white"
                          >
                            <div className="flex w-full flex-col items-center px-1 pb-1.5 pt-1.5 sm:px-1.5 sm:pb-2 sm:pt-2">
                              {row.category_parent_name &&
                              ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name) ? (
                                row.photo_url ? (
                                  <button
                                    type="button"
                                    className="relative mx-auto h-11 w-full max-w-[min(100%,7rem)] shrink-0 cursor-zoom-in touch-manipulation bg-white active:bg-zinc-50 sm:h-12"
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
                                      className="pointer-events-none object-contain object-center p-1.5"
                                    />
                                  </button>
                                ) : (
                                  <div className="relative mx-auto h-11 w-full max-w-[min(100%,7rem)] shrink-0 bg-white sm:h-12">
                                    <div className="h-full w-full bg-white" />
                                  </div>
                                )
                              ) : null}
                              <div
                                className={cn(
                                  'flex w-full min-w-0 flex-col items-center gap-0.5',
                                  row.category_parent_name &&
                                    ['Tapas', 'Bocadillos', 'Platos'].includes(row.category_parent_name)
                                    ? 'mt-1'
                                    : 'mt-0'
                                )}
                              >
                                <p
                                  className="line-clamp-3 w-full max-w-full text-center text-[10px] font-bold leading-tight text-zinc-900 sm:text-[11px]"
                                  title={getCartaDisplayName(row, lang)}
                                >
                                  {getCartaDisplayName(row, lang)}
                                </p>
                                <div className="flex min-h-[44px] w-full shrink-0 items-center justify-center py-0.5">
                                  <span className="text-center text-xs font-black tabular-nums text-[#36606F]">
                                    {formatPrice(row.precio)}
                                  </span>
                                </div>
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
          </div>
        </div>
      ) : null}

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

