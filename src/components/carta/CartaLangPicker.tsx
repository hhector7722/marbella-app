'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'

export function CartaLangPicker({
  lang,
  onChange,
}: {
  lang: CartaLang
  onChange: (next: CartaLang) => void
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-4 sm:gap-6">
      <LangTextBtn active={lang === 'es'} onClick={() => onChange('es')}>
        Español
      </LangTextBtn>
      <LangTextBtn active={lang === 'ca'} onClick={() => onChange('ca')}>
        Català
      </LangTextBtn>
      <LangTextBtn active={lang === 'en'} onClick={() => onChange('en')}>
        English
      </LangTextBtn>
    </div>
  )
}

function LangTextBtn({
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
        'min-h-[48px] px-1 text-xs font-black uppercase tracking-widest sm:text-sm',
        active ? 'text-[#36606F]' : 'text-zinc-400',
        'bg-transparent shadow-none'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
