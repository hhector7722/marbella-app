'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, format, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { ChevronDown, ChevronUp } from 'lucide-react';
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
import { firstGivenName } from '@/lib/utils';

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
    expanded?: boolean;
    /**
     * Avisa de si los registros desbordan el alto compacto (1×1 con nombre).
     * true → el slot debe crecer; false → cabe como icono+nombre.
     */
    onExpandChange?: (expanded: boolean) => void;
};

/**
 * Fichajes del día visible del Master: franja roja con la fecha y, debajo,
 * la zona blanca con un registro por trabajador (nombre, entrada, salida).
 * Arranca en el día en curso; si no tiene fichajes, salta al último día con
 * registros. La navegación entre días se hace por las esquinas inferiores
 * (izquierda = día anterior, derecha = día siguiente, sin pasar de hoy), sin
 * indicador. La franja y cualquier registro abren el resumen del día
 * (DaySummaryModal, el mismo que /staff/history al pulsar un día); desde el
 * resumen se llega al detalle del trabajador.
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
    expanded = false,
    onExpandChange,
}: MasterTodayAttendanceWidgetProps) {
    const [loading, setLoading] = useState(true);
    const [today, setToday] = useState<string | null>(null);
    const [logs, setLogs] = useState<EnrichedTodayLog[]>([]);
    const [isSummaryModalOpen, setIsSummaryModalOpen] = useState(false);
    const [editingUserId, setEditingUserId] = useState<string | null>(null);

    const redBarRef = useRef<HTMLDivElement>(null);
    const logsBlockRef = useRef<HTMLDivElement>(null);
    const fitRef = useRef<HTMLDivElement>(null);
    const [fontScale, setFontScale] = useState({ date: 13, row: 11, inset: 9 });

    const hasExpandableLogs = logs.length >= 6;
    const visibleLogs = useMemo(
        () => (!expanded && hasExpandableLogs ? logs.slice(0, 4) : logs),
        [expanded, hasExpandableLogs, logs],
    );

    useEffect(() => {
        if (loading) return;
        if (!hasExpandableLogs && expanded) {
            onExpandChange?.(false);
        }
    }, [hasExpandableLogs, loading, expanded, onExpandChange]);

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
        const raw = format(new Date(`${today}T12:00:00`), "EEE d 'de' MMM", { locale: es });
        const short = raw.replace('.', '');
        return short.charAt(0).toUpperCase() + short.slice(1);
    }, [today]);

    // Medir la celda real (squircle en escritorio y móvil), el número de
    // fichajes y la anchura de sus nombres/horas. Nunca forzar 5–7 px fijos:
    // 1–2 fichajes pueden crecer; más filas o una salida reducen la escala.
    useEffect(() => {
        const element = fitRef.current;
        if (!element || typeof ResizeObserver === 'undefined') return;

        const update = () => {
            const width = element.clientWidth;
            const height = element.clientHeight;
            if (!width || !height) return;

            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            const family = getComputedStyle(element).fontFamily || 'sans-serif';
            const inset = Math.min(14, Math.max(8, width * 0.065));
            const dateText = dateLabel || 'Mié 28 de oct';
            const headerMax = Math.min(19, Math.max(12, width * 0.125));
            let dateSize = headerMax;
            if (context) {
                context.font = `700 12px ${family}`;
                const dateWidth = context.measureText(dateText).width;
                if (dateWidth > 0) dateSize = Math.min(dateSize, (width - 10) * 12 / dateWidth);
            }
            dateSize = Math.max(7, dateSize);

            const count = visibleLogs.length;
            const countFactor = count <= 2 ? 1 : count === 3 ? 0.96 : count === 4 ? 0.92 : 0.83;
            const idealFont = Math.min(19, Math.max(11, width * 0.15)) * countFactor;
            const moreControlHeight = hasExpandableLogs ? 16 : 0;
            const verticalSpace = Math.max(0, height - (dateSize * 1.3 + 6) - 12 - 4 - moreControlHeight);
            const heightLimit = count ? (verticalSpace / count - 2.5) / 1.28 : idealFont;
            let widthLimit = idealFont;
            if (context && count) {
                const available = Math.max(12, width - 2 * inset - 4);
                let largest = 0;
                for (const log of visibleLogs) {
                    context.font = `500 12px ${family}`;
                    const name = context.measureText(firstGivenName(log.first_name, 'Trabajador')).width;
                    context.font = `700 12px ${family}`;
                    const inTime = formatCompactHour(log.in_time) || '--:--';
                    const time = log.out_time ? `${inTime} - ${formatCompactHour(log.out_time)}` : inTime;
                    largest = Math.max(largest, name + context.measureText(time).width);
                }
                if (largest > 0) widthLimit = Math.min(widthLimit, available * 12 / largest);
            }
            // Si excepcionalmente el nombre es larguísimo, se parte en líneas
            // y la lista se desplaza: nunca se oculta ni se añade ellipsis.
            const rowSize = Math.max(8, Math.min(idealFont, widthLimit, heightLimit));
            const next = {
                date: Math.round(dateSize * 10) / 10,
                row: Math.round(rowSize * 10) / 10,
                inset: Math.round(inset),
            };
            setFontScale((previous) => (
                previous.date === next.date && previous.row === next.row && previous.inset === next.inset
                    ? previous : next
            ));
        };
        update();
        const observer = new ResizeObserver(update);
        observer.observe(element);
        return () => observer.disconnect();
    }, [dateLabel, hasExpandableLogs, visibleLogs]);

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
            <div ref={fitRef} className="relative flex h-full min-h-0 flex-col" data-fit="today" data-attendance-responsive="true">
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
                        <div className="flex shrink-0 items-stretch bg-gradient-to-b from-red-500 to-red-600 shadow-sm" ref={redBarRef}>
                            <button
                                type="button"
                                onClick={() => setIsSummaryModalOpen(true)}
                                aria-label={`Resumen de fichajes del ${dateLabel}`}
                                className="relative flex w-full min-w-0 items-center justify-center px-1 py-1"
                            >
                                <span data-attendance-date className="whitespace-nowrap font-bold leading-tight tracking-normal text-white drop-shadow-sm"
                                    style={{ fontSize: fontScale.date }}>
                                    {dateLabel}
                                </span>
                            </button>
                        </div>
                        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
                            {logs.length === 0 ? (
                                <EmptyState instance="master-today-none" variant="none" title="Sin fichajes" />
                            ) : (
                                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain [scrollbar-width:none]">
                                    <div className="my-auto flex w-full flex-col py-0.5" ref={logsBlockRef}>
                                        {visibleLogs.map((log) => {
                                            const isNoRegistered =
                                                log.event_type === 'no_registered' ||
                                                log.clock_out_show_no_registrada === true;
                                            return (
                                                <button
                                                    key={log.id}
                                                    type="button"
                                                    onClick={() => setIsSummaryModalOpen(true)}
                                                    data-attendance-row
                                                    className="flex w-full min-w-0 items-center justify-between gap-[3px] py-[1px] text-left transition-colors hover:bg-zinc-50"
                                                    style={{ paddingInline: fontScale.inset }}
                                                >
                                                    <span data-attendance-name
                                                        className="min-w-0 flex-1 whitespace-normal break-words font-medium leading-[1.18] text-zinc-700"
                                                        style={{ fontSize: fontScale.row }}>
                                                        {firstGivenName(log.first_name, 'Trabajador')}
                                                    </span>
                                                    <span data-attendance-hours
                                                        className="flex shrink-0 items-center gap-[2px] whitespace-nowrap font-bold leading-[1.18] tabular-nums"
                                                        style={{ fontSize: fontScale.row }}>
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
                                        {hasExpandableLogs && (
                                            <div className="flex w-full shrink-0 items-center justify-center">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (window.matchMedia('(min-width: 1024px)').matches) {
                                                            setIsSummaryModalOpen(true);
                                                        } else {
                                                            onExpandChange?.(!expanded);
                                                        }
                                                    }}
                                                    data-attendance-more
                                                    className="flex h-4 w-full items-center justify-center gap-1 text-[9px] text-zinc-500 transition-colors hover:text-zinc-700"
                                                    aria-label={expanded ? "Minimizar asistencia" : "Ver todos los fichajes"}
                                                >
                                                    <span>{expanded ? 'Menos' : `+${logs.length - visibleLogs.length}`}</span>
                                                    {expanded ? (
                                                        <ChevronUp size={10} className="stroke-[2.5]" />
                                                    ) : (
                                                        <ChevronDown size={10} className="stroke-[2.5]" />
                                                    )}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                            {/* Área de navegación propia, sin superponerse a los fichajes. */}
                            <div className="flex h-3 shrink-0">
                                <button
                                    type="button"
                                    onClick={goPrevDay}
                                    aria-label="Día anterior"
                                    className="h-full w-1/2"
                                />
                                <button
                                    type="button"
                                    onClick={goNextDay}
                                    disabled={!canGoNext}
                                    aria-label="Día siguiente"
                                    className="h-full w-1/2 disabled:pointer-events-none"
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