'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Tarjeta de categoría padre: imagen dominante + título (carta visual). */
export function CartaCategoryCard({
  title,
  coverPhotoUrl,
  onClick,
  className,
  highlighted = false,
  disabled = false,
  ariaExpanded,
  nativeImg = false,
  overlay,
}: {
  title: string
  coverPhotoUrl: string | null
  onClick: () => void
  className?: string
  highlighted?: boolean
  disabled?: boolean
  ariaExpanded?: boolean
  /** URLs arbitrarias desde BD (staff); si no, `next/image`. */
  nativeImg?: boolean
  overlay?: ReactNode
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      {overlay}
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-expanded={ariaExpanded}
        className={cn(
          'flex w-full min-h-[48px] touch-manipulation flex-col items-center px-0.5 pb-1 pt-0.5 transition-opacity active:opacity-85',
          highlighted && 'rounded-2xl bg-amber-50/90',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="relative mx-auto flex aspect-[4/5] w-full items-center justify-center sm:aspect-square">
          {coverPhotoUrl ? (
            nativeImg ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
              <img
                src={coverPhotoUrl}
                alt=""
                className="h-full w-full object-contain object-center p-0.5"
              />
            ) : (
              <Image
                src={coverPhotoUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 45vw, 220px"
                className="object-contain object-center p-0.5"
              />
            )
          ) : (
            <span className="block h-[72%] w-[72%] rounded-2xl bg-zinc-100/90" aria-hidden />
          )}
        </span>
        <span className="mt-2.5 w-full px-0.5 text-center text-[11px] font-black uppercase leading-tight tracking-[0.14em] text-[#36606F] sm:mt-3 sm:text-xs sm:tracking-[0.16em]">
          {title}
        </span>
      </button>
    </div>
  )
}

export function CartaCategoryGrid({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-x-2 gap-y-5 pb-2 sm:gap-x-3 sm:gap-y-7',
        className
      )}
    >
      {children}
    </div>
  )
}
