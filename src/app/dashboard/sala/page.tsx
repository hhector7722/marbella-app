'use client';

import RadarSala from '@/components/dashboards/RadarSala';
import { SubNavVentas } from '@/components/dashboards/SubNavVentas';
import { Surface } from '@/components/ui/Surface';

/**
 * /dashboard/sala — Vista de Tiempo Real (LIVE)
 *
 * Arquitectura desacoplada:
 * - Este componente es el único dueño de <RadarSala /> y sus WebSockets.
 * - Cascarón de Surface page, sin PageScreen: no es listado/detalle/formulario.
 * - La navegación a pestañas históricas delega en SubNavVentas → router.push('/dashboard/ventas?tab=X')
 */
export default function SalaPage() {
  return (
    <div className="min-h-screen p-4 md:p-6 pb-24">
      <div className="mx-auto w-full max-w-4xl">
        <Surface variant="page" instance="sala-live" className="flex flex-col overflow-hidden">
          <div data-element="header" className="flex items-center justify-between gap-2 shrink-0">
            <h1 data-element="title">Sala</h1>
            <div
              className="flex items-center gap-ds-2 shrink-0"
              aria-label="En vivo"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-ds-negativo animate-pulse"
                aria-hidden
              />
              <span className="text-[11px] font-black uppercase tracking-widest">Live</span>
            </div>
          </div>

          {/* onTabChange no se pasa → SubNavVentas usa router.push para pestañas históricas */}
          <SubNavVentas activeTab="LIVE" />

          <div className="p-4 md:p-6 flex-1 min-h-0">
            <RadarSala />
          </div>
        </Surface>
      </div>
    </div>
  );
}
