'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import { DEFAULT_CARTA_LANG, type CartaLang } from '@/lib/carta-menu-i18n'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import Link from 'next/link'
import { ChevronLeft, Pencil, RefreshCw, X } from 'lucide-react'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'

export function StaffCartaView({
  items,
  canEditMenu,
  canOpenMapeo,
}: {
  items: DigitalMenuRow[]
  canEditMenu: boolean
  /** Manager/admin: acceso al mapeo TPV en dashboard */
  canOpenMapeo?: boolean
}) {
  const [lang, setLang] = useState<CartaLang>(DEFAULT_CARTA_LANG)
  const [editing, setEditing] = useState(false)

  return (
    <div className="flex h-[100dvh] flex-col bg-white text-zinc-900">
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col px-5 pb-safe pt-safe md:px-8">
        <header className="shrink-0 border-b border-zinc-100 bg-white pb-3 pt-1 sm:pb-3.5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-x-2">
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
                width={260}
                height={70}
                className="h-11 w-auto max-w-[220px] brightness-0 sm:h-14 sm:max-w-[280px] md:h-[4.25rem] md:max-w-[320px]"
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

          <div className="mt-3 w-full px-0 sm:mt-3.5">
            <CartaLangPicker lang={lang} onChange={setLang} tone="default" layout="spread" />
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto bg-white pb-6">
          {editing && canEditMenu ? (
            <StaffCartaInlineEditor canEdit={canEditMenu} lang={lang} onLangChange={setLang} />
          ) : (
            <MenuAccordion items={items} lang={lang} onLangChange={setLang} hideLangPicker />
          )}
        </div>
      </div>
    </div>
  )
}
