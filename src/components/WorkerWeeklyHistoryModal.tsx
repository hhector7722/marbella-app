'use client';

import { useEffect, useMemo } from 'react';
import { format, getISOWeek, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/modal';
import type { ModalLayer } from '@/lib/design-system';
import { overtimeWorkerHistoryUsageLabel } from '@/lib/usage/modal-apply';
import { useEmployeeHistoryWeek } from '@/hooks/useEmployeeHistoryWeek';
import { WeekSummary } from '@/components/staff/WeekSummary';
import { firstGivenName } from '@/lib/utils';

interface WorkerWeeklyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workerId: string;
  weekStart: string; // ISO Date string (yyyy-MM-dd) of the Monday
  /**
   * Capa semántica. Default `base` (página overtime, flujo independiente).
   * En Admin dashboard se abre como `derived` sobre el detalle de semana.
   */
  layer?: ModalLayer;
  /** Padre de navegación. Independiente de `layer`. */
  parentInstance?: string;
}

/**
 * Shell modal del Dashboard → Horas Extras → empleado.
 * La semana es el mismo WeekSummary + HistoryWeekDto que `/staff/history`.
 * Única diferencia: `readOnly` (sin editar / overrides / clics de día).
 */
export default function WorkerWeeklyHistoryModal({
  isOpen,
  onClose,
  workerId,
  weekStart,
  layer = 'base',
  parentInstance,
}: WorkerWeeklyHistoryModalProps) {
  const mondayISO = (weekStart || '1970-01-01').split('T')[0]!;
  const {
    week,
    workerName,
    filterYear,
    filterMonth,
    loading,
    error,
  } = useEmployeeHistoryWeek(workerId, mondayISO, { enabled: isOpen });

  const trackingLabel = useMemo(() => {
    if (!isOpen || !weekStart) return 'Historial trabajador horas extras';
    const weekNumber = (() => {
      const [y, m, d] = weekStart.split('T')[0]!.split('-').map(Number);
      if (!y || !m || !d) return undefined;
      return getISOWeek(new Date(y, m - 1, d));
    })();
    return overtimeWorkerHistoryUsageLabel(workerName || 'Trabajador', weekStart, weekNumber);
  }, [isOpen, weekStart, workerName]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const mondayDate = parseISO(mondayISO);
  const sundayDate = addDays(mondayDate, 6);
  const weekNumber = week?.weekNumber ?? getISOWeek(mondayDate);

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      variant="standard"
      layer={layer}
      instance="admin-overtime-worker-history"
      parentInstance={parentInstance}
      usageId="overtime-worker-history"
      usageLabel={trackingLabel}
      title={firstGivenName(workerName, '…')}
      subtitle={`Semana ${weekNumber} · ${format(mondayDate, 'd MMM', { locale: es })} – ${format(sundayDate, 'd MMM', { locale: es })}`}
    >
      {loading ? (
        <div className="py-20 flex justify-center">
          <LoadingSpinner size="lg" className="text-zinc-900" />
        </div>
      ) : week ? (
        <WeekSummary
          weeks={[week]}
          filterMonth={filterMonth}
          filterYear={filterYear}
          onDayClick={() => {}}
          readOnly
          dimOtherMonth={false}
        />
      ) : (
        <p className="text-center text-sm text-zinc-500 py-10">Sin datos</p>
      )}
    </Modal>
  );
}
