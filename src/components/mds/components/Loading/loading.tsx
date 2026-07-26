import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Surface } from '../Surface'

type LoadingBlockProps = {
  className?: string
  /** Altura del bloque (clases Tailwind de escala fija). */
  lines?: number
}

function LoadingBlock({ className, lines = 3 }: LoadingBlockProps) {
  const count = Math.max(1, Math.min(lines, 8))

  return (
    <Surface
      variant="default"
      data-slot="mds-loading-block"
      aria-busy="true"
      aria-label="Cargando"
      className={cn('flex flex-col gap-3 p-4', className)}
    >
      {Array.from({ length: count }, (_, i) => (
        <Skeleton
          key={i}
          className={cn(
            'h-4 rounded-md bg-mds-muted-surface',
            i === 0 ? 'w-1/3' : i === count - 1 ? 'w-2/3' : 'w-full'
          )}
        />
      ))}
    </Surface>
  )
}

type LoadingTableProps = {
  className?: string
  rows?: number
  columns?: number
}

function LoadingTable({
  className,
  rows = 5,
  columns = 4,
}: LoadingTableProps) {
  const rowCount = Math.max(1, Math.min(rows, 12))
  const colCount = Math.max(1, Math.min(columns, 8))

  return (
    <Surface
      variant="default"
      data-slot="mds-loading-table"
      aria-busy="true"
      aria-label="Cargando tabla"
      className={cn('overflow-hidden p-0', className)}
    >
      <div className="border-b border-mds-border bg-mds-muted-surface/40 px-4 py-3">
        <div className="flex gap-4">
          {Array.from({ length: colCount }, (_, i) => (
            <Skeleton
              key={i}
              className="h-3 flex-1 rounded-md bg-mds-muted-surface"
            />
          ))}
        </div>
      </div>
      <div className="divide-y divide-mds-border">
        {Array.from({ length: rowCount }, (_, row) => (
          <div key={row} className="flex gap-4 px-4 py-3">
            {Array.from({ length: colCount }, (_, col) => (
              <Skeleton
                key={col}
                className="h-4 flex-1 rounded-md bg-mds-muted-surface"
              />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  )
}

type LoadingPageProps = {
  className?: string
}

function LoadingPage({ className }: LoadingPageProps) {
  return (
    <div
      data-slot="mds-loading-page"
      aria-busy="true"
      aria-label="Cargando página"
      className={cn('flex flex-col gap-6', className)}
    >
      <div className="space-y-2">
        <Skeleton className="h-8 w-48 rounded-md bg-mds-muted-surface" />
        <Skeleton className="h-4 w-72 max-w-full rounded-md bg-mds-muted-surface" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <LoadingBlock key={i} lines={2} />
        ))}
      </div>
      <LoadingTable rows={4} columns={4} />
    </div>
  )
}

export { LoadingBlock, LoadingTable, LoadingPage }
export type { LoadingBlockProps, LoadingTableProps, LoadingPageProps }
