'use client'

import { useState } from 'react'
import Image from 'next/image'
import { CartaLangPicker } from '@/components/carta/CartaLangPicker'
import type { CartaLang } from '@/lib/carta-menu-i18n'
import { MenuAccordion, type DigitalMenuRow } from '@/components/staff/MenuAccordion'
import { StaffCartaEditor } from '@/components/staff/StaffCartaEditor'

export function StaffCartaView({
  items,
  canEditMenu,
}: {
  items: DigitalMenuRow[]
  canEditMenu: boolean
}) {
  const [lang, setLang] = useState<CartaLang>('es')

  return (
    <div className="min-h-screen bg-[#5B8FB9]">
      <div className="mx-auto w-full max-w-2xl px-5 pb-12 pt-8 md:px-8 md:pb-14 md:pt-10">
        <header className="grid grid-cols-3 items-center gap-2 pb-6 pt-1">
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

          <CartaLangPicker lang={lang} onChange={setLang} tone="onBlue" />

          <div className="flex shrink-0 justify-end">
            {canEditMenu ? (
              <StaffCartaEditor canEdit={canEditMenu} />
            ) : (
              <span className="inline-flex min-h-[48px] min-w-[48px]" aria-hidden />
            )}
          </div>
        </header>

        <MenuAccordion
          items={items}
          lang={lang}
          onLangChange={setLang}
          hideLangPicker
        />
      </div>
    </div>
  )
}
