'use client'

import { CartaMenuCoverPhoto } from '@/components/carta/CartaMenuCoverPhoto'
import { cn } from '@/lib/utils'
import type { CartaPhotoScale } from '@/lib/carta-product-photo'

export function CartaSubcategoryPickerButton({
  label,
  coverPhotoUrl,
  coverPhotoScale = 'm',
  isActive,
  onClick,
  className,
  overlay,
  variant = 'tabs',
}: {
  label: string
  coverPhotoUrl?: string | null
  coverPhotoScale?: CartaPhotoScale | string | null
  isActive?: boolean
  onClick: () => void
  className?: string
  overlay?: React.ReactNode
  /** tabs: barra con imagen; label: solo nombre (pestañas con subcategoría abierta); grid: selector inicial */
  variant?: 'tabs' | 'label' | 'grid'
}) {
  const photo = coverPhotoUrl?.trim() || null
  const showCover = variant === 'grid' || variant === 'tabs'
  return (
    <div
      className={cn(
        'relative min-w-0',
        variant === 'grid' ? 'w-[5.75rem] sm:w-[6.75rem]' : 'flex-1 basis-0',
        className
      )}
    >
      {overlay}
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex min-h-[48px] w-full min-w-0 flex-col items-center justify-center text-center',
          variant === 'grid'
            ? 'rounded-xl bg-white px-1.5 py-1.5 active:bg-zinc-50 sm:px-2 sm:py-2'
            : 'rounded-lg px-0.5 py-1 sm:rounded-xl sm:px-1 sm:py-1.5',
          'border-0 shadow-none',
          (variant === 'tabs' || variant === 'label') &&
            (isActive ? 'text-[#36606F]' : 'text-[#36606F]/60 active:opacity-80'),
          variant === 'grid' && 'text-[#36606F]'
        )}
      >
        {showCover ? (
          <span
            className={cn(
              'relative mx-auto flex shrink-0 items-center justify-center',
              variant === 'grid'
                ? 'mb-1.5 h-16 w-16 sm:mb-2 sm:h-[4.5rem] sm:w-[4.5rem]'
                : 'mb-1 h-12 w-12 sm:mb-1.5 sm:h-14 sm:w-14'
            )}
          >
            {photo ? (
              <CartaMenuCoverPhoto src={photo} scale={coverPhotoScale} />
            ) : (
              <span className="block h-[70%] w-[70%]" aria-hidden />
            )}
          </span>
        ) : null}
        <span
          className={cn(
            'line-clamp-2 min-w-0 font-black uppercase leading-tight tracking-wide',
            variant === 'grid' && 'text-[11px] sm:text-xs',
            variant === 'tabs' && 'text-[9px] sm:text-[10px]',
            variant === 'label' && 'px-1 text-[10px] sm:text-[11px]'
          )}
        >
          {label}
        </span>
      </button>
    </div>
  )
}
