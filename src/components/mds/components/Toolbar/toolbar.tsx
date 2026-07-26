import { cn } from '@/lib/utils'
import { Text } from '../Typography'
import { Separator } from '@/components/ui/separator'

type ToolbarProps = {
  children: React.ReactNode
  className?: string
}

function Toolbar({ children, className }: ToolbarProps) {
  return (
    <div
      data-slot="mds-toolbar"
      role="toolbar"
      className={cn(
        'flex min-h-12 shrink-0 flex-wrap items-center gap-2',
        className
      )}
    >
      {children}
    </div>
  )
}

type ToolbarGroupProps = {
  children: React.ReactNode
  className?: string
}

function ToolbarGroup({ children, className }: ToolbarGroupProps) {
  return (
    <div
      data-slot="mds-toolbar-group"
      className={cn('flex min-h-12 shrink-0 items-center gap-1', className)}
    >
      {children}
    </div>
  )
}

type ToolbarActionsProps = {
  children: React.ReactNode
  className?: string
}

function ToolbarActions({ children, className }: ToolbarActionsProps) {
  return (
    <div
      data-slot="mds-toolbar-actions"
      className={cn(
        'ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2',
        className
      )}
    >
      {children}
    </div>
  )
}

type ToolbarDividerProps = {
  className?: string
  orientation?: 'horizontal' | 'vertical'
}

function ToolbarDivider({
  className,
  orientation = 'vertical',
}: ToolbarDividerProps) {
  return (
    <Separator
      data-slot="mds-toolbar-divider"
      orientation={orientation}
      className={cn(
        orientation === 'vertical' ? 'mx-1 h-6' : 'my-1 w-full',
        'bg-mds-border',
        className
      )}
    />
  )
}

type ToolbarTitleProps = React.ComponentProps<'h2'>

function ToolbarTitle({ className, ...props }: ToolbarTitleProps) {
  return (
    <Text
      as="h2"
      variant="title"
      data-slot="mds-toolbar-title"
      className={cn('text-base', className)}
      {...props}
    />
  )
}

type ToolbarSubtitleProps = React.ComponentProps<'p'>

function ToolbarSubtitle({ className, ...props }: ToolbarSubtitleProps) {
  return (
    <Text
      as="p"
      variant="body"
      muted
      data-slot="mds-toolbar-subtitle"
      className={cn('text-xs', className)}
      {...props}
    />
  )
}

type ToolbarSearchProps = {
  children: React.ReactNode
  className?: string
}

function ToolbarSearch({ children, className }: ToolbarSearchProps) {
  return (
    <div
      data-slot="mds-toolbar-search"
      className={cn('min-w-0 flex-1 sm:max-w-xs', className)}
    >
      {children}
    </div>
  )
}

type ToolbarFiltersProps = {
  children: React.ReactNode
  className?: string
}

function ToolbarFilters({ children, className }: ToolbarFiltersProps) {
  return (
    <div
      data-slot="mds-toolbar-filters"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {children}
    </div>
  )
}

export {
  Toolbar,
  ToolbarGroup,
  ToolbarActions,
  ToolbarDivider,
  ToolbarTitle,
  ToolbarSubtitle,
  ToolbarSearch,
  ToolbarFilters,
}
export type {
  ToolbarProps,
  ToolbarGroupProps,
  ToolbarActionsProps,
  ToolbarDividerProps,
  ToolbarTitleProps,
  ToolbarSubtitleProps,
  ToolbarSearchProps,
  ToolbarFiltersProps,
}
