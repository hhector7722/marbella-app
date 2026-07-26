'use client'

import {
  AlertTriangle,
  Inbox,
  Package,
  Plus,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  EmptyState,
  LoadingBlock,
  LoadingPage,
  LoadingTable,
  Metric,
  PageContent,
  PageHeader,
  Section,
  Status,
  Surface,
  Text,
} from '@/components/mds'

/**
 * Catálogo vivo de la librería MDS (Sprint 5).
 * Solo visual. Sin datos reales.
 */
export function DemoMdsLibrary() {
  return (
    <PageContent className="gap-8 border-t border-mds-border pt-8">
      <PageHeader
        title="Librería MDS"
        description="Primera familia de componentes del Design System. Gate visual obligatorio."
      />

      <Section
        id="mds-surfaces"
        title="Surface"
        description="Contenedor oficial. default · elevated · outlined · subtle."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(
            [
              ['default', 'Default'],
              ['elevated', 'Elevated'],
              ['outlined', 'Outlined'],
              ['subtle', 'Subtle'],
            ] as const
          ).map(([variant, label]) => (
            <Surface key={variant} variant={variant} className="p-4">
              <Text variant="label">{label}</Text>
              <Text variant="body" muted className="mt-2">
                variant=&quot;{variant}&quot;
              </Text>
            </Surface>
          ))}
        </div>
      </Section>

      <Section
        id="mds-metrics"
        title="Metric"
        description="Limpia, sin fondos de color. Estados loading y empty."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            title="Ventas hoy"
            value="4.280 €"
            trend={{ label: '+8,2%', tone: 'success' }}
            icon={TrendingUp}
          />
          <Metric
            title="Coste laboral"
            value="31%"
            description="Sobre ventas del día"
            trend={{ label: '−1,4 pts', tone: 'success' }}
          />
          <Metric title="Cargando" loading />
          <Metric title="Sin datos" empty description="Aún no hay cierres" />
        </div>
      </Section>

      <Section
        id="mds-status"
        title="Status"
        description="Semántica MDS. Info usa secondary (sin token info dedicado)."
      >
        <div className="flex flex-wrap gap-2">
          <Status.Success>OK</Status.Success>
          <Status.Warning>Atención</Status.Warning>
          <Status.Danger>Error</Status.Danger>
          <Status.Info>Info</Status.Info>
          <Status.Neutral>Neutral</Status.Neutral>
        </div>
      </Section>

      <Section
        id="mds-empty"
        title="EmptyState"
        description="Un solo componente. Variantes default · compact · table."
        actions={
          <Button
            type="button"
            className="min-h-12 bg-mds-primary text-mds-primary-foreground hover:bg-mds-primary/90"
          >
            <Plus className="size-4" aria-hidden />
            Acción sección
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <EmptyState
            icon={Inbox}
            title="Sin encargos"
            description="Cuando lleguen pedidos aparecerán aquí."
            action={
              <Button type="button" variant="outline" className="min-h-12">
                Crear encargo
              </Button>
            }
          />
          <EmptyState
            variant="compact"
            icon={Package}
            title="Stock vacío"
            description="No hay artículos en esta categoría."
          />
          <Surface variant="outlined" className="overflow-hidden">
            <EmptyState
              variant="table"
              icon={AlertTriangle}
              title="Sin filas"
              description="Ajusta filtros o añade un registro."
            />
          </Surface>
        </div>
      </Section>

      <Section
        id="mds-loading"
        title="Loading"
        description="Skeleton shadcn + skin MDS."
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <LoadingBlock lines={4} />
          <LoadingTable rows={3} columns={3} />
        </div>
        <div className="mt-4">
          <Text variant="label" className="mb-3 block">
            LoadingPage
          </Text>
          <LoadingPage />
        </div>
      </Section>
    </PageContent>
  )
}
