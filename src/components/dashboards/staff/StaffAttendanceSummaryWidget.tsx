'use client';

import { useEffect, useMemo } from 'react';
import { addDays, format, getISOWeek, isSameDay, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { useEmployeeHistoryWeek } from '@/hooks/useEmployeeHistoryWeek';
import type { HistoryWeekDto } from '@/app/actions/history-read';
import { WeekSummary } from '@/components/staff/WeekSummary';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

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
    const weekStart = useMemo(
        () => format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd'),
        [],
    );
    const {
        week: historyWeek,
        filterYear,
        filterMonth,
        loading,
        error,
    } = useEmployeeHistoryWeek(userId, weekStart, { refreshKey });

    useEffect(() => {
        if (error) toast.error(error);
    }, [error]);

    const displayWeek = useMemo(() => {
        if (historyWeek) return historyWeek;

        const monday = startOfWeek(new Date(), { weekStartsOn: 1 });
        const days = Array.from({ length: 7 }, (_, i) => {
            const d = addDays(monday, i);
            return {
                date: format(d, 'yyyy-MM-dd'),
                dayNumber: d.getDate(),
                dayName: format(d, 'EEEE', { locale: es }),
                eventType: 'regular',
                clockIn: null,
                clockOut: null,
                totalHours: 0,
                extraHours: 0,
                justifiedHours: 0,
                hasLog: false,
                isToday: isSameDay(d, new Date()),
            };
        });

        return {
            startDate: format(monday, 'yyyy-MM-dd'),
            weekNumber: getISOWeek(new Date()),
            days: days as HistoryWeekDto['days'],
            summary: {
                limitHours: 0,
                preferStock: false,
                hourlyRate: null,
                totalHours: 0,
                weeklyBalance: 0,
                accumulatedBalance: 0,
                estimatedValue: 0,
                isPaid: false,
            },
        } as unknown as HistoryWeekDto;
    }, [historyWeek]);

    const weekFilterYear = historyWeek ? filterYear : new Date().getFullYear();
    const weekFilterMonth = historyWeek ? filterMonth : new Date().getMonth();

    return (
        <div className="relative h-full min-h-0" data-fit="week">
            {loading && (
                <div className="absolute right-3 top-3 z-20 flex items-center justify-center pointer-events-none" role="status" aria-label="Cargando semana">
                    <LoadingSpinner size="sm" className="text-white/60" />
                </div>
            )}
            <WeekSummary
                flush
                dimOtherMonth={false}
                weeks={[displayWeek]}
                filterMonth={weekFilterMonth}
                filterYear={weekFilterYear}
                onDayClick={onDayClick}
            />
        </div>
    );
}
