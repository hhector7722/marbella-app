'use client'

import { type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function PricingStepHeader({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="space-y-1.5">
      <h3 className="text-base font-black leading-tight text-zinc-900">{title}</h3>
      <p className="text-sm leading-snug text-zinc-600">{hint}</p>
    </div>
  )
}

export function PricingChoiceButton({
  title,
  subtitle,
  selected,
  className,
  ...props
}: ComponentProps<'button'> & { title: string; subtitle: string; selected?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        'flex min-h-14 flex-col items-stretch justify-center gap-0.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50',
        selected && 'border-[#36606F] bg-[#36606F]/5 ring-2 ring-[#36606F]/25 shadow-md',
        className,
      )}
      {...props}
    >
      <span className="text-sm font-black text-zinc-900">{title}</span>
      <span className="text-[11px] font-semibold leading-snug text-zinc-500">{subtitle}</span>
    </button>
  )
}
