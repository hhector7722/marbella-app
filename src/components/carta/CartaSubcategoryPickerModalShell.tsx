'use client'

import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Modal compacto: solo selector de subcategorías (Bocadillos, Bebidas, etc.). */
export function CartaSubcategoryPickerModalShell({
  title,
  onClose,
  children,
  className,
}: {
  title: string
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'relative z-10 flex w-fit max-w-[min(100%,22rem)] flex-col overflow-hidden rounded-[22px] bg-white animate-in zoom-in-95 duration-200 sm:max-w-[24rem]',
        className
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2 sm:px-3.5">
        <h2
          id="carta-sub-picker-modal-title"
          className="min-w-0 text-xs font-black uppercase leading-tight tracking-wide text-[#36606F] sm:text-sm"
        >
          {title}
        </h2>
        <button
          type="button"
          className="inline-flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] active:bg-zinc-100"
          aria-label="Cerrar"
          onClick={onClose}
        >
          <X className="h-5 w-5 sm:h-6 sm:w-6" strokeWidth={2.5} />
        </button>
      </div>
      {children}
    </div>
  )
}
