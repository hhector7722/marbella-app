'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Grid del selector inicial de subcategorías: se adapta al número de ítems sin huecos en blanco. */
export function CartaSubcategoryPickerGrid({
  count,
  children,
  className,
}: {
  count: number
  children: ReactNode
  className?: string
}) {
  const n = Math.max(1, count)

  return (
    <div
      className={cn(
        'mx-auto grid w-fit max-w-full justify-items-center gap-2 sm:gap-2.5',
        n === 1 && 'grid-cols-1',
        n === 2 && 'grid-cols-2',
        n === 3 && 'grid-cols-3',
        n >= 4 && 'grid-cols-2 sm:grid-cols-3',
        className
      )}
    >
      {children}
    </div>
  )
}
