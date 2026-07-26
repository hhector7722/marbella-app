import { cn } from '@/lib/utils'
import { Text } from '../Typography'

type ListProps = {
  children: React.ReactNode
  className?: string
}

function List({ children, className }: ListProps) {
  return (
    <ul
      data-slot="mds-list"
      className={cn(
        'divide-y divide-mds-border overflow-hidden rounded-xl border border-mds-border bg-mds-surface shadow-sm',
        className
      )}
    >
      {children}
    </ul>
  )
}

type ListHeaderProps = {
  children: React.ReactNode
  className?: string
}

function ListHeader({ children, className }: ListHeaderProps) {
  return (
    <li
      data-slot="mds-list-header"
      className={cn(
        'list-none bg-mds-muted-surface/50 px-4 py-3 text-mds-muted',
        className
      )}
    >
      {typeof children === 'string' ? (
        <Text variant="label">{children}</Text>
      ) : (
        children
      )}
    </li>
  )
}

type ListSectionProps = {
  title?: string
  children: React.ReactNode
  className?: string
}

function ListSection({ title, children, className }: ListSectionProps) {
  return (
    <li data-slot="mds-list-section" className={cn('list-none', className)}>
      {title ? (
        <div className="bg-mds-muted-surface/40 px-4 py-2">
          <Text variant="label">{title}</Text>
        </div>
      ) : null}
      <ul className="divide-y divide-mds-border">{children}</ul>
    </li>
  )
}

type ListItemProps = React.ComponentProps<'li'> & {
  selected?: boolean
  disabled?: boolean
}

function ListItem({
  className,
  selected,
  disabled,
  children,
  ...props
}: ListItemProps) {
  return (
    <li
      data-slot="mds-list-item"
      data-selected={selected || undefined}
      data-disabled={disabled || undefined}
      aria-selected={selected}
      aria-disabled={disabled}
      className={cn(
        'flex min-h-12 list-none items-center gap-3 px-4 py-3 text-sm font-medium text-mds-foreground',
        selected && 'bg-mds-muted-surface',
        disabled && 'pointer-events-none opacity-50',
        !disabled && 'hover:bg-mds-muted-surface/60',
        className
      )}
      {...props}
    >
      {children}
    </li>
  )
}

type ListActionsProps = {
  children: React.ReactNode
  className?: string
}

function ListActions({ children, className }: ListActionsProps) {
  return (
    <div
      data-slot="mds-list-actions"
      className={cn(
        'ml-auto flex shrink-0 items-center gap-1',
        className
      )}
    >
      {children}
    </div>
  )
}

export { List, ListItem, ListHeader, ListSection, ListActions }
export type {
  ListProps,
  ListItemProps,
  ListHeaderProps,
  ListSectionProps,
  ListActionsProps,
}
