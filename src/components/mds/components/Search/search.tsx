'use client'

import { Search as SearchIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '../EmptyState'
import { Surface } from '../Surface'
import { Text } from '../Typography'

type SearchInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Oculta el icono de lupa. */
  hideIcon?: boolean
}

function SearchInput({
  className,
  hideIcon = false,
  ...props
}: SearchInputProps) {
  return (
    <div data-slot="mds-search-input" className="relative w-full">
      {hideIcon ? null : (
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-mds-muted"
          aria-hidden
        />
      )}
      <Input
        type="search"
        className={cn(
          'min-h-12 border-mds-border bg-mds-surface text-mds-foreground placeholder:text-mds-muted focus-visible:border-mds-primary focus-visible:ring-mds-primary/20',
          !hideIcon && 'pl-10',
          className
        )}
        {...props}
      />
    </div>
  )
}

type SearchBarProps = {
  children: React.ReactNode
  className?: string
  actions?: React.ReactNode
}

function SearchBar({ children, className, actions }: SearchBarProps) {
  return (
    <div
      data-slot="mds-search-bar"
      className={cn(
        'flex min-h-12 w-full flex-col gap-2 sm:flex-row sm:items-center',
        className
      )}
    >
      <div className="min-w-0 flex-1">{children}</div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      ) : null}
    </div>
  )
}

type SearchEmptyProps = {
  title?: string
  description?: string
  className?: string
}

function SearchEmpty({
  title = 'Sin resultados',
  description = 'Prueba con otros términos o amplía el criterio.',
  className,
}: SearchEmptyProps) {
  return (
    <div data-slot="mds-search-empty">
      <EmptyState
        variant="compact"
        title={title}
        description={description}
        className={className}
      />
    </div>
  )
}

type SearchResultsProps = {
  children: React.ReactNode
  className?: string
  label?: string
}

function SearchResults({
  children,
  className,
  label = 'Resultados',
}: SearchResultsProps) {
  return (
    <Surface
      variant="outlined"
      data-slot="mds-search-results"
      role="listbox"
      aria-label={label}
      className={cn('overflow-hidden divide-y divide-mds-border', className)}
    >
      {children}
    </Surface>
  )
}

type SearchLoadingProps = {
  className?: string
  rows?: number
}

function SearchLoading({ className, rows = 3 }: SearchLoadingProps) {
  const count = Math.max(1, Math.min(rows, 8))
  return (
    <div
      data-slot="mds-search-loading"
      aria-busy="true"
      aria-label="Buscando"
      className={cn('space-y-2', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className="h-12 w-full rounded-lg bg-mds-muted-surface"
        />
      ))}
      <Text variant="caption" className="sr-only">
        Cargando resultados
      </Text>
    </div>
  )
}

export {
  SearchInput,
  SearchBar,
  SearchEmpty,
  SearchResults,
  SearchLoading,
}
export type {
  SearchInputProps,
  SearchBarProps,
  SearchEmptyProps,
  SearchResultsProps,
  SearchLoadingProps,
}
