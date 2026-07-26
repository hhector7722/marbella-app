import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Info → secondary (azul corporativo). No hay token `info` en MDS;
 * secondary es el acento semántico de información.
 */
const statusVariants = cva(
  'inline-flex h-6 w-fit max-w-full shrink-0 items-center gap-1.5 rounded-md border px-2.5 text-xs font-bold',
  {
    variants: {
      tone: {
        success:
          'border-mds-success/20 bg-mds-success/10 text-mds-success',
        warning:
          'border-mds-warning/20 bg-mds-warning/10 text-mds-warning',
        danger: 'border-mds-danger/20 bg-mds-danger/10 text-mds-danger',
        info: 'border-mds-secondary/25 bg-mds-secondary/10 text-mds-secondary',
        neutral:
          'border-mds-border bg-mds-muted-surface text-mds-muted',
      },
    },
    defaultVariants: {
      tone: 'neutral',
    },
  }
)

type StatusProps = React.ComponentProps<'span'> &
  VariantProps<typeof statusVariants>

function StatusRoot({ className, tone, ...props }: StatusProps) {
  return (
    <span
      data-slot="mds-status"
      data-tone={tone ?? 'neutral'}
      className={cn(statusVariants({ tone }), className)}
      {...props}
    />
  )
}

function Success(props: Omit<StatusProps, 'tone'>) {
  return <StatusRoot tone="success" {...props} />
}

function Warning(props: Omit<StatusProps, 'tone'>) {
  return <StatusRoot tone="warning" {...props} />
}

function Danger(props: Omit<StatusProps, 'tone'>) {
  return <StatusRoot tone="danger" {...props} />
}

function Info(props: Omit<StatusProps, 'tone'>) {
  return <StatusRoot tone="info" {...props} />
}

function Neutral(props: Omit<StatusProps, 'tone'>) {
  return <StatusRoot tone="neutral" {...props} />
}

const Status = Object.assign(StatusRoot, {
  Success,
  Warning,
  Danger,
  Info,
  Neutral,
})

export { Status, statusVariants, Success, Warning, Danger, Info, Neutral }
export type { StatusProps }
