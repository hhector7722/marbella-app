'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/Surface'
import {
  PAGE_SCREEN_COMPONENT_ID,
  type PageScreenTemplate,
} from '@/lib/design-system'

export type PageScreenProps = {
  title: string
  subtitle?: string
  backHref?: string
  maxWidthClass?: string
  rightSlot?: ReactNode
  showBackButton?: boolean
  /** Si existe, la flecha atrás ejecuta esto en lugar de navegar a `backHref`. */
  onBack?: () => void
  /** Pieza a la izquierda del título (p. ej. avatar). */
  titleLeading?: ReactNode
  compactHeader?: boolean
  fillViewport?: boolean
  footerSlot?: ReactNode
  className?: string
  contentClassName?: string
  /** Clases de layout del host de Surface page (p. ej. month-cal-card). */
  cardClassName?: string
  /** Periodo ← fecha → en la cabecera, cuando la pantalla navega fechas. */
  periodSlot?: ReactNode
  /** Identidad de plantilla T2/T3/T4. Default list. */
  template?: PageScreenTemplate
  children: ReactNode
}

/**
 * Plantilla de pantalla de gestión (T2 listado, T3 detalle, T4 formulario).
 * También exportada como DashboardDetailLayout.
 */
export function PageScreen({
  title,
  subtitle,
  backHref = '/dashboard',
  maxWidthClass = 'max-w-4xl',
  rightSlot,
  showBackButton = true,
  onBack,
  titleLeading,
  compactHeader = false,
  fillViewport = false,
  footerSlot,
  className,
  contentClassName,
  cardClassName,
  periodSlot,
  template = 'list',
  children,
}: PageScreenProps) {
  const router = useRouter()
  const hasFooter = Boolean(footerSlot)

  return (
    <div
      data-component={PAGE_SCREEN_COMPONENT_ID}
      data-template={template}
      data-fill-viewport={fillViewport ? 'true' : undefined}
      className={cn(
        'w-full min-w-0',
        fillViewport ? 'flex flex-col' : null,
        className
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full min-h-0 min-w-0 flex-col',
          maxWidthClass,
          fillViewport ? 'gap-3' : null
        )}
      >
        <Surface
          variant="page"
          instance={`page-${template}`}
          className={cn('flex w-full min-h-0 min-w-0 flex-col overflow-hidden', cardClassName)}
        >
          <div
            data-element="header"
            data-compact={compactHeader ? 'true' : undefined}
            className="flex gap-2 shrink-0"
          >
            <div className={cn('flex min-w-0 items-center gap-2', periodSlot ? 'max-w-[38%] shrink' : 'flex-1')}>
              {showBackButton ? (
                <Button
                  type="button"
                  variant="secondary"
                  instance="pagescreen-volver"
                  onClick={() => (onBack ? onBack() : router.push(backHref))}
                  aria-label="Volver"
                  icon={<ArrowLeft size={20} strokeWidth={2.5} />}
                  className="shrink-0"
                />
              ) : null}
              {titleLeading ? (
                <div data-element="title-leading" className="shrink-0">
                  {titleLeading}
                </div>
              ) : null}
              <div data-element="title-block" className="min-w-0">
                <h1 data-element="title">{title}</h1>
                {subtitle ? <p data-element="subtitle">{subtitle}</p> : null}
              </div>
            </div>
            {periodSlot ? (
              <div data-element="period" className="flex min-w-0 flex-1 items-center justify-center">
                {periodSlot}
              </div>
            ) : null}
            {rightSlot ? (
              <div data-element="actions" className="flex shrink-0 items-center justify-end gap-1">
                {rightSlot}
              </div>
            ) : null}
          </div>
          <div
            data-element="body"
            className={cn('px-3 pb-2 md:px-4 md:pb-3 flex flex-col', contentClassName)}
          >
            {children}
          </div>
        </Surface>

        {hasFooter ? (
          <div data-element="footer" className="w-full shrink-0">
            {footerSlot}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export const DashboardDetailLayout = PageScreen
