'use client';

import { useEffect, useMemo, useState } from 'react';
import { eachDayOfInterval, endOfWeek, format, isSameDay, startOfWeek } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import {
    PlantillaWeekCard,
    type PlantillaDay,
    type PlantillaDayLog,
    type PlantillaWeek,
} from '@/app/staff/history/PlantillaWeekCard';
import { DaySummaryModal, type DaySummaryLog } from '@/components/modals/DaySummaryModal';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    formatMadridHmFromIso,
    formatYmdInMadrid,
    madridRangeUtcIso,
} from '@/lib/madrid-date-bounds';
import type { PlantillaEmployeeRow } from '@/lib/staff/plantilla-employees';

type WeekLogRow = {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    event_type?: string | null;
    clock_out_show_no_registrada?: boolean | null;
};

type EnrichedLogRow = WeekLogRow & {
    first_name: string;
    last_name: string;
    in_time: string;
    out_time: string;
};

type MasterPlantillaAttendanceWidgetProps = {
    userRole: string;
    viewerEmail: string;
    /** Plantilla visible: rosters de los modales de día y de asistencia. */
    employees: PlantillaEmployeeRow[];
};

/**
 * Resumen semanal de asistencia del Master: la semana de plantilla de
 * /staff/history, con los registros de todos los trabajadores del día.
 * Pulsar un día abre el resumen de fichajes (DaySummaryModal); desde ahí se
 * entra en el detalle de un trabajador (AttendanceDetailModal).
 */
