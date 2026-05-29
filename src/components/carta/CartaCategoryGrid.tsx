'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CartaMenuCoverPhoto } from '@/components/carta/CartaMenuCoverPhoto'
import { getCartaCoverPhotoScaleFactor, type CartaPhotoScale } from '@/lib/carta-product-photo'

/** Tarjeta de categoría padre: imagen y título equilibrados (carta visual). */
export function CartaCategoryCard({
  title,
  coverPhotoUrl,
  coverPhotoScale = 'm',
  onClick,
  className,
  highlighted = false,
  disabled = false,
  ariaExpanded,
  nativeImg = false,
  overlay,
  compact = false,
}: {
  title: string
  coverPhotoUrl: string | null
  coverPhotoScale?: CartaPhotoScale | string | null
  onClick: () => void
  className?: string
  highlighted?: boolean
  disabled?: boolean
  ariaExpanded?: boolean
  /** URLs arbitrarias desde BD (staff); si no, `next/image`. */
  nativeImg?: boolean
  overlay?: ReactNode
  compact?: boolean
}) {
  const coverScale = getCartaCoverPhotoScaleFactor(coverPhotoScale)
  return (
    <div className={cn('relative min-w-0', className)}>
      {overlay}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={ariaExpanded}
        className={cn(
          'flex w-full min-h-[48px] touch-manipulation flex-col items-center justify-center px-0.5 py-1 transition-opacity active:opacity-85',
          highlighted && 'rounded-2xl bg-amber-50/90',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span
          className={cn(
            'relative mx-auto flex items-center justify-center',
            compact
              ? 'aspect-[5/4] w-[72%] max-w-[120px] sm:max-w-[128px]'
              : 'aspect-[5/4] w-[78%] max-w-[136px] sm:max-w-[148px] sm:aspect-square sm:w-[76%]'
          )}
        >
          {coverPhotoUrl ? (
            nativeImg ? (
              <CartaMenuCoverPhoto src={coverPhotoUrl} scale={coverPhotoScale} className="p-1" />
            ) : (
              <div
                className="relative h-full w-full origin-center"
                style={{ transform: `scale(${coverScale})` }}
              >
                <CartaMenuCoverPhoto src={coverPhotoUrl} scale={coverPhotoScale} className="p-1" />
              </div>
            )
          ) : (
            <span className="block h-[65%] w-[65%]" aria-hidden />
          )}
        </span>
        <span
          className={cn(
            'w-full px-0.5 text-center font-black uppercase leading-snug text-[#36606F]',
            compact
              ? 'mt-1 text-[11px] tracking-[0.1em] sm:text-xs'
              : 'mt-2 text-xs tracking-[0.12em] sm:mt-2.5 sm:text-sm sm:tracking-[0.14em]'
          )}
        >
          {title}
        </span>
      </button>
    </div>
  )
}

export function CartaCategoryGrid({
  className,
  children,
  compact = false,
  layoutClassName,
}: {
  className?: string
  children: ReactNode
  compact?: boolean
  /** Clases de columnas adaptativas (p. ej. desde getCartaCategoryGridLayoutClass). */
  layoutClassName?: string
}) {
  return (
    <div
      className={cn(
        'grid pb-2',
        layoutClassName ?? 'grid-cols-2',
        compact ? 'gap-x-1.5 gap-y-2 sm:gap-x-2 sm:gap-y-3' : 'gap-x-2 gap-y-4 sm:gap-x-3 sm:gap-y-5',
        className
      )}
    >
      {children}
    </div>
  )
}
