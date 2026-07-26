import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  XCircle,
} from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
import { Text } from '../Typography'

const toneVariants = cva('border', {
  variants: {
    tone: {
      success: 'border-mds-success/25 bg-mds-success/10 text-mds-success',
      warning: 'border-mds-warning/25 bg-mds-warning/10 text-mds-warning',
      danger: 'border-mds-danger/25 bg-mds-danger/10 text-mds-danger',
      info: 'border-mds-secondary/25 bg-mds-secondary/10 text-mds-secondary',
      neutral: 'border-mds-border bg-mds-muted-surface text-mds-muted',
    },
  },
  defaultVariants: {
    tone: 'info',
  },
})

type NotificationTone = NonNullable<VariantProps<typeof toneVariants>['tone']>

const toneIcon: Record<NotificationTone, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Info,
}

type AlertProps = {
  title: string
  description?: string
  tone?: NotificationTone
  icon?: LucideIcon
  action?: React.ReactNode
  className?: string
}

function Alert({
  title,
  description,
  tone = 'info',
  icon,
  action,
  className,
}: AlertProps) {
  const Icon = icon ?? toneIcon[tone]
  return (
    <div
      data-slot="mds-alert"
      role="status"
      className={cn(
        'flex gap-3 rounded-xl p-4',
        toneVariants({ tone }),
        className
      )}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-sm font-bold text-mds-foreground">{title}</p>
        {description ? (
          <Text variant="body" muted className="text-xs">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

type BannerProps = AlertProps

function Banner({ className, ...props }: BannerProps) {
  return (
    <div data-slot="mds-banner">
      <Alert
        className={cn('rounded-none border-x-0 px-4 py-3 sm:px-6', className)}
        {...props}
      />
    </div>
  )
}

type InlineMessageProps = {
  children: React.ReactNode
  tone?: NotificationTone
  className?: string
}

function InlineMessage({
  children,
  tone = 'neutral',
  className,
}: InlineMessageProps) {
  return (
    <p
      data-slot="mds-inline-message"
      className={cn(
        'text-xs font-bold',
        tone === 'success' && 'text-mds-success',
        tone === 'warning' && 'text-mds-warning',
        tone === 'danger' && 'text-mds-danger',
        tone === 'info' && 'text-mds-secondary',
        tone === 'neutral' && 'text-mds-muted',
        className
      )}
    >
      {children}
    </p>
  )
}

/**
 * Layout visual de toast. Sin lógica de cola / sonner.
 * Envolver contenido que luego se pase a un toaster real.
 */
type ToastLayoutProps = {
  title: string
  description?: string
  tone?: NotificationTone
  action?: React.ReactNode
  className?: string
}

function ToastLayout({
  title,
  description,
  tone = 'neutral',
  action,
  className,
}: ToastLayoutProps) {
  const Icon = toneIcon[tone]
  return (
    <div
      data-slot="mds-toast-layout"
      className={cn(
        'flex w-full max-w-sm gap-3 rounded-xl border border-mds-border bg-mds-surface p-4 text-mds-foreground shadow-md',
        className
      )}
    >
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          toneVariants({ tone })
        )}
      >
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-bold">{title}</p>
        {description ? (
          <Text variant="body" muted className="text-xs">
            {description}
          </Text>
        ) : null}
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </div>
  )
}

export { Alert, Banner, InlineMessage, ToastLayout, toneVariants }
export type {
  AlertProps,
  BannerProps,
  InlineMessageProps,
  ToastLayoutProps,
  NotificationTone,
}
