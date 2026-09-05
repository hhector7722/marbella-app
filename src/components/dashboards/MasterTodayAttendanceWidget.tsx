'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';
import { DaySummaryModal, type DaySummaryLog } from '@/components/modals/DaySummaryModal';
import { AttendanceDetailModal } from '@/components/modals/AttendanceDetailModal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { EmptyState } from '@/components/ui/EmptyState';
import {
    formatMadridHmFromIso,
    formatYmdInMadrid,
    madridDayUtcRangeIso,
} from '@/lib/madrid-date-bounds';
import type { PlantillaEmployeeRow } from '@/lib/staff/plantilla-employees';

type TodayLogRow = {
    id: string;
    user_id: string;
    clock_in: string;
    clock_out: string | null;
    event_type?: string | null;
    clock_out_show_no_registrada?: boolean | null;
};

type EnrichedTodayLog = TodayLogRow & {
    first_name: string;
    last_name: string;
    in_time: string;
    out_time: string;
};

type MasterTodayAttendanceWidgetProps = {
    userRole: string;
    viewerEmail: string;
    /** Plantilla visible: rosters de los modales de día y de asistencia. */
    employees: PlantillaEmployeeRow[];
};

/**
 * Fichajes del día visible del Master: franja roja con la fecha y, debajo,
 * la zona blanca con un registro por trabajador (nombre, entrada, salida).
 * Arranca en el día en curso; si no tiene fichajes, salta al último día con
 * registros. La navegación entre días se hace por las esquinas inferiores
 * (izquierda = día anterior, derecha = día siguiente, sin pasar de hoy), sin
 * indicador. La franja abre el resumen del día (DaySummaryModal); un registro
 * abre el detalle del trabajador.
 */

/** Hora compacta del mosaico: «H», con minutos solo cuando son :30. */
function formatCompactHour(hhmm: string): string {
    if (!hhmm) return hhmm;
    const [h, m] = hhmm.split(':');
    const minutes = Number(m);
    return minutes === 30 ? `${Number(h)}:30` : `${Number(h)}`;
}

