'use client'

import RadarSala from '@/components/dashboards/RadarSala'
import { SubNavVentas } from '@/components/dashboards/SubNavVentas'
import { PageHeader, Surface } from '@/components/mds'

/**
 * /dashboard/sala — Vista de Tiempo Real (LIVE)
 *
 * Arquitectura desacoplada:
 * - Este componente es el único dueño de <RadarSala /> y sus WebSockets.
 * - Cascarón alineado con VentasClient; sin selectores de fecha.
 * - SubNavVentas → router.push('/dashboard/ventas?tab=X') para pestañas históricas.
 */
export default function SalaClient() {
  return (
    <div className="mx-auto max-w-4xl space-y-4 pb-8 text-mds-foreground">
      <PageHeader
        title="Sala"
        description={
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-red-400 animate-pulse" aria-hidden />
            Live · radar en tiempo real
          </span>
        }
      />

      <Surface className="overflow-hidden p-0 shadow-sm">
        <SubNavVentas activeTab="LIVE" />
        <div className="p-4 md:p-6 bg-zinc-50/50">
          <RadarSala />
        </div>
      </Surface>
    </div>
  )
}
