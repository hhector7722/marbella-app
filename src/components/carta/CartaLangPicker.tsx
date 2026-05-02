'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'

export function CartaLangPicker({
  lang,
  onChange,
  tone = 'default',
}: {
  lang: CartaLang
  onChange: (next: CartaLang) => void
  tone?: 'default' | 'onBlue'
}) {
  return (
    <div className="flex min-w-0 items-center justify-center gap-4 sm:gap-6">
      <LangTextBtn tone={tone} active={lang === 'es'} onClick={() => onChange('es')}>
        Español
      </LangTextBtn>
      <LangTextBtn tone={tone} active={lang === 'ca'} onClick={() => onChange('ca')}>
        Català
      </LangTextBtn>
      <LangTextBtn tone={tone} active={lang === 'en'} onClick={() => onChange('en')}>
        English
      </LangTextBtn>
    </div>
  )
}

function LangTextBtn({
  tone,
  active,
  onClick,
  children,
}: {
  tone: 'default' | 'onBlue'
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
        tone === 'onBlue'
          ? active
            ? 'text-white'
            : 'text-white/55'
          : active
            ? 'text-[#36606F]'
            : 'text-zinc-400',
        'bg-transparent shadow-none'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
