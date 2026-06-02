'use client'

import { splitPlatoMarbellaExploreHint } from '@/lib/carta-menu-i18n'
import { cn } from '@/lib/utils'

export function PlatoMarbellaExploreHint({
  text,
  className,
}: {
  text: string
  className?: string
}) {
  const lines = splitPlatoMarbellaExploreHint(text)

  return (
    <div className={cn('space-y-0.5 text-center', className)}>
      {lines.map((line, i) => (
        <p
          key={i}
          className="text-[11px] font-semibold leading-snug text-zinc-600 sm:text-xs"
        >
          {i === 0 ? `${line}.` : line}
        </p>
      ))}
    </div>
  )
}
