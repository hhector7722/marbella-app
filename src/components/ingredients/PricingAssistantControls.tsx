'use client'

import { type ComponentProps } from 'react'
import { cn } from '@/lib/utils'

export function PricingStepHeader({
  title,
  hint,
  compact,
}: {
  title: string
  hint?: string
  compact?: boolean
}) {
  if (compact) {
    return (
      <div className="space-y-0.5">
        <h3 className="text-xs font-semibold leading-tight text-zinc-900">{title}</h3>
        {hint ? <p className="text-[10px] leading-snug text-zinc-500">{hint}</p> : null}
      </div>
    )
  }

  return (
    <div className="space-y-1.5">
      <h3 className="text-base font-black leading-tight text-zinc-900">{title}</h3>
      {hint ? <p className="text-sm leading-snug text-zinc-600">{hint}</p> : null}
    </div>
  )
}

export function PricingChoiceButton({
  title,
  subtitle,
  selected,
  compact,
  className,
  ...props
}: ComponentProps<'button'> & {
  title: string
  subtitle: string
  selected?: boolean
  compact?: boolean
}) {
  return (
    <button
      type="button"
      className={cn(
        'flex flex-col items-stretch justify-center text-left transition-colors hover:bg-zinc-50 disabled:opacity-50',
        compact
          ? 'min-h-12 gap-0 rounded-lg border border-zinc-200 bg-white px-2 py-1.5'
          : 'min-h-14 gap-0.5 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 shadow-sm',
        selected &&
          (compact
            ? 'border-[#36606F] bg-[#36606F]/5 ring-1 ring-[#36606F]/20'
            : 'border-[#36606F] bg-[#36606F]/5 ring-2 ring-[#36606F]/25 shadow-md'),
        className,
      )}
      {...props}
    >
      <span className={cn(compact ? 'text-xs font-semibold text-zinc-900' : 'text-sm font-black text-zinc-900')}>
        {title}
      </span>
      <span
        className={cn(
          compact
            ? 'text-[10px] font-normal leading-snug text-zinc-500'
            : 'text-[11px] font-semibold leading-snug text-zinc-500',
        )}
      >
        {subtitle}
      </span>
    </button>
  )
}
