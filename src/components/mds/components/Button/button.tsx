'use client'

import { Loader2 } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import { cn } from '@/lib/utils'

/**
 * Botón oficial MDS. Envuelve el patrón shadcn (CVA + Slot).
 * Único botón de producto Marbella en vistas V2.
 */
const mdsButtonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-bold transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-mds-primary/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        primary:
          'min-h-12 bg-mds-primary px-4 text-mds-primary-foreground hover:bg-mds-primary/90',
        secondary:
          'min-h-12 bg-mds-secondary px-4 text-mds-secondary-foreground hover:bg-mds-secondary/90',
        ghost:
          'min-h-12 bg-transparent px-4 text-mds-foreground hover:bg-mds-muted-surface',
        outline:
          'min-h-12 border border-mds-border bg-mds-surface px-4 text-mds-foreground hover:bg-mds-muted-surface',
        danger:
          'min-h-12 bg-mds-danger/10 px-4 text-mds-danger hover:bg-mds-danger/20',
        success:
          'min-h-12 bg-mds-success/10 px-4 text-mds-success hover:bg-mds-success/20',
        toolbar:
          'min-h-12 gap-1.5 bg-transparent px-3 text-mds-muted hover:bg-mds-muted-surface hover:text-mds-foreground',
        mobile:
          'min-h-12 w-full bg-mds-primary px-4 text-mds-primary-foreground hover:bg-mds-primary/90',
        icon: 'size-12 min-h-12 min-w-12 bg-transparent p-0 text-mds-foreground hover:bg-mds-muted-surface',
      },
    },
    defaultVariants: {
      variant: 'primary',
    },
  }
)

type MdsButtonVariant = NonNullable<
  VariantProps<typeof mdsButtonVariants>['variant']
>

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof mdsButtonVariants> & {
    asChild?: boolean
    /** Estado de carga. Deshabilita y muestra spinner. */
    loading?: boolean
  }

function Button({
  className,
  variant = 'primary',
  loading = false,
  disabled,
  asChild = false,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  const isDisabled = disabled || loading

  return (
    <Comp
      data-slot="mds-button"
      data-variant={variant ?? 'primary'}
      data-loading={loading || undefined}
      type={asChild ? undefined : type}
      disabled={asChild ? undefined : isDisabled}
      aria-disabled={asChild ? isDisabled : undefined}
      className={cn(mdsButtonVariants({ variant }), className)}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : null}
          {children}
        </>
      )}
    </Comp>
  )
}

export { Button, mdsButtonVariants }
export type { ButtonProps, MdsButtonVariant }
