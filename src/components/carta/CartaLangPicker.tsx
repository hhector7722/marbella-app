'use client'

import { cn } from '@/lib/utils'
import type { CartaLang } from '@/lib/carta-menu-i18n'

export function CartaLangPicker({
  lang,
  onChange,
  tone = 'default',
  layout = 'inline',
}: {
  lang: CartaLang
  onChange: (next: CartaLang) => void
  tone?: 'default' | 'onBlue'
  /** inline: compact cluster; spread: tres columnas iguales a todo el ancho */
  layout?: 'inline' | 'spread'
}) {
  const inner = (
    <>
      <LangTextBtn tone={tone} layout={layout} active={lang === 'es'} onClick={() => onChange('es')}>
        Español
      </LangTextBtn>
      <LangTextBtn tone={tone} layout={layout} active={lang === 'ca'} onClick={() => onChange('ca')}>
        Català
      </LangTextBtn>
      <LangTextBtn tone={tone} layout={layout} active={lang === 'en'} onClick={() => onChange('en')}>
        English
      </LangTextBtn>
    </>
  )

  if (layout === 'spread') {
    return (
      <div className="grid w-full min-w-0 grid-cols-3 gap-2 sm:gap-3 md:gap-4 [&>button]:min-w-0">
        {inner}
      </div>
    )
  }

  return <div className="flex min-w-0 items-center justify-center gap-4 sm:gap-6">{inner}</div>
}

function LangTextBtn({
  tone,
  layout,
  active,
  onClick,
  children,
}: {
  tone: 'default' | 'onBlue'
  layout: 'inline' | 'spread'
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
        layout === 'spread' && 'flex w-full items-center justify-center text-center',
        tone === 'onBlue'
          ? active
            ? 'text-white'
            : 'text-white/55'
          : active
            ? 'text-[#36606F]'
            : 'text-zinc-400',
        'border-0 bg-transparent shadow-none outline-none ring-0'
      )}
      aria-pressed={active}
    >
      {children}
    </button>
  )
}
