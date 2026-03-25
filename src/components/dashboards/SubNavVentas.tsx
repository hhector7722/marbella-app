'use client';

import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Printer } from 'lucide-react';

export type VentasTab = 'VENTAS' | 'LIVE' | 'PRODUCTOS' | 'HORAS';

interface SubNavVentasProps {
  /** Pestaña activa actualmente */
  activeTab: VentasTab;
  /**
   * Callback de estado local SÓLO cuando ya estamos en /dashboard/ventas.
   * Si es undefined, significa que estamos en /dashboard/sala y se usará router.push.
   */
  onTabChange?: (tab: VentasTab) => void;
  /** Muestra el botón de impresión (sólo en /dashboard/ventas) */
  showPrint?: boolean;
}

/**
 * SubNavVentas — Componente puente de navegación.
 *
 * Lógica de enrutamiento:
 *  - LIVE  → Siempre `router.push('/dashboard/sala')` (hard nav).
 *  - Resto → Si `onTabChange` existe (estamos en ventas) → invoca el callback.
 *             Si no existe (estamos en sala) → `router.push('/dashboard/ventas?tab=X')`.
 */
export function SubNavVentas({ activeTab, onTabChange, showPrint = false }: SubNavVentasProps) {
  const router = useRouter();

  const handleTab = (tab: VentasTab) => {
    if (tab === 'LIVE') {
      router.push('/dashboard/sala');
      return;
    }
    if (onTabChange) {
      // Ya estamos en /dashboard/ventas: navegación instantánea por estado
      onTabChange(tab);
    } else {
      // Venimos desde /dashboard/sala: hard-nav con parámetro de pestaña
      router.push(`/dashboard/ventas?tab=${tab}`);
    }
  };

  const tabs: { id: VentasTab; label: React.ReactNode }[] = [
    {
      id: 'VENTAS',
      label: 'Ventas',
    },
    {
      id: 'LIVE',
      label: (
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
          Live
        </span>
      ),
    },
    {
      id: 'PRODUCTOS',
      label: 'Productos',
    },
    {
      id: 'HORAS',
      label: 'Horas',
    },
  ];

  return (
    <div className="flex shrink-0 border-b border-zinc-100 px-4 py-2 justify-center items-center relative print:hidden">
      <div className="inline-flex rounded-lg overflow-hidden border border-[#36606F] shadow-sm">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => handleTab(tab.id)}
            className={cn(
              'px-2.5 py-1 text-[8px] font-black uppercase tracking-wider transition-colors outline-none',
              activeTab === tab.id
                ? 'bg-[#36606F] text-white'
                : 'bg-white text-[#36606F] hover:bg-[#36606F]/5'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showPrint && (
        <button
          type="button"
          onClick={() => window.print()}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-lg text-[#36606F] hover:bg-[#36606F]/5 transition-colors outline-none min-h-[48px] min-w-[48px] flex items-center justify-center"
          title="Imprimir"
        >
          <Printer size={16} />
        </button>
      )}
    </div>
  );
}
