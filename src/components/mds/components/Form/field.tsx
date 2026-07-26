import { cn } from '@/lib/utils'
import { Text } from '../Typography'

type FieldGroupProps = {
  children: React.ReactNode
  className?: string
}

function FieldGroup({ children, className }: FieldGroupProps) {
  return (
    <div
      data-slot="mds-field-group"
      className={cn('flex flex-col gap-4', className)}
    >
      {children}
    </div>
  )
}

type FieldLabelProps = React.ComponentProps<'label'>

function FieldLabel({ className, ...props }: FieldLabelProps) {
  return (
    <label
      data-slot="mds-field-label"
      className={cn(
        'text-xs font-bold uppercase tracking-widest text-mds-muted',
        className
      )}
      {...props}
    />
  )
}

type FieldDescriptionProps = React.ComponentProps<'p'>

function FieldDescription({ className, ...props }: FieldDescriptionProps) {
  return (
    <Text
      as="p"
      variant="body"
      muted
      data-slot="mds-field-description"
      className={cn('text-xs', className)}
      {...props}
    />
  )
}

type FieldHintProps = React.ComponentProps<'p'>

function FieldHint({ className, ...props }: FieldHintProps) {
  return (
    <Text
      as="p"
      variant="caption"
      data-slot="mds-field-hint"
      className={cn('normal-case tracking-normal', className)}
      {...props}
    />
  )
}

type FieldErrorProps = React.ComponentProps<'p'>

function FieldError({ className, children, ...props }: FieldErrorProps) {
  if (!children) return null
  return (
    <p
      data-slot="mds-field-error"
      role="alert"
      className={cn('text-xs font-bold text-mds-danger', className)}
      {...props}
    >
      {children}
    </p>
  )
}

type FieldShellProps = {
  id?: string
  label?: string
  description?: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
  htmlFor?: string
}

function FieldShell({
  id,
  label,
  description,
  hint,
  error,
  children,
  className,
  htmlFor,
}: FieldShellProps) {
  const labelFor = htmlFor ?? id
  return (
    <div
      data-slot="mds-field"
      className={cn('flex flex-col gap-1.5', className)}
    >
      {label ? <FieldLabel htmlFor={labelFor}>{label}</FieldLabel> : null}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      {children}
      {hint && !error ? <FieldHint>{hint}</FieldHint> : null}
      <FieldError>{error}</FieldError>
    </div>
  )
}

const controlClassName = cn(
  'min-h-12 w-full rounded-lg border border-mds-border bg-mds-surface px-3 text-sm font-medium text-mds-foreground',
  'placeholder:text-mds-muted outline-none transition-colors',
  'focus-visible:border-mds-primary focus-visible:ring-3 focus-visible:ring-mds-primary/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
  'aria-invalid:border-mds-danger aria-invalid:ring-mds-danger/20'
)

export {
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldHint,
  FieldError,
  FieldShell,
  controlClassName,
}
export type {
  FieldGroupProps,
  FieldLabelProps,
  FieldDescriptionProps,
  FieldHintProps,
  FieldErrorProps,
  FieldShellProps,
}
