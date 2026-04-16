'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Download, Printer, Share } from 'lucide-react';

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
  /** Exporta la tabla activa a Excel (sólo en /dashboard/ventas) */
  onExportExcel?: () => void;
  /** Imprime la tabla activa (sólo en /dashboard/ventas) */
  onPrint?: () => void;
}

/**
 * SubNavVentas — Componente puente de navegación.
 *
 * Lógica de enrutamiento:
 *  - LIVE  → Siempre `router.push('/dashboard/sala')` (hard nav).
 *  - Resto → Si `onTabChange` existe (estamos en ventas) → invoca el callback.
 *             Si no existe (estamos en sala) → `router.push('/dashboard/ventas?tab=X')`.
 */
export function SubNavVentas({ activeTab, onTabChange, showPrint = false, onExportExcel, onPrint }: SubNavVentasProps) {
  const router = useRouter();
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<null | 'excel' | 'print'>(null);

  useEffect(() => {
    if (!shareMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-ventas-share-root="true"]')) return;
      setShareMenuOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShareMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [shareMenuOpen]);

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

  const exportActiveTableToExcel = async () => {
    if (shareBusy) return;
    setShareBusy('excel');
    try {
      await onExportExcel?.();
    } catch (e) {
      console.error(e);
    } finally {
      setShareBusy(null);
      setShareMenuOpen(false);
    }
  };

  const printActiveTable = async () => {
    if (shareBusy) return;
    setShareBusy('print');
    try {
      await onPrint?.();
    } catch (e) {
      console.error(e);
    } finally {
      setShareBusy(null);
      setShareMenuOpen(false);
    }
  };

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
        <div className="absolute right-4 top-1/2 -translate-y-1/2" data-ventas-share-root="true">
          <div className="relative" data-ventas-share-root="true">
            <button
              type="button"
              onClick={() => setShareMenuOpen((v) => !v)}
              className={cn(
                "p-2 rounded-lg text-[#36606F] hover:bg-[#36606F]/5 transition-colors outline-none",
                "min-h-[48px] min-w-[48px] flex items-center justify-center",
                shareBusy ? "opacity-60 pointer-events-none" : ""
              )}
              title="Compartir"
              aria-label="Compartir"
            >
              <Share size={16} />
            </button>

            {shareMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white text-zinc-900 shadow-2xl border border-zinc-100 overflow-hidden">
                <button
                  type="button"
                  onClick={exportActiveTableToExcel}
                  className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">Exportar Excel</span>
                  <Download className="w-4 h-4 text-zinc-500" />
                </button>
                <div className="h-px bg-zinc-100" />
                <button
                  type="button"
                  onClick={printActiveTable}
                  className="w-full min-h-12 px-4 py-3 flex items-center justify-between hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                >
                  <span className="text-[11px] font-black uppercase tracking-widest">Imprimir</span>
                  <Printer className="w-4 h-4 text-zinc-500" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
