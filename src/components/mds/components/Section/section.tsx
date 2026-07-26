import { cn } from '@/lib/utils'
import { Text } from '../Typography'

type SectionProps = {
  title?: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** id accesible para aria-labelledby cuando hay title */
  id?: string
}

/**
 * Bloque de contenido de página. Espaciado consistente MDS.
 */
function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: SectionProps) {
  const titleId = id ? `${id}-title` : undefined

  return (
    <section
      id={id}
      aria-labelledby={title ? titleId : undefined}
      data-slot="mds-section"
      className={cn('flex flex-col gap-4', className)}
    >
      {title || description || actions ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1">
            {title ? (
              <Text
                as="h2"
                id={titleId}
                variant="title"
                className="text-lg"
              >
                {title}
              </Text>
            ) : null}
            {description ? (
              <Text variant="body" muted>
                {description}
              </Text>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">{children}</div>
    </section>
  )
}

export { Section }
export type { SectionProps }
