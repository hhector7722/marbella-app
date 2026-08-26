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
  compactHeader?: boolean
  fillViewport?: boolean
  footerSlot?: ReactNode
  className?: string
  contentClassName?: string
  /** Clases de layout del host de Surface page (p. ej. month-cal-card). */
  cardClassName?: string
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
  compactHeader = false,
  fillViewport = false,
  footerSlot,
  className,
  contentClassName,
  cardClassName,
  template = 'list',
  children,
}: PageScreenProps) {
  const router = useRouter()
  const hasFooter = Boolean(footerSlot)

  return (
    <div
      data-component={PAGE_SCREEN_COMPONENT_ID}
      data-template={template}
      className={cn(
        fillViewport ? 'flex flex-col overflow-x-hidden' : null,
        className
      )}
    >
      <div
        className={cn(
          'mx-auto flex w-full min-h-0',
          maxWidthClass,
          fillViewport ? 'min-h-0 flex-col gap-3' : null
        )}
      >
        <Surface
          variant="page"
          instance={`page-${template}`}
          className={cn('flex flex-col min-h-0 overflow-hidden', cardClassName)}
        >
          <div
            data-element="header"
            data-compact={compactHeader ? 'true' : undefined}
            className="flex gap-3 shrink-0"
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {showBackButton ? (
                <Button
                  type="button"
                  variant="secondary"
                  instance="pagescreen-volver"
                  onClick={() => router.push(backHref)}
                  aria-label="Volver"
                  icon={<ArrowLeft size={20} strokeWidth={2.5} />}
                  className="shrink-0"
                />
              ) : null}
              <div className="min-w-0">
                <h1 data-element="title">{title}</h1>
                {subtitle ? <p data-element="subtitle">{subtitle}</p> : null}
              </div>
            </div>
            {rightSlot ? (
              <div data-element="actions" className="shrink-0 flex items-center justify-end gap-2">
                {rightSlot}
              </div>
            ) : null}
          </div>
          <div
            data-element="body"
            className={cn('p-4 md:p-6 flex-1 flex flex-col min-h-0', contentClassName)}
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
