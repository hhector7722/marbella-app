import type { LucideIcon } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Text } from '../Typography'

const emptyStateVariants = cva(
  'flex w-full text-mds-foreground',
  {
    variants: {
      variant: {
        default:
          'flex-col items-center justify-center gap-3 rounded-xl border border-mds-border bg-mds-surface px-6 py-12 text-center shadow-sm',
        compact:
          'flex-col items-center justify-center gap-2 rounded-xl border border-mds-border bg-mds-surface px-4 py-6 text-center',
        table:
          'flex-row items-center justify-center gap-3 border-0 bg-transparent px-4 py-8 text-center',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

type EmptyStateProps = {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
} & VariantProps<typeof emptyStateVariants>

/**
 * Empty state único del MDS.
 * Variantes: default | compact | table.
 */
function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  variant,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="mds-empty-state"
      data-variant={variant ?? 'default'}
      role="status"
      className={cn(emptyStateVariants({ variant }), className)}
    >
      {Icon ? (
        <Icon
          className={cn(
            'shrink-0 text-mds-muted',
            variant === 'compact' || variant === 'table'
              ? 'size-5'
              : 'size-8'
          )}
          aria-hidden
        />
      ) : null}
      <div
        className={cn(
          'min-w-0 space-y-1',
          variant === 'table' && 'flex flex-col items-center'
        )}
      >
        <Text
          as="h3"
          variant="title"
          className={cn(
            variant === 'compact' || variant === 'table'
              ? 'text-sm font-bold'
              : 'text-base'
          )}
        >
          {title}
        </Text>
        {description ? (
          <Text variant="body" muted className="max-w-sm text-xs sm:text-sm">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? (
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 pt-1">
          {action}
        </div>
      ) : null}
    </div>
  )
}

export { EmptyState, emptyStateVariants }
export type { EmptyStateProps }
