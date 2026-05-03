'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import { Pencil, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { StaffCartaInlineEditor } from '@/components/staff/StaffCartaInlineEditor'

export function StaffCartaView({
  items,
  canEditMenu,
}: {
  items: DigitalMenuRow[]
  canEditMenu: boolean
}) {
  const [lang, setLang] = useState<CartaLang>('es')
  const [editing, setEditing] = useState(false)

  return (
    <div className="min-h-screen bg-[#5B8FB9]">
      <div className="mx-auto w-full max-w-2xl px-5 pb-12 pt-8 md:px-8 md:pb-14 md:pt-10">
        <header className="grid grid-cols-3 items-center gap-2 pb-6 pt-1">
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
            {canEditMenu ? (
              <button
                type="button"
                onClick={() => setEditing((v) => !v)}
                className={cn(
                  'inline-flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-white transition-colors',
                  editing ? 'bg-white/15 hover:bg-white/20 active:bg-white/10' : 'bg-white/10 hover:bg-white/15 active:bg-white/10'
                )}
                aria-label={editing ? 'Salir de edición' : 'Entrar en edición'}
                title={editing ? 'Salir de edición' : 'Editar'}
              >
                {editing ? <X className="h-5 w-5" strokeWidth={2.5} /> : <Pencil className="h-5 w-5" strokeWidth={2.5} />}
              </button>
            ) : (
              <span className="inline-flex min-h-[48px] min-w-[48px]" aria-hidden />
            )}
          </div>
        </header>

        {editing && canEditMenu ? (
          <StaffCartaInlineEditor canEdit={canEditMenu} lang={lang} />
        ) : (
          <MenuAccordion items={items} lang={lang} onLangChange={setLang} hideLangPicker />
        )}
      </div>
    </div>
  )
}
