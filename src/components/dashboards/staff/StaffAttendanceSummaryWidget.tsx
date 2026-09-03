'use client';

import { useEffect, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { toast } from 'sonner';
import { getEmployeeHistoryWeek, type HistoryWeekDto } from '@/app/actions/history-read';
import { WeekSummary } from '@/components/staff/WeekSummary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';

type StaffAttendanceSummaryWidgetProps = {
    userId: string | null;
    /** Se llama con el `yyyy-MM-dd` pulsado en la semana. */
    onDayClick: (ymd: string) => void;
    /** Incrementa para recargar la semana (p. ej. tras editar asistencia). */
    refreshKey?: number;
};

/**
 * Resumen de asistencia de la semana actual (WeekSummary flush) con su propia
 * carga. Lo montan el mosaico Staff y el Master; el hueco (4×1) lo da el slot.
 */
export function StaffAttendanceSummaryWidget({
    userId,
    onDayClick,
    refreshKey = 0,
}: StaffAttendanceSummaryWidgetProps) {
    const [loading, setLoading] = useState(true);
    const [historyWeek, setHistoryWeek] = useState<HistoryWeekDto | null>(null);
    const [weekFilterYear, setWeekFilterYear] = useState(() => new Date().getFullYear());
    const [weekFilterMonth, setWeekFilterMonth] = useState(() => new Date().getMonth());

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        getEmployeeHistoryWeek({
            userId,
            weekStart: format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        })
            .then((res) => {
                if (cancelled) return;
                if (!res.success) {
                    toast.error(res.error || 'No se pudo cargar el resumen semanal');
                    setHistoryWeek(null);
                    return;
                }
                setHistoryWeek(res.week);
                setWeekFilterYear(res.filterYear);
                setWeekFilterMonth(res.filterMonth);
            })
            .catch((e) => {
                console.error(e);
                toast.error('No se pudo cargar el resumen semanal');
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [userId, refreshKey]);

    return (
        <div className="relative h-full min-h-0" data-fit="week">
            {loading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center" role="status" aria-label="Cargando semana">
                    <LoadingSpinner size="md" className="text-white" />
                </div>
            ) : null}
            {historyWeek ? (
                <WeekSummary
                    flush
                    dimOtherMonth={false}
                    weeks={[historyWeek]}
                    filterMonth={weekFilterMonth}
                    filterYear={weekFilterYear}
                    onDayClick={onDayClick}
                />
            ) : !loading ? (
                <EmptyState instance="staff-week-none" variant="none" title="Sin datos" />
            ) : null}
        </div>
    );
}