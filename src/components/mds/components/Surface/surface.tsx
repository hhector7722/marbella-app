import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const surfaceVariants = cva('rounded-xl text-mds-foreground', {
  variants: {
    variant: {
      default: 'border border-mds-border bg-mds-surface shadow-sm',
      elevated: 'border border-mds-border bg-mds-surface shadow-md',
      outlined: 'border border-mds-border bg-transparent',
      subtle: 'border border-transparent bg-mds-muted-surface',
    },
  },
  defaultVariants: {
    variant: 'default',
  },
})

type SurfaceProps = React.ComponentProps<'div'> &
  VariantProps<typeof surfaceVariants>

/**
 * Contenedor oficial MDS (Bento).
 * Variantes: default | elevated | outlined | subtle.
 */
function Surface({ className, variant, ...props }: SurfaceProps) {
  return (
    <div
      data-slot="mds-surface"
      data-variant={variant ?? 'default'}
      className={cn(surfaceVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Surface, surfaceVariants }
export type { SurfaceProps }
