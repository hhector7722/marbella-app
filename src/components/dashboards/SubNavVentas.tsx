'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navigateInsideSandbox } from '@/lib/sandbox/client';
import { Share } from 'lucide-react';
import { PetroleumSegmented } from '@/components/ui/PetroleumSegmented';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

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
  /** Navegación interna alternativa cuando Ventas está montada en el sandbox. */
  sandboxNavigate?: (href: string) => void;
  className?: string;
}

/**
 * SubNavVentas — Componente puente de navegación.
 *
 * Lógica de enrutamiento:
 *  - LIVE  → Siempre `router.push('/dashboard/sala')` (hard nav).
 *  - Resto → Si `onTabChange` existe (estamos en ventas) → invoca el callback.
 *             Si no existe (estamos en sala) → `router.push('/dashboard/ventas?tab=X')`.
 */
export function SubNavVentas({ activeTab, onTabChange, showPrint = false, onExportExcel, onPrint, sandboxNavigate, className }: SubNavVentasProps) {
  const router = useRouter();
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareBusy, setShareBusy] = useState<null | 'excel' | 'print'>(null);

  const handleTab = (tab: VentasTab) => {
    if (tab === 'LIVE') {
      if (sandboxNavigate) sandboxNavigate('/dashboard/sala');
      else if (navigateInsideSandbox('/dashboard/sala')) return;
      else router.push('/dashboard/sala');
      return;
    }
    if (onTabChange) {
      onTabChange(tab);
    } else {
      if (sandboxNavigate) sandboxNavigate(`/dashboard/ventas?tab=${tab}`);
      else if (navigateInsideSandbox(`/dashboard/ventas?tab=${tab}`)) return;
      else router.push(`/dashboard/ventas?tab=${tab}`);
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
    <div className={cn("relative flex w-full shrink-0 items-center justify-center print:hidden", className)}>
      <PetroleumSegmented
        instance="ventas-subnav"
        density="compact"
        aria-label="Sección de ventas"
        value={activeTab}
        onChange={(tab) => handleTab(tab as VentasTab)}
        options={tabs.map((tab) => ({ value: tab.id, label: tab.label }))}
      />

      {showPrint && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2" data-ventas-share-root="true">
          <Button
            type="button"
            variant="tertiary"
            instance="ventas-compartir"
            onClick={() => setShareMenuOpen(true)}
            disabled={!!shareBusy}
            aria-label="Compartir"
            icon={<Share size={14} strokeWidth={2} />}
          />
        </div>
      )}

      {shareMenuOpen && (
        <Modal
          open={shareMenuOpen}
          onClose={() => setShareMenuOpen(false)}
          instance="ventas-share-menu"
          title="Exportar"
          variant="compact"
        >
          <div className="flex flex-col gap-3">
            <Button
              type="button"
              variant="secondary"
              instance="ventas-export-excel"
              onClick={() => void exportActiveTableToExcel()}
              layout="fill"
              disabled={!!shareBusy}
            >
              Exportar Excel
            </Button>
            <Button
              type="button"
              variant="primary"
              instance="ventas-export-print"
              onClick={() => void printActiveTable()}
              layout="fill"
              disabled={!!shareBusy}
            >
              Imprimir / PDF
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
