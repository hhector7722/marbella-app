'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ChevronLeft, Pencil, RefreshCw, X } from 'lucide-react'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import type { MenuCategoryCatalogEntry } from '@/lib/carta-plato-marbella'
import { platoMarbellaCategoryIdFromCatalog } from '@/lib/carta-plato-marbella'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'
import { Button, PageHeader } from '@/components/mds'

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

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-mds-surface text-mds-foreground">
      <div className="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-5 pb-safe pt-2 md:px-8">
        <PageHeader
          className="sm:items-center"
          title={
            <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-x-2">
              <div className="flex min-h-12 items-center justify-start">
                <Button variant="icon" asChild>
                  <Link
                    href="/staff/dashboard"
                    aria-label="Volver a inicio"
                    title="Volver a inicio"
                  >
                    <ChevronLeft className="size-6" strokeWidth={2.5} aria-hidden />
                  </Link>
                </Button>
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

              <div className="flex min-h-12 items-center justify-end gap-0.5">
                {canOpenMapeo ? (
                  <Button variant="icon" asChild>
                    <Link
                      href="/dashboard/recetas-tpv"
                      aria-label="Ir a mapeo TPV"
                      title="Mapeo TPV"
                    >
                      <RefreshCw className="size-5" strokeWidth={2.25} aria-hidden />
                    </Link>
                  </Button>
                ) : null}
                {canEditMenu ? (
                  <Button
                    type="button"
                    variant="icon"
                    onClick={() => setEditing((v) => !v)}
                    aria-label={editing ? 'Salir de edición' : 'Entrar en edición'}
                    title={editing ? 'Salir de edición' : 'Editar'}
                  >
                    {editing ? (
                      <X className="size-5" strokeWidth={2.5} aria-hidden />
                    ) : (
                      <Pencil className="size-5" strokeWidth={2.5} aria-hidden />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
          }
        />

        <div className="mt-1 w-full translate-y-2 px-0 sm:mt-1.5 sm:translate-y-3">
          <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" compact />
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-mds-surface pb-2 pt-4">
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
