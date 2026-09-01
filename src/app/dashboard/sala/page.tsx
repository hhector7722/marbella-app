'use client';

import RadarSala from '@/components/dashboards/RadarSala';
import { SubNavVentas } from '@/components/dashboards/SubNavVentas';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';

/**
 * /dashboard/sala — Vista de Tiempo Real (LIVE)
 *
 * Misma plantilla que Ventas: PageScreen, SubNav en toolbar, mesas como pieza de trabajo.
 * Este componente es el único dueño de <RadarSala /> y sus WebSockets.
 * LIVE navega aquí; el resto de pestañas delega en SubNavVentas.
 */
export default function SalaPage() {
  return (
    <DashboardDetailLayout
      title="Sala"
      showBackButton={false}
      template="list"
      work="table"
      maxWidthClass="max-w-5xl"
      contentClassName="p-0 flex flex-col min-h-0"
      toolbarSlot={<SubNavVentas activeTab="LIVE" />}
      rightSlot={
        <div
          className="flex items-center gap-ds-2 shrink-0"
          aria-label="En vivo"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full bg-ds-negativo animate-pulse"
            aria-hidden
          />
          <span className="text-[11px] font-medium uppercase tracking-widest">Live</span>
        </div>
      }
    >
      <div data-instance="sala-live" className="px-1.5 py-1 md:px-2 md:py-1.5">
        <RadarSala />
      </div>
    </DashboardDetailLayout>
  );
}
