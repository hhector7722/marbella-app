'use client'

import type { ReactNode } from 'react'
import Image from 'next/image'
import { cn } from '@/lib/utils'

/** Tarjeta de categoría padre: imagen y título equilibrados (carta visual). */
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
          'flex w-full min-h-[48px] touch-manipulation flex-col items-center justify-center px-0.5 py-1 transition-opacity active:opacity-85',
          highlighted && 'rounded-2xl bg-amber-50/90',
          disabled && 'cursor-not-allowed opacity-50'
        )}
      >
        <span className="relative mx-auto flex aspect-[5/4] w-[78%] max-w-[136px] items-center justify-center sm:max-w-[148px] sm:aspect-square sm:w-[76%]">
          {coverPhotoUrl ? (
            nativeImg ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL Storage/receta
              <img
                src={coverPhotoUrl}
                alt=""
                className="h-full w-full object-contain object-center p-1"
              />
            ) : (
              <Image
                src={coverPhotoUrl}
                alt=""
                fill
                sizes="(max-width: 640px) 38vw, 180px"
                className="object-contain object-center p-1"
              />
            )
          ) : (
            <span className="block h-[65%] w-[65%] rounded-xl bg-zinc-100/90" aria-hidden />
          )}
        </span>
        <span className="mt-2 w-full px-0.5 text-center text-xs font-black uppercase leading-snug tracking-[0.12em] text-[#36606F] sm:mt-2.5 sm:text-sm sm:tracking-[0.14em]">
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
        'grid grid-cols-2 gap-x-2 gap-y-4 pb-2 sm:gap-x-3 sm:gap-y-5',
        className
      )}
    >
      {children}
    </div>
  )
}
