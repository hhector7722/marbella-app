'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { format, getISOWeek, parseISO, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { overtimeWorkerHistoryUsageLabel } from '@/lib/usage/modal-apply';
import {
  getEmployeeHistoryWeek,
  type HistoryWeekDto,
} from '@/app/actions/history-read';
import { WeekCard } from '@/app/staff/history/WeekCard';

interface WorkerWeeklyHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  workerId: string;
  weekStart: string; // ISO Date string (yyyy-MM-dd) of the Monday
}

/**
 * Shell modal del Dashboard → Horas Extras → empleado.
 * La semana se pinta con el mismo WeekCard + HistoryWeekDto que `/staff/history`.
 * Única diferencia: `readOnly` (sin editar / overrides / clics de día).
 */
export default function WorkerWeeklyHistoryModal({
  isOpen,
  onClose,
  workerId,
  weekStart,
}: WorkerWeeklyHistoryModalProps) {
  const [loading, setLoading] = useState(true);
  const [week, setWeek] = useState<HistoryWeekDto | null>(null);
  const [workerName, setWorkerName] = useState('');
  const [filterYear, setFilterYear] = useState(0);
  const [filterMonth, setFilterMonth] = useState(0);

  const trackingLabel = useMemo(() => {
    if (!isOpen || !weekStart) return 'Historial trabajador horas extras';
    const weekNumber = (() => {
      const [y, m, d] = weekStart.split('T')[0]!.split('-').map(Number);
      if (!y || !m || !d) return undefined;
      return getISOWeek(new Date(y, m - 1, d));
    })();
    return overtimeWorkerHistoryUsageLabel(workerName || 'Trabajador', weekStart, weekNumber);
  }, [isOpen, weekStart, workerName]);

  useModalUsageTracking({
    open: isOpen,
    usageId: 'overtime-worker-history',
    usageLabel: trackingLabel,
  });

  useEffect(() => {
    if (isOpen && workerId && weekStart) {
      void fetchWeekData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, workerId, weekStart]);

  async function fetchWeekData() {
    setLoading(true);
    setWeek(null);
    try {
      const mondayISO = weekStart.split('T')[0]!;
      const res = await getEmployeeHistoryWeek({
        userId: workerId,
        weekStart: mondayISO,
      });
      if (!res.success) {
        toast.error(res.error || 'No se pudo cargar la semana');
        return;
      }
      setWorkerName(res.workerName);
      setWeek(res.week);
      setFilterYear(res.filterYear);
      setFilterMonth(res.filterMonth);
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar historial');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  const mondayISO = weekStart.split('T')[0]!;
  const mondayDate = parseISO(mondayISO);
  const sundayDate = addDays(mondayDate, 6);
  const weekNumber = week?.weekNumber ?? getISOWeek(mondayDate);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200">
        <div className="px-5 py-4 border-b border-zinc-100 flex items-center justify-between shrink-0 bg-white z-10">
          <div>
            <h3 className="text-lg font-black text-zinc-900 tracking-tight">
              {workerName || '…'}
            </h3>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
              {`Semana ${weekNumber} · ${format(mondayDate, 'd MMM', { locale: es })} – ${format(sundayDate, 'd MMM', { locale: es })}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-zinc-100 text-zinc-400 transition-colors min-h-12 min-w-12 flex items-center justify-center"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner size="lg" className="text-zinc-900" />
            </div>
          ) : week ? (
            <div className="p-4 bg-zinc-50/50">
              <WeekCard
                week={week}
                idx={0}
                filterMonth={filterMonth}
                filterYear={filterYear}
                onDayClick={() => {}}
                readOnly
                showWeekOverrides={false}
              />
            </div>
          ) : (
            <p className="text-center text-sm text-zinc-500 py-10">Sin datos</p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
