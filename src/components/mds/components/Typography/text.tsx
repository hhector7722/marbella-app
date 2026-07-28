import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const textVariants = cva('text-mds-foreground', {
  variants: {
    variant: {
      display:
        'text-3xl font-extrabold tracking-tight md:text-4xl',
      title: 'text-xl font-bold tracking-tight',
      body: 'text-sm font-medium',
      label:
        'text-xs font-bold uppercase tracking-widest text-mds-muted',
      caption:
        'text-[10px] font-semibold uppercase tracking-widest text-mds-muted',
    },
    muted: {
      true: 'text-mds-muted',
      false: '',
    },
  },
  defaultVariants: {
    variant: 'body',
    muted: false,
  },
})

type TextTag = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'label'

type TextProps = Omit<React.ComponentPropsWithoutRef<'p'>, 'className'> &
  VariantProps<typeof textVariants> & {
    as?: TextTag
    className?: string
  }

/**
 * Tipografía MDS alineada a tokens display / title / body / label / caption.
 */
function Text({
  className,
  variant,
  muted,
  as = 'p',
  ...props
}: TextProps) {
  // ElementType evita conflicto de ref entre <p> y <label> en el polimorfismo `as`.
  const Comp = as as React.ElementType

  return (
    <Comp
      data-slot="mds-text"
      data-variant={variant ?? 'body'}
      className={cn(textVariants({ variant, muted }), className)}
      {...props}
    />
  )
}

export { Text, textVariants }
export type { TextProps }