export function MasterTodayAttendanceWidget({
    userRole,
    viewerEmail,
    employees,
}: MasterTodayAttendanceWidgetProps) {
    const [loading, setLoading] = useState(true);
    const [today, setToday] = useState<string | null>(null);
    const [logs, setLogs] = useState<EnrichedTodayLog[]>([]);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);

    const employeesOption = useMemo(
        () =>
            employees.map((employee) => ({
                id: employee.id,
                first_name: employee.first_name ?? '',
                last_name: employee.last_name ?? '',
            })),
        [employees],
    );

    const dateLabel = useMemo(() => {
        if (!today) return '';
        const raw = format(new Date(`${today}T12:00:00`), "EEEE d 'de' MMM", { locale: es });
        return raw.charAt(0).toUpperCase() + raw.slice(1);
    }, [today]);

    const loadDay = useCallback(async (ymd: string, isCancelled?: () => boolean) => {
        const supabase = createClient();
        const { startIso, endIso } = madridDayUtcRangeIso(ymd);

        setLoading(true);
        try {
            const { data: logsRaw } = await supabase
                .from('time_logs')
                .select('id, user_id, clock_in, clock_out, event_type, clock_out_show_no_registrada')
                .gte('clock_in', startIso)
                .lte('clock_in', endIso);

            if (isCancelled?.()) return;

            const rawLogs: TodayLogRow[] = (logsRaw || []) as TodayLogRow[];
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
            if (isCancelled?.()) return;

            const profileMap = new Map(profiles.map((p) => [p.id, p]));
            const enriched: EnrichedTodayLog[] = rawLogs.map((log: TodayLogRow) => {
                const p = profileMap.get(log.user_id);
                return {
                    ...log,
                    first_name: p?.first_name ?? '',
                    last_name: p?.last_name ?? '',
                    in_time: formatMadridHmFromIso(log.clock_in) ?? '',
                    out_time: log.clock_out ? (formatMadridHmFromIso(log.clock_out) ?? '') : '',
                };
            });

            setToday(ymd);
            setLogs(enriched);
        } catch (err) {
            if (isCancelled?.()) return;
            console.error(err);
            toast.error('No se pudo cargar la asistencia del día');
            setToday(ymd);
            setLogs([]);
        } finally {
            if (!isCancelled?.()) setLoading(false);
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        const supabase = createClient();

        (async () => {
            try {
                const todayYmd = formatYmdInMadrid(new Date());
                const { startIso, endIso } = madridDayUtcRangeIso(todayYmd);

                const { data: todayRaw } = await supabase
                    .from('time_logs')
                    .select('id')
                    .gte('clock_in', startIso)
                    .lte('clock_in', endIso);

                if (cancelled) return;

                if ((todayRaw || []).length > 0) {
                    await loadDay(todayYmd, () => cancelled);
                    return;
                }

                const { data: lastLog } = await supabase
                    .from('time_logs')
                    .select('clock_in')
                    .lte('clock_in', endIso)
                    .order('clock_in', { ascending: false })
                    .limit(1);

                if (cancelled) return;

                const lastYmd = lastLog?.[0]?.clock_in ? formatYmdInMadrid(lastLog[0].clock_in) : null;
                await loadDay(lastYmd ?? todayYmd, () => cancelled);
            } catch (err) {
                console.error(err);
                if (!cancelled) {
                    setLoading(false);
                    setToday(formatYmdInMadrid(new Date()));
                    setLogs([]);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [loadDay]);

    const goPrevDay = useCallback(() => {
        if (!today) return;
        const prev = subDays(new Date(`${today}T12:00:00`), 1);
        void loadDay(format(prev, 'yyyy-MM-dd'));
    }, [today, loadDay]);

    const goNextDay = useCallback(() => {
        if (!today) return;
        const next = addDays(new Date(`${today}T12:00:00`), 1);
        void loadDay(format(next, 'yyyy-MM-dd'));
    }, [today, loadDay]);

    const canGoNext = useMemo(() => {
        if (!today) return false;
        return today < formatYmdInMadrid(new Date());
    }, [today]);

    const dayLogs: DaySummaryLog[] = useMemo(
        () =>
            logs.map((l) => ({
                id: l.id,
                user_id: l.user_id,
                first_name: l.first_name,
                last_name: l.last_name,
                employee_name: l.first_name,
                in_time: l.in_time,
                out_time: l.out_time,
                event_type: l.event_type ?? undefined,
                clock_out_show_no_registrada: l.clock_out_show_no_registrada === true,
            })),
        [logs],
    );

    const handleRefresh = () => {
        if (today) void loadDay(today);
    };

    return (
        <>
            <div className="relative flex h-full min-h-0 flex-col" data-fit="today">
                {loading ? (
                    <div
                        className="absolute inset-0 z-10 flex items-center justify-center"
                        role="status"
                        aria-label="Cargando asistencia del día"
                    >
                        <LoadingSpinner size="md" className="text-white" />
                    </div>
                ) : null}
                {today ? (
                    <>
                        <div className="flex shrink-0 items-stretch bg-gradient-to-b from-red-500 to-red-600 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setIsSummaryModalOpen(true)}
                                aria-label={`Resumen de fichajes del ${dateLabel}`}
                                className="relative flex w-full min-w-0 items-center justify-center px-1 py-1 before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:min-w-[var(--tactil-minimo)] before:content-['']"
                            >
                                <span className="truncate text-[6px] font-bold leading-none tracking-wide text-white drop-shadow-sm">
                                    {dateLabel}
                                </span>
                            </button>
                        </div>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                            {logs.length === 0 ? (
                                <EmptyState instance="master-today-none" variant="none" title="Sin fichajes" />
                            ) : (
                                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                                    {logs.map((log) => {
                                        const isNoRegistered =
                                            log.event_type === 'no_registered' ||
                                            log.clock_out_show_no_registrada === true;
                                        return (
                                            <button
                                                key={log.id}
                                                type="button"
                                                onClick={() => setEditingUserId(log.user_id)}
                                                className="relative flex w-full min-w-0 items-center justify-between gap-1 px-2 py-1.5 text-left transition-colors hover:bg-zinc-50 before:absolute before:inset-0 before:-m-1 before:min-h-[var(--tactil-minimo)] before:content-['']"
                                            >
                                                <span className="min-w-0 flex-1 truncate text-[7px] font-medium leading-none text-zinc-700">
                                                    {log.first_name}
                                                </span>
                                                <span className="flex shrink-0 items-center gap-0.5 text-[7px] font-bold leading-none tabular-nums">
                                                    <span className={isNoRegistered ? 'text-rose-700' : 'text-emerald-700'}>
                                                        {formatCompactHour(log.in_time) || '--:--'}
                                                    </span>
                                                    {log.out_time ? (
                                                        <>
                                                            <span className="font-normal text-zinc-400">-</span>
                                                            <span className="text-rose-700">
                                                                {formatCompactHour(log.out_time)}
                                                            </span>
                                                        </>
                                                    ) : null}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                            <div className="flex shrink-0 items-stretch">
                                <button
                                    type="button"
                                    onClick={goPrevDay}
                                    aria-label="Día anterior"
                                    className="flex h-12 flex-1 items-start justify-start"
                                />
                                <button
                                    type="button"
                                    onClick={goNextDay}
                                    disabled={!canGoNext}
                                    aria-label="Día siguiente"
                                    className="flex h-12 flex-1 items-start justify-end disabled:pointer-events-none"
                                />
                            </div>
                        </div>
                    </>
                ) : !loading ? (
                    <EmptyState instance="master-today-none" variant="none" title="Sin datos" />
                ) : null}
            </div>

            <DaySummaryModal
                isOpen={isSummaryModalOpen}
                onClose={() => setIsSummaryModalOpen(false)}
                date={today ? new Date(`${today}T12:00:00`) : null}
                logs={dayLogs}
                onSelectLog={(userId) => {
                    setEditingUserId(userId);
                    setIsSummaryModalOpen(false);
                }}
                employees={employeesOption}
                onFichajeCreated={handleRefresh}
                allowCreateFichaje
                userRole={userRole}
                viewerEmail={viewerEmail}
            />

            <AttendanceDetailModal
                isOpen={!!editingUserId}
                onClose={() => setEditingUserId(null)}
                date={today ? new Date(`${today}T12:00:00`) : null}
                userId={editingUserId}
                userRole={userRole}
                viewerEmail={viewerEmail}
                onSuccess={handleRefresh}
                employees={employeesOption}
            />
        </>
    );
}