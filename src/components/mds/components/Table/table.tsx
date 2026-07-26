'use client'

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState } from '../EmptyState'
import { LoadingTable } from '../Loading'
import { Surface } from '../Surface'
import { Text } from '../Typography'
import { Button } from '../Button'
import { SearchInput } from '../Search'

type DataTableProps = {
  children: React.ReactNode
  className?: string
  toolbar?: React.ReactNode
  footer?: React.ReactNode
}

function DataTable({ children, className, toolbar, footer }: DataTableProps) {
  return (
    <Surface
      variant="default"
      data-slot="mds-data-table"
      className={cn('overflow-hidden p-0', className)}
    >
      {toolbar ? (
        <div className="border-b border-mds-border px-4 py-3">{toolbar}</div>
      ) : null}
      <div className="min-w-0">{children}</div>
      {footer ? (
        <div className="border-t border-mds-border px-4 py-3">{footer}</div>
      ) : null}
    </Surface>
  )
}

type TableToolbarProps = {
  children: React.ReactNode
  className?: string
}

function TableToolbar({ children, className }: TableToolbarProps) {
  return (
    <div
      data-slot="mds-table-toolbar"
      className={cn(
        'flex min-h-12 flex-col gap-2 sm:flex-row sm:items-center',
        className
      )}
    >
      {children}
    </div>
  )
}

type TableFiltersProps = {
  children: React.ReactNode
  className?: string
}

function TableFilters({ children, className }: TableFiltersProps) {
  return (
    <div
      data-slot="mds-table-filters"
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      {children}
    </div>
  )
}

type TableSearchProps = Omit<React.ComponentProps<typeof SearchInput>, 'type'>

function TableSearch({ className, ...props }: TableSearchProps) {
  return (
    <div data-slot="mds-table-search" className={cn('w-full sm:max-w-xs', className)}>
      <SearchInput placeholder="Buscar…" {...props} />
    </div>
  )
}

type TablePaginationProps = {
  page: number
  pageCount: number
  onPageChange?: (page: number) => void
  className?: string
  summary?: string
}

function TablePagination({
  page,
  pageCount,
  onPageChange,
  className,
  summary,
}: TablePaginationProps) {
  const safeCount = Math.max(1, pageCount)
  const safePage = Math.min(Math.max(1, page), safeCount)
  return (
    <div
      data-slot="mds-table-pagination"
      className={cn(
        'flex min-h-12 flex-wrap items-center justify-between gap-2',
        className
      )}
    >
      <Text variant="body" muted className="text-xs">
        {summary ?? `Página ${safePage} de ${safeCount}`}
      </Text>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          aria-label="Página anterior"
          disabled={safePage <= 1}
          onClick={() => onPageChange?.(safePage - 1)}
          className="min-h-12 min-w-12 px-0"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-label="Página siguiente"
          disabled={safePage >= safeCount}
          onClick={() => onPageChange?.(safePage + 1)}
          className="min-h-12 min-w-12 px-0"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Button>
      </div>
    </div>
  )
}

type TableEmptyProps = {
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

function TableEmpty({
  title = 'Sin datos',
  description = 'No hay filas que mostrar.',
  action,
  className,
}: TableEmptyProps) {
  return (
    <div data-slot="mds-table-empty" className={className}>
      <EmptyState
        variant="table"
        title={title}
        description={description}
        action={action}
      />
    </div>
  )
}

type TableLoadingProps = {
  rows?: number
  columns?: number
  className?: string
}

function TableLoading({ rows, columns, className }: TableLoadingProps) {
  return (
    <div data-slot="mds-table-loading" className={className}>
      <LoadingTable rows={rows} columns={columns} className="border-0 shadow-none" />
    </div>
  )
}

type TableSelectionProps = {
  selectedCount: number
  children?: React.ReactNode
  className?: string
  onClear?: () => void
}

function TableSelection({
  selectedCount,
  children,
  className,
  onClear,
}: TableSelectionProps) {
  if (selectedCount <= 0) return null
  return (
    <div
      data-slot="mds-table-selection"
      className={cn(
        'flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-mds-border bg-mds-muted-surface px-3 py-2',
        className
      )}
    >
      <Text variant="body" className="text-xs font-bold">
        {selectedCount} seleccionados
      </Text>
      {onClear ? (
        <Button type="button" variant="ghost" onClick={onClear} className="min-h-12">
          Limpiar
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

type TableActionsProps = {
  children: React.ReactNode
  className?: string
}

function TableActions({ children, className }: TableActionsProps) {
  return (
    <div
      data-slot="mds-table-actions"
      className={cn(
        'ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2',
        className
      )}
    >
      {children}
    </div>
  )
}

type SortDirection = 'asc' | 'desc' | false

type TableColumnHeaderProps = {
  title: string
  sorted?: SortDirection
  onSort?: () => void
  className?: string
}

function TableColumnHeader({
  title,
  sorted = false,
  onSort,
  className,
}: TableColumnHeaderProps) {
  const Icon =
    sorted === 'asc' ? ArrowUp : sorted === 'desc' ? ArrowDown : ArrowUpDown

  if (!onSort) {
    return (
      <span
        data-slot="mds-table-column-header"
        className={cn('text-xs font-bold uppercase tracking-wider text-mds-muted', className)}
      >
        {title}
      </span>
    )
  }

  return (
    <button
      type="button"
      data-slot="mds-table-column-header"
      onClick={onSort}
      className={cn(
        'inline-flex min-h-12 items-center gap-1 text-xs font-bold uppercase tracking-wider text-mds-muted hover:text-mds-foreground',
        className
      )}
    >
      {title}
      <Icon className="size-3.5" aria-hidden />
    </button>
  )
}

export {
  DataTable,
  TableToolbar,
  TableFilters,
  TableSearch,
  TablePagination,
  TableEmpty,
  TableLoading,
  TableSelection,
  TableActions,
  TableColumnHeader,
  // re-export shadcn table primitives for composition
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
}
export type {
  DataTableProps,
  TableToolbarProps,
  TableFiltersProps,
  TableSearchProps,
  TablePaginationProps,
  TableEmptyProps,
  TableLoadingProps,
  TableSelectionProps,
  TableActionsProps,
  TableColumnHeaderProps,
  SortDirection,
}
