'use client'

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Surface } from '@/components/ui/Surface'
import { useChromeScroll } from '@/components/chrome/ChromeScrollProvider'
import {
  PAGE_SCREEN_COMPONENT_ID,
  type PageScreenTemplate,
  type PageScreenTitleFace,
  type PageScreenTitleAlign,
  type PageScreenWork,
} from '@/lib/design-system'
import { catalogTitleFont } from '@/lib/fonts/catalog-title'

export type PageScreenProps = {
  title: string
  titleClassName?: string
  titleBlockClassName?: string
  /** `display` = EA Sports 15 en catálogos (Ingredientes, Recetas, Proveedores). */
  titleFace?: PageScreenTitleFace
  /** `center` = título centrado entre volver (izq.) y acciones (der.). */
  titleAlign?: PageScreenTitleAlign
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
  /** Control a la izquierda de la fila del mes (p. ej. Calendario/Tabla en Cierres). El mes sigue centrado. */
  periodStartSlot?: ReactNode
  /** Buscador, CAT/PROV y segmented: cromo sobre el envolvente, no dentro del papel. */
  toolbarSlot?: ReactNode
  /** KPI, gráfico de contexto y acciones rápidas: cromo, no el protagonista. */
  leadSlot?: ReactNode
  /** Identidad de plantilla T2/T3/T4. Default list. */
  template?: PageScreenTemplate
  /** Protagonista: calendario/tabla conservan su pieza blanca; PageScreen no pone una ficha alrededor. */
  work?: PageScreenWork
  children: ReactNode
}

/**
 * Plantilla de pantalla de gestión (T2 listado, T3 detalle, T4 formulario).
 * También exportada como DashboardDetailLayout.
 *
 * Cromo (cabecera, periodo, buscador, KPI) sobre el envolvente.
 * Catálogo y formulario van en Surface page. Calendario y tabla
 * conservan su pieza blanca; PageScreen no añade otra ficha.
 */
export function PageScreen({
  title,
  titleClassName,
  titleBlockClassName,
  titleFace = 'product',
  titleAlign = 'start',
  subtitle,
  backHref = '/dashboard',
  maxWidthClass = 'max-w-4xl lg:max-w-[72rem]',
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
  periodStartSlot,
  toolbarSlot,
  leadSlot,
  template = 'list',
  work = 'catalog',
  children,
}: PageScreenProps) {
  const router = useRouter()
  const hasFooter = Boolean(footerSlot)
  const hasToolbar = Boolean(toolbarSlot)
  const centeredTitle = titleAlign === 'center'
  const toolbarSlotRef = useRef<HTMLDivElement>(null)
  const toolbarBarRef = useRef<HTMLDivElement>(null)
  const [toolbarAway, setToolbarAway] = useState(false)
  const [toolbarHeight, setToolbarHeight] = useState(0)
  const { toolbarPinned } = useChromeScroll()
  const pinToolbar = hasToolbar && toolbarPinned && toolbarAway

  useLayoutEffect(() => {
    const slot = toolbarSlotRef.current
    const bar = toolbarBarRef.current
    if (!hasToolbar || !slot || !bar) {
      setToolbarAway(false)
      setToolbarHeight(0)
      return
    }

    const measure = () => {
      if (bar.dataset.pin === 'true') return
      setToolbarHeight(bar.offsetHeight)
    }
    measure()

    const io = new IntersectionObserver(
      ([entry]) => {
        setToolbarAway(!entry.isIntersecting)
      },
      { threshold: 0 }
    )
    io.observe(slot)

    const ro = new ResizeObserver(measure)
    ro.observe(bar)

    return () => {
      io.disconnect()
      ro.disconnect()
    }
  }, [hasToolbar])

  return (
    <div
      data-component={PAGE_SCREEN_COMPONENT_ID}
      data-template={template}
      data-work={work}
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
          fillViewport ? 'flex-1' : null
        )}
      >
        <div data-element="chrome">
          <div
            data-element="header"
            data-compact={compactHeader ? 'true' : undefined}
            data-title-align={centeredTitle ? 'center' : undefined}
            className={cn(
              'shrink-0 gap-2',
              centeredTitle ? 'relative' : 'flex',
            )}
          >
            <div
              data-element={centeredTitle ? 'header-start' : undefined}
              className={cn(
                'relative flex min-w-0 items-center gap-2',
                centeredTitle
                  ? 'z-[1] shrink-0'
                  : periodSlot
                    ? 'shrink-0'
                    : 'flex-1',
              )}
            >
              {periodStartSlot ? (
                <div data-element="period-start" className="shrink-0">
                  {periodStartSlot}
                </div>
              ) : null}
              {showBackButton ? (
                <Button
                  type="button"
                  variant="secondary"
                  instance="pagescreen-volver"
                  onClick={() => (onBack ? onBack() : router.push(backHref))}
                  aria-label="Volver"
                  icon={<ArrowLeft size={20} strokeWidth={1.75} />}
                  className="shrink-0"
                />
              ) : null}
              {titleLeading ? (
                <div data-element="title-leading" className="shrink-0">
                  {titleLeading}
                </div>
              ) : null}
              {!centeredTitle ? (
                <div data-element="title-block" className={cn('min-w-0', titleBlockClassName)}>
                  <h1
                    data-element="title"
                    data-face={titleFace}
                    className={cn(titleFace === 'display' ? catalogTitleFont.className : null, titleClassName)}
                  >
                    {title}
                  </h1>
                  {subtitle ? <p data-element="subtitle">{subtitle}</p> : null}
                </div>
              ) : null}
            </div>
            {centeredTitle ? (
              <div
                data-element="title-block"
                className={cn('min-w-0 text-center', titleBlockClassName)}
              >
                <h1
                  data-element="title"
                  data-face={titleFace}
                  className={cn(
                    titleFace === 'display' ? catalogTitleFont.className : null,
                    'line-clamp-2 whitespace-normal break-words',
                    titleClassName,
                  )}
                >
                  {title}
                </h1>
                {subtitle ? <p data-element="subtitle">{subtitle}</p> : null}
              </div>
            ) : null}
            {periodSlot ? (
              <div data-element="period" className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center">
                <div className="pointer-events-auto max-w-full">
                  {periodSlot}
                </div>
              </div>
            ) : null}
            {rightSlot ? (
              <div
                data-element="actions"
                className={cn(
                  'relative z-[1] flex shrink-0 items-center justify-end gap-1',
                  centeredTitle ? undefined : 'ml-auto',
                )}
              >
                {rightSlot}
              </div>
            ) : null}
          </div>
          {leadSlot ? (
            <div data-element="lead" className="min-w-0">
              {leadSlot}
            </div>
          ) : null}
          {toolbarSlot ? (
            <div
              ref={toolbarSlotRef}
              data-element="toolbar-slot"
              className="min-w-0"
              style={pinToolbar && toolbarHeight > 0 ? { height: toolbarHeight } : undefined}
            >
              <div
                ref={toolbarBarRef}
                data-element="toolbar"
                data-pin={pinToolbar ? 'true' : undefined}
                className="min-w-0"
              >
                <div className={cn('min-w-0 w-full', pinToolbar ? `mx-auto ${maxWidthClass}` : null)}>
                  {toolbarSlot}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <Surface
          variant="page"
          instance={`page-${template}`}
          className={cn('flex w-full min-h-0 min-w-0 flex-col overflow-hidden', cardClassName)}
        >
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
