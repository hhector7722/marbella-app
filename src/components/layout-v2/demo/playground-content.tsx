'use client'

import { Plus, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  PageActions,
  PageContainer,
  PageHeader,
} from '@/components/layout-v2'
import { DemoCatalogTable } from './demo-catalog-table'
import { DemoMetricGrid } from './demo-metric-grid'
import { DemoSidePanel } from './demo-side-panel'
import { demoPageMeta } from './page-data'

export function AppShellPlaygroundContent() {
  return (
    <PageContainer>
      <PageHeader
        title={demoPageMeta.title}
        description={demoPageMeta.description}
        actions={
          <PageActions>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 border-mds-border"
            >
              <RefreshCw className="size-4" aria-hidden />
              Actualizar
            </Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  type="button"
                  className="min-h-12 bg-mds-primary text-mds-primary-foreground hover:bg-mds-primary/90"
                >
                  <Plus className="size-4" aria-hidden />
                  Nueva acción
                </Button>
              </DialogTrigger>
              <DialogContent className="border-mds-border bg-mds-surface">
                <DialogHeader>
                  <DialogTitle className="text-mds-foreground">
                    Diálogo de ejemplo
                  </DialogTitle>
                  <DialogDescription>
                    Comprueba overlay, tipografía y botones del Design System.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm text-mds-muted">
                  Este modal es solo visual. No persiste datos ni llama a
                  Supabase.
                </p>
                <DialogFooter>
                  <Button type="button" variant="outline" className="min-h-12">
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    className="min-h-12 bg-mds-primary text-mds-primary-foreground hover:bg-mds-primary/90"
                  >
                    Confirmar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </PageActions>
        }
      />

      <DemoMetricGrid />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <DemoCatalogTable />
        <DemoSidePanel />
      </div>

      <section
        aria-label="Botonera"
        className="flex shrink-0 flex-wrap gap-2 rounded-xl border border-mds-border bg-mds-surface p-4 shadow-sm"
      >
        <Button
          type="button"
          className="min-h-12 bg-mds-primary text-mds-primary-foreground hover:bg-mds-primary/90"
        >
          Primary
        </Button>
        <Button type="button" variant="secondary" className="min-h-12">
          Secondary
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 border-mds-border"
        >
          Outline
        </Button>
        <Button type="button" variant="ghost" className="min-h-12">
          Ghost
        </Button>
        <Button type="button" variant="destructive" className="min-h-12">
          Destructive
        </Button>
      </section>
    </PageContainer>
  )
}
