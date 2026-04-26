'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DashboardDetailLayout({
  title,
  subtitle,
  backHref = '/dashboard',
  maxWidthClass = 'max-w-4xl',
  rightSlot,
  showBackButton = true,
  className,
  children,
}: {
  title: string
  subtitle?: string
  backHref?: string
  maxWidthClass?: string
  rightSlot?: ReactNode
  showBackButton?: boolean
  /** Clases extra para el contenedor exterior (p. ej. padding superior adicional). */
  className?: string
  children: ReactNode
}) {
  const router = useRouter()

  return (
    <div className={cn('min-h-screen bg-[#3E6A8A] p-4 md:p-6 pb-24', className)}>
      <div className={cn('mx-auto w-full', maxWidthClass)}>
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col min-h-[85vh]">
          <div className="bg-[#36606F] px-4 md:px-8 py-4 md:py-5 flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showBackButton ? (
                <button
                  type="button"
                  onClick={() => router.push(backHref)}
                  className="p-2 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center shrink-0"
                  aria-label="Volver"
                >
                  <ArrowLeft size={20} strokeWidth={2.5} />
                </button>
              ) : null}
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider truncate">
                  {title}
                </h1>
                {subtitle ? (
                  <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider mt-1 line-clamp-2">
                    {subtitle}
                  </p>
                ) : null}
              </div>
            </div>
            {rightSlot ? (
              <div className="shrink-0 flex items-center justify-end gap-2">{rightSlot}</div>
            ) : null}
          </div>
          <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0 overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  )
}