export function MasterPlantillaAttendanceWidget({
    userRole,
    viewerEmail,
    employees,
}: MasterPlantillaAttendanceWidgetProps) {
    const [loading, setLoading] = useState(true);
    const [week, setWeek] = useState<PlantillaWeek | null>(null);
    const [dayLogsByDate, setDayLogsByDate] = useState<Record<string, DaySummaryLog[]>>({});
    const [summaryDate, setSummaryDate] = useState<string | null>(null);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [editingDate, setEditingDate] = useState<string | null>(null);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const employeesOption = useMemo(
        () =>
            employees.map((employee) => ({
                id: employee.id,
                first_name: employee.first_name ?? '',
                last_name: employee.last_name ?? '',
            })),
        [employees],
    );

    useEffect(() => {
        let cancelled = false;
        const supabase = createClient();
        const today = new Date();
        const weekStart = startOfWeek(today, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
        const weekStartYmd = format(weekStart, 'yyyy-MM-dd');
        const weekEndYmd = format(weekEnd, 'yyyy-MM-dd');
        const { startIso, endIso } = madridRangeUtcIso(weekStartYmd, weekEndYmd);

        (async () => {
            try {
                const { data: logsRaw } = await supabase
                    .from('time_logs')
                    .select('id, user_id, clock_in, clock_out, event_type, clock_out_show_no_registrada')
                    .gte('clock_in', startIso)
                    .lte('clock_in', endIso);

                const rawLogs: WeekLogRow[] = (logsRaw || []) as WeekLogRow[];
                const userIds = [...new Set(rawLogs.map((log) => log.user_id))];
                let profiles: { id: string; first_name?: string; last_name?: string }[] = [];
                if (userIds.length > 0) {
                    const { data: profilesData } = await supabase
                        .from('profiles')
                        .select('id, first_name, last_name')
                        .in('id', userIds);
                    profiles = (profilesData || []).filter((p) => {
                        const name = (p.first_name || '').trim().toLowerCase();
                        return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
                    });
                }
                if (cancelled) return;

                const profileMap = new Map(profiles.map((p) => [p.id, p]));
                const enrichedLogs: EnrichedLogRow[] = rawLogs.map((log: WeekLogRow) => {
                    const p = profileMap.get(log.user_id);
                    return {
                        ...log,
                        first_name: p?.first_name ?? '',
                        last_name: p?.last_name ?? '',
                        in_time: formatMadridHmFromIso(log.clock_in) ?? '',
                        out_time: log.clock_out ? (formatMadridHmFromIso(log.clock_out) ?? '') : '',
                    };
                });

                const calendarDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
                const days = calendarDays.map((day): PlantillaDay => {
                    const dayYmd = format(day, 'yyyy-MM-dd');
                    const dayLogs = enrichedLogs.filter(
                        (l) => formatYmdInMadrid(l.clock_in) === dayYmd,
                    );
                    const logs: PlantillaDayLog[] = dayLogs.map((l) => ({
                        id: l.id,
                        user_id: l.user_id,
                        first_name: l.first_name,
                        last_name: l.last_name,
                        clock_in: l.clock_in,
                        clock_out: l.clock_out,
                        event_type: l.event_type || 'regular',
                        clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
                        in_time: l.in_time,
                        out_time: l.out_time,
                    }));
                    return {
                        date: dayYmd,
                        dayNumber: day.getDate(),
                        dayName: format(day, 'EEE', { locale: es }),
                        isToday: isSameDay(day, today),
                        isOtherMonth: day.getMonth() !== today.getMonth() || day.getFullYear() !== today.getFullYear(),
                        logs,
                    };
                });

                const byDate: Record<string, DaySummaryLog[]> = {};
                for (const d of days) {
                    byDate[d.date] = d.logs.map((l) => ({
                        id: l.id,
                        user_id: l.user_id,
                        first_name: l.first_name,
                        last_name: l.last_name,
                        employee_name: l.first_name,
                        in_time: l.in_time,
                        out_time: l.out_time,
                        event_type: l.event_type,
                        clock_out_show_no_registrada: l.clock_out_show_no_registrada,
                    }));
                }
                setWeek({ weekNumber: 1, startDate: weekStartYmd, days });
                setDayLogsByDate(byDate);
            } catch (err) {
                console.error(err);
                toast.error('No se pudo cargar la asistencia de la semana');
                setWeek(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [reloadKey]);

    const handleDayClick = (date: string) => {
        setSummaryDate(date);
        setIsSummaryModalOpen(true);
    };

    const handleSelectLogFromSummary = (userId: string) => {
        setEditingDate(summaryDate);
        setEditingUserId(userId);
        setIsSummaryModalOpen(false);
    };

    const handleRefresh = () => {
        setReloadKey((key) => key + 1);
    };

    return (
        <>
            <div className="relative h-full min-h-0" data-fit="week">
                {loading ? (
                    <div className="absolute inset-0 z-10 flex items-center justify-center" role="status" aria-label="Cargando asistencia">
                        <LoadingSpinner size="md" className="text-white" />
                    </div>
                ) : null}
                {week ? (
                    <MonthCalendarFrame flush data-week-summary="true">
                        <div className="month-cal-weeks">
                            <PlantillaWeekCard
                                week={week}
                                maxRows={6}
                                onDayClick={handleDayClick}
                                timeSeparator="-"
                                showRowDividers={false}
                                inTimeClassName="text-emerald-700"
                                outTimeClassName="text-rose-700"
                                timeMono={false}
                                hideSeparatorWhenNoOut
                            />
                        </div>
                    </MonthCalendarFrame>
                ) : !loading ? (
                    <EmptyState instance="master-week-none" variant="none" title="Sin datos" />
                ) : null}
            </div>

            <DaySummaryModal
                isOpen={isSummaryModalOpen}
                onClose={() => setIsSummaryModalOpen(false)}
                date={summaryDate ? new Date(`${summaryDate}T12:00:00`) : null}
                logs={summaryDate ? (dayLogsByDate[summaryDate] ?? []) : []}
                onSelectLog={handleSelectLogFromSummary}
                employees={employeesOption}
                onFichajeCreated={handleRefresh}
                allowCreateFichaje
                userRole={userRole}
                viewerEmail={viewerEmail}
            />

            <AttendanceDetailModal
                isOpen={!!editingDate && !!editingUserId}
                onClose={() => {
                    setEditingDate(null);
                    setEditingUserId(null);
                }}
                date={editingDate ? new Date(`${editingDate}T12:00:00`) : null}
                userId={editingUserId}
                userRole={userRole}
                viewerEmail={viewerEmail}
                onSuccess={handleRefresh}
                employees={employeesOption}
            />
        </>
    );
}