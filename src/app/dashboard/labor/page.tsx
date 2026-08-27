'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { User } from 'lucide-react';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    isToday,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { WorkerListSummary, WorkerPersonRow } from '@/components/staff/WorkerPersonRow';
import {
    filterVisiblePlantillaEmployees,
    PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import { trackUsageModalApply } from '@/lib/usage/client';
import {
    getLaborCostDayDetailSsot,
    getLaborCostPeriodSsot,
} from '@/app/actions/labor-cost-ssot';

type DayCell = { total: number; fixed: number; overtime: number };

type MonthSummaryPayload = {
    year: number;
    month: number;
    daysInMonth: number;
    totalFixed: number;
    totalOvertime: number;
    totalCost: number;
    byDate: Record<string, DayCell>;
    reconciliation?: {
        status: 'NO_SUMMARY' | 'WAITING_PAYROLLS' | 'RECONCILED' | 'PENDING_RECONCILIATION';
        totalSummary: number;
        totalPayrolls: number;
        difference: number;
        importedCount: number;
    };
};

type WorkerRow = {
    id: string;
    name: string | null;
    fixed: number;
    overtime: number;
    total: number;
    /** (Coste total del trabajador / venta neta del día) × 100 */
    laborPctOfSales: number | null;
    hasActivity: boolean;
    hasActiveContract: boolean;
    isEventual: boolean;
};

function parseLocalSafe(dateStr: string | null): Date {
    if (!dateStr) return new Date();
    const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Regla Zero-Display: lectura, 0 → espacio */
function formatEuroRead(n: number): string {
    if (n === 0 || Object.is(n, -0)) return ' ';
    return new Intl.NumberFormat('es-ES', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: n < 100 ? 2 : 0,
    }).format(n);
}

function dayInPeriod(isoDay: string, periodStart: string, periodEnd: string): boolean {
    const d = isoDay.split('T')[0];
    const a = periodStart.split('T')[0];
    const b = periodEnd.split('T')[0];
    return d >= a && d <= b;
}

function defaultFullMonthPeriod(): { start: string; end: string } {
    const t = new Date();
    return {
        start: format(startOfMonth(t), 'yyyy-MM-dd'),
        end: format(endOfMonth(t), 'yyyy-MM-dd'),
    };
}

/** Solo primer nombre (sin apellidos) para desglose */
function firstNameOnly(full: string | null): string {
    if (!full || !full.trim()) return '—';
    return full.trim().split(/\s+/)[0] ?? '—';
}

function laborPctTextClass(pct: number | null): string {
    if (pct === null || Number.isNaN(pct)) return 'text-zinc-400';
    return laborPctIndicatorClass(pct).split(' ')[0];
}

function formatWorkerPctLine(pct: number | null): string {
    if (pct === null || Number.isNaN(pct)) return '—';
    return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(pct)}%`;
}

/** Color del indicador: verde ≤25%, amarillo 26–35%, naranja 36–50%, rojo >50% */
function laborPctIndicatorClass(pct: number): string {
    if (pct > 50) return 'text-red-500 stroke-red-500';
    if (pct > 35) return 'text-orange-500 stroke-orange-500';
    if (pct > 25) return 'text-amber-400 stroke-amber-400';
    return 'text-emerald-600 stroke-emerald-600';
}

function LaborPctRing({
    percent,
    size = 44,
    strokeWidth = 5,
}: {
    /** 0–100 para el arco; si >100 se muestra anillo lleno (100%) */
    percent: number;
    size?: number;
    strokeWidth?: number;
}) {
    const arcPct = Math.max(0, Math.min(100, percent));
    const r = (size - strokeWidth) / 2;
    const c = 2 * Math.PI * r;
    const offset = c * (1 - arcPct / 100);
    const colorClass = laborPctIndicatorClass(percent);

    return (
        <svg
            width={size}
            height={size}
            className="shrink-0 -rotate-90"
            viewBox={`0 0 ${size} ${size}`}
            aria-hidden
        >
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                className="stroke-zinc-200"
                strokeWidth={strokeWidth}
            />
            <circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                className={cn('transition-all duration-500 ease-out', colorClass)}
                strokeWidth={strokeWidth}
                strokeDasharray={c}
                strokeDashoffset={offset}
                strokeLinecap="round"
            />
        </svg>
    );
}

function LaborPctRingCentered({
    percentRaw,
    size = 36,
}: {
    percentRaw: number | null;
    size?: number;
}) {
    const pct = percentRaw === null || Number.isNaN(percentRaw) ? null : Math.round(percentRaw * 10) / 10;
    const isOverCap = pct !== null && pct > 100;
    const pctDisplay = isOverCap ? 100 : (pct ?? 0);
    const textClass = laborPctTextClass(pct);

    return (
        <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
            <LaborPctRing percent={pctDisplay} size={size} strokeWidth={4} />
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className={cn('text-[9px] font-black tabular-nums leading-none tracking-tight sm:text-[10px]', textClass)}>
                    {pct === null ? '—' : `${pct}%`}
                </span>
            </div>
        </div>
    );
}

function ReconciliationBadge({
    reconciliation,
}: {
    reconciliation?: MonthSummaryPayload['reconciliation'];
}) {
    if (!reconciliation) return null;

    const { status, totalSummary, totalPayrolls, difference, importedCount } = reconciliation;

    if (status === 'RECONCILED') {
        return (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200/80 rounded-xl text-emerald-800 text-xs font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>🟢 Conciliado</span>
                <span className="text-emerald-700 font-mono">
                    ({formatEuroRead(totalPayrolls)} / {formatEuroRead(totalSummary)})
                </span>
            </div>
        );
    }

    if (status === 'PENDING_RECONCILIATION') {
        return (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200/80 rounded-xl text-amber-900 text-xs font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 shrink-0 animate-pulse" />
                <span>🟡 Pendiente de conciliar</span>
                <span className="text-amber-800 font-mono">
                    Importadas {importedCount} nóminas | Dif. pendiente: {formatEuroRead(difference)}
                </span>
            </div>
        );
    }

    if (status === 'WAITING_PAYROLLS') {
        return (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200/80 rounded-xl text-sky-900 text-xs font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span>⚪ Resumen Gestoría ({formatEuroRead(totalSummary)})</span>
                <span className="text-sky-700 font-normal">| Esperando nóminas individuales</span>
            </div>
        );
    }

    return (
        <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-600 text-xs font-medium">
            <span className="inline-block w-2 h-2 rounded-full bg-zinc-400 shrink-0" />
            <span>⚪ Sin nómina oficial de gestoría</span>
        </div>
    );
}

type ProfileOption = {
    id: string;
    first_name: string;
    last_name: string;
    avatar_url?: string | null;
};

export default function LaborHistoryPage() {
    const supabase = useMemo(() => createClient(), []);
    const pathname = usePathname();

    const def = defaultFullMonthPeriod();
    const [periodStart, setPeriodStart] = useState<string>(def.start);
    const [periodEnd, setPeriodEnd] = useState<string>(def.end);
    /** Mes del calendario (sincronizado con el período consultado) */
    const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<MonthSummaryPayload | null>(null);
    /** Venta neta (cierres) del mismo periodo que el coste laboral */
    const [periodNetSales, setPeriodNetSales] = useState<number | null>(null);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
    /** Último filtro aplicado (para etiqueta y modal inicial) */
    const [appliedFilter, setAppliedFilter] = useState<TimeFilterValue>(() => {
        const n = new Date();
        return { kind: 'month', year: n.getFullYear(), month: n.getMonth() + 1 };
    });

    /** null = todos los trabajadores */
    const [workerFilterId, setWorkerFilterId] = useState<string | null>(null);
    const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
    const [employees, setEmployees] = useState<ProfileOption[]>([]);

    const [detailOpen, setDetailOpen] = useState(false);
    const [showNoActivity, setShowNoActivity] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
    const [dayDetail, setDayDetail] = useState<{
        date: string;
        totalFixed: number;
        totalOvertime: number;
        totalCost: number;
        dayNetSales: number;
        workers: WorkerRow[];
    } | null>(null);

    const calendarDays = useMemo(() => {
        const startVisible = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [viewMonth]);

    const laborPctOfPeriod = useMemo(() => {
        if (!summary || periodNetSales === null) return null;
        if (periodNetSales <= 0) return null;
        return (summary.totalCost / periodNetSales) * 100;
    }, [summary, periodNetSales]);

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        console.log("[EFFECT] profiles fetch useEffect");
        let cancelled = false;
        void (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select(PLANTILLA_EMPLOYEE_SELECT)
                .eq('visible_in_plantilla', true)
                .order('first_name');
            if (cancelled || error) return;
            console.log("[STATE] setEmployees");
            setEmployees(filterVisiblePlantillaEmployees((data || []) as ProfileOption[]));
        })();
        return () => {
            cancelled = true;
        };
    }, [supabase]);

    const fetchPeriodSummary = useCallback(async () => {
        setLoading(true);
        setPeriodNetSales(null);
        try {
            const start = parseLocalSafe(periodStart);
            const end = parseLocalSafe(periodEnd);
            if (end < start) {
                setSummary(null);
                setPeriodNetSales(null);
                return;
            }

            const byDate: Record<string, DayCell> = {};
            const todayStr = format(new Date(), 'yyyy-MM-dd');

            const period = await getLaborCostPeriodSsot({
                startDate: periodStart.split('T')[0],
                endDate: periodEnd.split('T')[0],
                userId: workerFilterId ?? null,
            });

            for (const [iso, cell] of Object.entries(period.byDate)) {
                if (iso > todayStr) continue;
                if (!dayInPeriod(iso, periodStart, periodEnd)) continue;
                byDate[iso] = {
                    total: Number(cell.total) || 0,
                    fixed: Number(cell.fixed) || 0,
                    overtime: Number(cell.overtime) || 0,
                };
            }

            if (period.missingPayrollMonths.length > 0) {
                toast.warning(
                    `Falta nómina oficial (payroll_monthly_totals) para: ${period.missingPayrollMonths.join(', ')}. El fijo de esos meses queda a 0.`,
                );
            }

            setSummary({
                year: start.getFullYear(),
                month: start.getMonth() + 1,
                daysInMonth: Object.keys(byDate).length,
                totalFixed: period.totalFixed,
                totalOvertime: period.totalOvertime,
                totalCost: period.totalCost,
                byDate,
                reconciliation: period.reconciliation,
            });

            const effectiveSalesEnd =
                periodEnd > todayStr ? todayStr : periodEnd.split('T')[0];
            const { data: salesData, error: salesErr } = await supabase.rpc('get_cash_closings_summary', {
                p_start_date: periodStart.split('T')[0],
                p_end_date: effectiveSalesEnd,
            });
            if (salesErr) {
                console.warn(salesErr);
                setPeriodNetSales(0);
            } else {
                const raw = salesData as { totalNet?: number } | null;
                setPeriodNetSales(Number(raw?.totalNet) || 0);
            }
        } catch (e) {
            console.error(e);
            toast.error('No se pudo cargar el coste laboral. ¿Permisos de gestor?');
            setSummary(null);
            setPeriodNetSales(null);
        } finally {
            setLoading(false);
        }
    }, [supabase, periodStart, periodEnd, workerFilterId]);

    useEffect(() => {
        fetchPeriodSummary();
    }, [fetchPeriodSummary]);

    const handlePrevMonth = () => {
        const newMonth = subMonths(viewMonth, 1);
        const s = startOfMonth(newMonth);
        const e = endOfMonth(newMonth);
        setViewMonth(s);
        setPeriodStart(format(s, 'yyyy-MM-dd'));
        setPeriodEnd(format(e, 'yyyy-MM-dd'));
        setAppliedFilter({
            kind: 'month',
            year: s.getFullYear(),
            month: s.getMonth() + 1,
        });
    };

    const handleNextMonth = () => {
        const newMonth = addMonths(viewMonth, 1);
        const s = startOfMonth(newMonth);
        const e = endOfMonth(newMonth);
        setViewMonth(s);
        setPeriodStart(format(s, 'yyyy-MM-dd'));
        setPeriodEnd(format(e, 'yyyy-MM-dd'));
        setAppliedFilter({
            kind: 'month',
            year: s.getFullYear(),
            month: s.getMonth() + 1,
        });
    };

    const handleApplyTimeFilter = (val: TimeFilterValue) => {
        setAppliedFilter(val);
        const curYear = new Date().getFullYear();

        if (val.kind === 'month') {
            const dt = new Date(val.year, val.month - 1, 1);
            setViewMonth(dt);
            setPeriodStart(format(startOfMonth(dt), 'yyyy-MM-dd'));
            setPeriodEnd(format(endOfMonth(dt), 'yyyy-MM-dd'));
        } else if (val.kind === 'year') {
            const dt = new Date(val.year, 0, 1);
            setViewMonth(dt);
            setPeriodStart(`${val.year}-01-01`);
            setPeriodEnd(`${val.year}-12-31`);
        } else if (val.kind === 'range' || val.kind === 'week') {
            const s = parseLocalSafe(val.startDate);
            const e = parseLocalSafe(val.endDate);
            setViewMonth(startOfMonth(s));
            setPeriodStart(format(s, 'yyyy-MM-dd'));
            setPeriodEnd(format(e, 'yyyy-MM-dd'));
        } else if (val.kind === 'date') {
            const s = parseLocalSafe(val.date);
            setViewMonth(startOfMonth(s));
            setPeriodStart(format(s, 'yyyy-MM-dd'));
            setPeriodEnd(format(s, 'yyyy-MM-dd'));
        }
    };

    const [includeAllContracted, setIncludeAllContracted] = useState(false);

    const openDayDetail = useCallback(
        async (day: Date, optionsOverride?: { includeAll?: boolean }) => {
            const key = format(day, 'yyyy-MM-dd');
            const showAll = optionsOverride?.includeAll ?? includeAllContracted;
            trackUsageModalApply(
                'labor-day-detail',
                'Detalle día laboral',
                pathname,
                format(day, 'd MMM yyyy', { locale: es }),
                { selectedDate: key, includeAllContracted: String(showAll) }
            );
            setSelectedDayStr(key);
            setDetailOpen(true);
            setDetailLoading(true);
            setDayDetail(null);
            try {
                const labor = await getLaborCostDayDetailSsot({
                    dateYmd: key,
                    userId: workerFilterId ?? null,
                    includeAllContracted: true,
                });

                if (labor.isPayrollPending) {
                    toast.warning(
                        'Falta nómina oficial para este mes: el coste fijo del día es 0 €.',
                    );
                }

                const workers: WorkerRow[] = labor.workers.map((w) => ({
                    id: w.id,
                    name: w.name,
                    fixed: w.fixed,
                    overtime: w.overtime,
                    total: w.total,
                    laborPctOfSales: w.laborPctOfSales,
                    hasActivity: w.hasActivity,
                    hasActiveContract: w.hasActiveContract,
                    isEventual: w.isEventual,
                }));

                setDayDetail({
                    date: key,
                    totalFixed: labor.totalFixed,
                    totalOvertime: labor.totalOvertime,
                    totalCost: labor.totalCost,
                    dayNetSales: labor.netSales,
                    workers,
                });
            } catch (e) {
                console.error(e);
                toast.error('Error al cargar el desglose del día');
                setDayDetail(null);
            } finally {
                setDetailLoading(false);
            }
        },
        [workerFilterId, pathname, includeAllContracted],
    );

    const closeDetail = useCallback(() => {
        setDetailOpen(false);
        setShowNoActivity(false);
        setDayDetail(null);
        setSelectedDayStr(null);
    }, []);

    return (
            <>
            <DashboardDetailLayout
                title="Coste laboral"
                showBackButton={false}
                template="list"
                maxWidthClass="max-w-none"
                className="month-cal-shell"
                cardClassName="month-cal-card"
                contentClassName="flex flex-col min-h-0 p-0"
                periodSlot={
                    <PeriodNav
                        label={format(viewMonth, 'MMMM yyyy', { locale: es })}
                        onPrev={handlePrevMonth}
                        onNext={handleNextMonth}
                        onLabelClick={() => setIsTimeFilterOpen(true)}
                    />
                }
                rightSlot={
                    <div className="flex items-center gap-1 md:gap-2 shrink-0 text-white">
                            <PeriodFilterButton instance="labor-period-filter" onClick={() => setIsTimeFilterOpen(true)} />
                            <div className="relative shrink-0">
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="labor-filter-worker"
                                    onClick={() => setIsWorkerModalOpen(true)}
                                    className="relative shrink-0"
                                    aria-label="Filtrar por trabajador"
                                    icon={<User size={24} strokeWidth={2.25} />}
                                />
                            </div>
                    </div>
                }
            >
                    <div className="px-2 pt-0 pb-2 md:px-3 md:pt-0 flex flex-col month-cal-body min-h-0">
                        <div className="grid grid-cols-4 gap-0.5 sm:gap-1 mb-1 py-1 shrink-0 min-w-0">
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Coste
                                </span>
                                <span className="text-[11px] font-black leading-tight text-rose-500 tabular-nums sm:text-xs md:text-sm">
                                    {summary ? formatEuroRead(summary.totalCost) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Fijo
                                </span>
                                <span className="text-[11px] font-black leading-tight text-zinc-700 tabular-nums sm:text-xs md:text-sm">
                                    {summary ? formatEuroRead(summary.totalFixed) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Extras
                                </span>
                                <span className="text-[11px] font-black leading-tight text-amber-600 tabular-nums sm:text-xs md:text-sm">
                                    {summary ? formatEuroRead(summary.totalOvertime) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    M.O./Vtas
                                </span>
                                <LaborPctRingCentered percentRaw={laborPctOfPeriod} size={36} />
                            </div>
                        </div>

                        <div className="mb-1 shrink-0">
                            <ReconciliationBadge reconciliation={summary?.reconciliation} />
                        </div>

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <LoadingSpinner size="lg" className="text-ds-marca" />
                            </div>
                        ) : (
                            <div className="mx-auto w-[97%] min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] month-cal-grid-wrap flex flex-col flex-1 min-h-0">
                                <div className="grid grid-cols-7 border-b border-gray-100 shrink-0">
                                    {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, index) => (
                                        <div
                                            key={d}
                                            className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-sm border-r border-white/30 last:border-r-0"
                                        >
                                            <span className="text-[9px] font-bold text-white uppercase tracking-wider truncate px-0.5 drop-shadow-sm leading-none">
                                                <span className="hidden md:inline">{d}</span>
                                                <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="grid grid-cols-7 month-cal-days">
                                    {calendarDays.map((day) => {
                                        const key = format(day, 'yyyy-MM-dd');
                                        const isFutureDay = key > todayStr;
                                        const cell = summary?.byDate[key];
                                        const total = cell?.total ?? 0;
                                        const isViewMonthDay = isSameMonth(day, viewMonth);
                                        const inPeriod = dayInPeriod(key, periodStart, periodEnd);
                                        const showData =
                                            isViewMonthDay && inPeriod && !isFutureDay;
                                        const clickable = showData;
                                        const todayCell = isToday(day);

                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => clickable && openDayDetail(day)}
                                                disabled={!clickable}
                                                className={cn(
                                                    'group relative flex flex-col text-left min-h-[52px] md:min-h-[100px] transition-colors p-0.5 sm:p-1 month-cal-cell',
                                                    'border-r border-gray-100 last:border-r-0 bg-white',
                                                    !isViewMonthDay && 'opacity-25 pointer-events-none',
                                                    isViewMonthDay &&
                                                        isFutureDay &&
                                                        'cursor-default bg-zinc-50/90',
                                                    isViewMonthDay &&
                                                        !inPeriod &&
                                                        !isFutureDay &&
                                                        'opacity-60 cursor-not-allowed bg-zinc-50/90',
                                                    clickable &&
                                                        'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer',
                                                    todayCell && isViewMonthDay && !isFutureDay && 'bg-blue-50/10',
                                                )}
                                            >
                                                <span
                                                    className={cn(
                                                        'absolute top-1 right-1 text-[9px] font-bold',
                                                        todayCell && isViewMonthDay
                                                            ? 'text-blue-600'
                                                            : 'text-gray-400',
                                                    )}
                                                >
                                                    {format(day, 'd')}
                                                </span>
                                                <div className="flex-1 flex flex-col justify-center items-center min-h-0 pt-4">
                                                    <span
                                                        className={cn(
                                                            'text-[9px] min-[370px]:text-[11px] md:text-lg font-black tabular-nums leading-none',
                                                            showData ? 'text-zinc-900' : 'text-zinc-400',
                                                        )}
                                                    >
                                                        {showData ? formatEuroRead(total) : ' '}
                                                    </span>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
            </DashboardDetailLayout>

            <Modal
                open={detailOpen}
                onClose={closeDetail}
                variant="standard"
                layer="base"
                instance="labor-cost-day-detail"
                usageId="labor-cost-day-detail"
                usageLabel="Detalle día laboral"
                title={selectedDayStr ? format(parseLocalSafe(selectedDayStr), 'EEEE · d MMMM yyyy', { locale: es }) : 'Coste laboral'}
            >
                <div>
                    {detailLoading ? (
                        <div className="flex justify-center py-20">
                            <LoadingSpinner size="lg" className="text-zinc-900" />
                        </div>
                    ) : dayDetail ? (
                        <div className="flex flex-col">
                            <WorkerListSummary
                                metrics={[
                                    { label: 'Fijo', value: formatEuroRead(dayDetail.totalFixed) },
                                    { label: 'Extras', value: formatEuroRead(dayDetail.totalOvertime) },
                                    { label: 'Ventas', value: formatEuroRead(dayDetail.dayNetSales) },
                                ]}
                                total={formatEuroRead(dayDetail.totalCost)}
                            />

                            <div className="mb-1 flex justify-end">
                                <button
                                    type="button"
                                    onClick={() => setShowNoActivity(!showNoActivity)}
                                    className="py-1 text-[12px] font-medium text-zinc-400"
                                >
                                    {showNoActivity ? 'Ocultar inactivos' : 'Mostrar todos'}
                                </button>
                            </div>

                            <div>
                                {dayDetail.workers
                                    .filter((w) => showNoActivity || w.hasActivity)
                                    .sort((a, b) => Number(b.hasActivity) - Number(a.hasActivity) || b.total - a.total)
                                    .map((w) => (
                                    <WorkerPersonRow
                                        key={w.id}
                                        name={firstNameOnly(w.name)}
                                        muted={!w.hasActivity}
                                        subtitle={
                                            <>
                                                <span>Fijo {formatEuroRead(w.fixed)}</span>
                                                {w.overtime > 0 ? (
                                                    <>
                                                        <span className="text-zinc-300">·</span>
                                                        <span>Extras {formatEuroRead(w.overtime)}</span>
                                                    </>
                                                ) : null}
                                            </>
                                        }
                                        value={formatEuroRead(w.total)}
                                    />
                                ))}
                            </div>

                            <p className="mt-6 text-center text-[11px] leading-relaxed text-zinc-400">
                                El coste fijo corresponde al prorrateo diario del coste laboral mensual.
                            </p>
                        </div>
                    ) : null}
                </div>
            </Modal>

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                onApply={handleApplyTimeFilter}
                allowedKinds={['month', 'year', 'range', 'week', 'date']}
                initialValue={appliedFilter}
            />
            <StaffSelectionModal
                isOpen={isWorkerModalOpen}
                onClose={() => setIsWorkerModalOpen(false)}
                employees={employees}
                onSelect={(emp) => setWorkerFilterId(emp.id)}
            />
        </>
    );
}
