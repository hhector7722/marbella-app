'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import { platoMarbellaCategoryIdFromCatalog } from '@/lib/carta-plato-marbella'
import Link from 'next/link'
import { ChevronLeft, Pencil, RefreshCw, X } from 'lucide-react'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'

export function StaffCartaView({
  items,
  menuCategories = [],
  categoryCoverById = {},
  categoryCoverScaleById = {},
  canEditMenu,
  canOpenMapeo,
}: {
  items: DigitalMenuRow[]
  menuCategories?: MenuCategoryCatalogEntry[]
  categoryCoverById?: Record<string, string | null>
  categoryCoverScaleById?: Record<string, 's' | 'm' | 'l'>
  canEditMenu: boolean
  /** Manager/admin: acceso al mapeo TPV en dashboard */
  canOpenMapeo?: boolean
}) {
  const platoMarbellaCategoryId = platoMarbellaCategoryIdFromCatalog(menuCategories)
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
  const [editing, setEditing] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const logoRowRef = useRef<HTMLDivElement>(null)
  const homeGridAnchorRef = useRef<HTMLDivElement>(null)
  const langRowRef = useRef<HTMLDivElement>(null)
  const [langTop, setLangTop] = useState<number | null>(null)

  const recomputeLangTop = useMemo(() => {
    return () => {
      const container = containerRef.current
      const logoRow = logoRowRef.current
      const gridTop = homeGridAnchorRef.current
      const langRow = langRowRef.current
      if (!container || !logoRow || !gridTop || !langRow) return

      const cRect = container.getBoundingClientRect()
      const logoRect = logoRow.getBoundingClientRect()
      const gridRect = gridTop.getBoundingClientRect()
      const langRect = langRow.getBoundingClientRect()

      const mid = (logoRect.bottom + gridRect.top) / 2
      const top = mid - cRect.top - langRect.height / 2
      setLangTop(Math.max(0, top))
    }
  }, [])

  useEffect(() => {
    recomputeLangTop()
    const onResize = () => recomputeLangTop()
    window.addEventListener('resize', onResize)

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => recomputeLangTop()) : null
    if (ro) {
      if (logoRowRef.current) ro.observe(logoRowRef.current)
      if (homeGridAnchorRef.current) ro.observe(homeGridAnchorRef.current)
      if (langRowRef.current) ro.observe(langRowRef.current)
    }

    const t = window.setTimeout(() => recomputeLangTop(), 0)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('resize', onResize)
      ro?.disconnect()
    }
  }, [recomputeLangTop])

  return (
    <div className="flex h-[100dvh] flex-col bg-white text-zinc-900">
      <div
        ref={containerRef}
        className="relative mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8"
      >
        <header className="shrink-0 bg-white pb-1 pt-1">
          <div ref={logoRowRef} className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
            <div className="flex min-h-[52px] items-center justify-start">
              <Link
                href="/staff/dashboard"
                className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center text-[#36606F] transition-colors hover:text-[#2a4a56] active:opacity-80"
                aria-label="Volver a inicio"
                title="Volver a inicio"
              >
                <ChevronLeft className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.5} />
              </Link>
            </div>

            <div className="flex justify-center px-1">
              <Image
                src="/icons/logo-white.png"
                alt="Bar La Marbella"
                width={320}
                height={86}
                className="h-10 w-auto max-w-[220px] sm:h-12 sm:max-w-[260px] md:h-14 md:max-w-[300px]"
                priority
              />
            </div>

            <div className="flex min-h-[52px] items-center justify-end gap-0.5">
              {canOpenMapeo ? (
                <Link
                  href="/dashboard/recetas-tpv"
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[#36606F] shadow-none outline-none ring-0 transition-colors hover:text-[#2a4a56] active:opacity-80"
                  aria-label="Ir a mapeo TPV"
                  title="Mapeo TPV"
                >
                  <RefreshCw className="h-6 w-6 sm:h-7 sm:h-7" strokeWidth={2.25} />
                </Link>
              ) : null}
              {canEditMenu ? (
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-none border-0 bg-transparent p-0 text-[#36606F] shadow-none outline-none ring-0 transition-colors hover:text-[#2a4a56] active:opacity-80"
                  aria-label={editing ? 'Salir de edición' : 'Entrar en edición'}
                  title={editing ? 'Salir de edición' : 'Editar'}
                >
                  {editing ? (
                    <X className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} />
                  ) : (
                    <Pencil className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.5} />
                  )}
                </button>
              ) : null}
            </div>
          </div>

        </header>

        <div
          ref={langRowRef}
          className="absolute left-5 right-5 z-20 md:left-8 md:right-8"
          style={langTop != null ? { top: langTop } : undefined}
        >
          <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" compact />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white pb-2">
          {canEditMenu ? (
            <StaffCartaInlineEditor
              canEdit={canEditMenu}
              globalEditMode={editing}
              homeCompact={!editing}
              lang={lang}
              onLangChange={setLang}
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <MenuAccordion
                items={items}
                lang={lang}
                onLangChange={setLang}
                hideLangPicker
                homeGridAnchorRef={homeGridAnchorRef}
                menuCategories={menuCategories}
                categoryCoverById={categoryCoverById}
                categoryCoverScaleById={categoryCoverScaleById}
                platoMarbellaCategoryId={platoMarbellaCategoryId}
                showEmptyMenuChildCategories
                homeCompact
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
