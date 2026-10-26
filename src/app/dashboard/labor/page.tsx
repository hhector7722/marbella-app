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
import { Notice } from '@/components/ui/Notice';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { PeriodNav, PeriodFilterButton } from '@/components/time/PeriodNav';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { chunkCalendarWeeks } from '@/lib/month-calendar-weeks';
import { MonthCalendarFrame } from '@/components/time/MonthCalendarFrame';
import {
    filterVisiblePlantillaEmployees,
    PLANTILLA_EMPLOYEE_SELECT,
} from '@/lib/staff/plantilla-employees';
import { trackUsageModalApply } from '@/lib/usage/client';
import {
    getLaborCostDayDetailSsot,
    getLaborCostPeriodSsot,
} from '@/app/actions/labor-cost-ssot';
import { formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import { payrollAbsenceNotice } from '@/lib/payroll/payroll-month-status';
import { laborRatioBand, type LaborRatioBand } from '@/lib/labor-cost-ratio-presentation';

type DayCell = { total: number; fixed: number; overtime: number; laborPctOfSales: number | null };

type MonthSummaryPayload = {
    year: number;
    month: number;
    daysInMonth: number;
    totalFixed: number;
    totalOvertime: number;
    totalCost: number;
    byDate: Record<string, DayCell>;
    missingPayrollMonths: string[];
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

function formatLaborEuro(n: number): string {
    return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n);
}

function formatLaborPercent(n: number): string {
    return new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n) + '%';
}

const ratioStyles: Record<LaborRatioBand, { chip: string; bar: string; text: string }> = {
    good: { chip: 'border-emerald-200 bg-emerald-50 text-emerald-700', bar: 'bg-emerald-400', text: 'text-emerald-300' },
    attention: { chip: 'border-amber-200 bg-amber-50 text-amber-700', bar: 'bg-amber-400', text: 'text-amber-300' },
    high: { chip: 'border-orange-200 bg-orange-50 text-orange-700', bar: 'bg-orange-400', text: 'text-orange-300' },
    critical: { chip: 'border-rose-200 bg-rose-50 text-rose-700', bar: 'bg-rose-400', text: 'text-rose-300' },
    unavailable: { chip: 'border-zinc-200 bg-zinc-100 text-zinc-500', bar: 'bg-zinc-400', text: 'text-white/60' },
};

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

    if (status === 'NO_SUMMARY') return null;

    if (status === 'WAITING_PAYROLLS') {
        return (
            <div className="flex items-center justify-center gap-2 px-3 py-1.5 bg-sky-50 border border-sky-200/80 rounded-xl text-sky-900 text-xs font-semibold">
                <span className="inline-block w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                <span>⚪ Resumen Gestoría ({formatEuroRead(totalSummary)})</span>
                <span className="text-sky-700 font-normal">| Esperando nóminas individuales</span>
            </div>
        );
    }

    return null;
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
        laborPctOfSales: number | null;
        payrollPending: boolean;
        workers: WorkerRow[];
    } | null>(null);

    const calendarDays = useMemo(() => {
        const startVisible = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [viewMonth]);
    const calendarWeeks = useMemo(() => chunkCalendarWeeks(calendarDays), [calendarDays]);

    const todayStr = formatYmdInMadrid(new Date());
    const missingPayrollMonths = summary?.missingPayrollMonths;
    const ordinaryUnknown = (missingPayrollMonths?.length ?? 0) > 0;
    const missingPayrollMonthSet = useMemo(
        () => new Set(missingPayrollMonths ?? []),
        [missingPayrollMonths],
    );
    const payrollNotice = useMemo(
        () => payrollAbsenceNotice(missingPayrollMonths ?? [], todayStr),
        [missingPayrollMonths, todayStr],
    );
    const dayPayrollNotice = dayDetail?.payrollPending
        ? payrollAbsenceNotice([dayDetail.date.slice(0, 7)], todayStr)
        : null;

    const laborPctOfPeriod = useMemo(() => {
        if (!summary || ordinaryUnknown || periodNetSales === null) return null;
        if (periodNetSales <= 0) return null;
        return (summary.totalCost / periodNetSales) * 100;
    }, [summary, ordinaryUnknown, periodNetSales]);

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
            const todayStr = formatYmdInMadrid(new Date());

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
                    laborPctOfSales: cell.laborPctOfSales == null ? null : Number(cell.laborPctOfSales),
                };
            }

            setSummary({
                year: start.getFullYear(),
                month: start.getMonth() + 1,
                daysInMonth: Object.keys(byDate).length,
                totalFixed: period.totalFixed,
                totalOvertime: period.totalOvertime,
                totalCost: period.totalCost,
                byDate,
                missingPayrollMonths: period.missingPayrollMonths,
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
        const timer = window.setTimeout(() => { void fetchPeriodSummary(); }, 0);
        return () => window.clearTimeout(timer);
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

    const openDayDetail = useCallback(
        async (day: Date, optionsOverride?: { includeAll?: boolean }) => {
            const key = format(day, 'yyyy-MM-dd');
            const showAll = optionsOverride?.includeAll ?? false;
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
                    laborPctOfSales: labor.laborPctOfSales,
                    payrollPending: labor.isPayrollPending,
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
        [workerFilterId, pathname],
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
                work="calendar"
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
                    <div className="flex items-center gap-1 md:gap-2 shrink-0">
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
            leadSlot={
                <>
                    <div className="grid grid-cols-4 gap-0.5 sm:gap-1 min-w-0">
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Coste
                                </span>
                                <span className="text-[11px] font-black leading-tight text-rose-500 tabular-nums sm:text-xs md:text-sm">
                                    {summary && !ordinaryUnknown ? formatEuroRead(summary.totalCost) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Fijo
                                </span>
                                <span className="text-[11px] font-black leading-tight text-zinc-700 tabular-nums sm:text-xs md:text-sm">
                                    {summary && !ordinaryUnknown ? formatEuroRead(summary.totalFixed) : ' '}
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

                        <div aria-label="Leyenda de coste laboral sobre ventas" className="flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 px-1 py-1 text-[9px] text-zinc-500 sm:text-[10px]">
                            <span className="font-medium text-zinc-600">Coste / ventas:</span>
                            {([
                                ['good', '≤25%'], ['attention', '25–35%'],
                                ['high', '35–50%'], ['critical', '>50%'],
                            ] as const).map(([band, label]) => (
                                <span key={band} className="inline-flex items-center gap-1">
                                    <span aria-hidden="true" className={cn('h-2 w-2 rounded-full', ratioStyles[band].bar)} />
                                    {label}
                                </span>
                            ))}
                        </div>

                        {payrollNotice ? (
                            <Notice
                                instance="labor-payroll-absence"
                                variant={payrollNotice.variant}
                                title={payrollNotice.title}
                            >
                                {payrollNotice.body}
                            </Notice>
                        ) : (
                            <ReconciliationBadge reconciliation={summary?.reconciliation} />
                        )}
                </>
            }
        >
                    <div className="flex flex-col month-cal-body min-h-0">

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4">
                                <LoadingSpinner size="lg" className="text-ds-marca" />
                            </div>
                        ) : (
                            <MonthCalendarFrame>
                                <div className="month-cal-weeks">
                                    {calendarWeeks.map((week) => (
                                    <div key={format(week[0], 'yyyy-MM-dd')} className="grid grid-cols-7 border-b border-gray-100 last:border-b-0 month-cal-week">
                                    {week.map((day) => {
                                        const key = format(day, 'yyyy-MM-dd');
                                        const isFutureDay = key > todayStr;
                                        const cell = summary?.byDate[key];
                                        const dayOrdinaryUnknown = missingPayrollMonthSet.has(key.slice(0, 7));
                                        const isViewMonthDay = isSameMonth(day, viewMonth);
                                        const inPeriod = dayInPeriod(key, periodStart, periodEnd);
                                        const showData =
                                            isViewMonthDay && inPeriod && !isFutureDay;
                                        const clickable = showData;
                                        const todayCell = isToday(day);
                                        const ratio = showData && !dayOrdinaryUnknown
                                            ? cell?.laborPctOfSales ?? null : null;
                                        const ratioTone = ratioStyles[laborRatioBand(ratio)];

                                        return (
                                            <button
                                                key={key}
                                                type="button"
                                                onClick={() => clickable && openDayDetail(day)}
                                                disabled={!clickable}
                                                className={cn(
                                                    'group relative flex flex-col text-left transition-colors p-0.5 sm:p-1 month-cal-cell',
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
                                                        'absolute top-1 right-1 text-[9px] font-normal',
                                                        todayCell && isViewMonthDay
                                                            ? 'text-blue-600'
                                                            : 'text-gray-400',
                                                    )}
                                                >
                                                    {format(day, 'd')}
                                                </span>
                                                <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-0.5 pt-3 text-center">
                                                    {showData && (dayOrdinaryUnknown ? (
                                                        <span className="max-w-full truncate rounded-md border border-zinc-200 bg-zinc-100 px-1 py-1 text-[9px] font-medium text-zinc-500">
                                                            Pendiente
                                                        </span>
                                                    ) : (
                                                        <>
                                                            <span
                                                                className={cn('inline-flex max-w-full items-center justify-center rounded-md border px-1 py-1 text-[9px] font-bold leading-none tabular-nums min-[370px]:text-[10px] sm:text-[12px]', ratioTone.chip)}
                                                                title={ratio === null ? 'Sin venta neta registrada para calcular el porcentaje' : 'Coste laboral / ventas netas: ' + formatLaborPercent(ratio)}
                                                            >
                                                                {ratio === null ? 'Sin ventas' : formatLaborPercent(ratio)}
                                                            </span>
                                                            <span className="max-w-full truncate text-[9px] font-semibold leading-none text-zinc-700 tabular-nums sm:text-[11px]">
                                                                {formatLaborEuro(cell?.total ?? 0)}
                                                            </span>
                                                            {(cell?.overtime ?? 0) > 0 && (
                                                                <span className="max-w-full truncate text-[8px] leading-none text-amber-600 sm:text-[9px]">
                                                                    Extra {formatLaborEuro(cell!.overtime)}
                                                                </span>
                                                            )}
                                                        </>
                                                    ))}
                                                </div>
                                            </button>
                                        );
                                    })}
                                    </div>
                                    ))}
                                </div>
                            </MonthCalendarFrame>
                        )}
                    </div>
            </DashboardDetailLayout>

            <Modal
                open={detailOpen}
                onClose={closeDetail}
                variant="standard"
                scheme="dark"
                layer="base"
                instance="labor-cost-day-detail"
                usageId="labor-cost-day-detail"
                usageLabel="Detalle día laboral"
                title={selectedDayStr ? format(parseLocalSafe(selectedDayStr), 'EEEE · d MMMM yyyy', { locale: es }) : 'Coste laboral'}
            >
                <div className="min-w-0 px-3 py-4 text-white sm:px-5 sm:py-5">
                    {detailLoading ? (
                        <div className="flex justify-center py-14">
                            <LoadingSpinner size="lg" className="text-white" />
                        </div>
                    ) : dayDetail ? (() => {
                        const pending = dayDetail.payrollPending;
                        const ratio = pending || dayDetail.dayNetSales <= 0 ? null : dayDetail.laborPctOfSales;
                        const tone = ratioStyles[laborRatioBand(ratio)];
                        const shownWorkers = dayDetail.workers
                            .filter(w => showNoActivity || w.hasActivity || w.total !== 0 || w.fixed !== 0 || w.overtime !== 0)
                            .sort((a, b) => b.total - a.total || Number(b.hasActivity) - Number(a.hasActivity));
                        return (
                            <div className="flex min-w-0 flex-col gap-3">
                                {dayPayrollNotice && (
                                    <Notice instance="labor-day-payroll-absence" variant={dayPayrollNotice.variant} title={dayPayrollNotice.title}>
                                        {dayPayrollNotice.body}
                                    </Notice>
                                )}

                                <section aria-label="Porcentaje de coste sobre ventas" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3.5">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-white/65">Coste laboral / ventas netas</span>
                                        <span className={cn('inline-flex shrink-0 rounded-md border px-2 py-1 text-[10px] font-semibold', tone.chip)}>
                                            {pending ? 'Nómina pendiente' : ratio === null ? 'Sin ventas' :
                                                laborRatioBand(ratio) === 'good' ? '≤25%' :
                                                laborRatioBand(ratio) === 'attention' ? '25–35%' :
                                                laborRatioBand(ratio) === 'high' ? '35–50%' : '>50%'}
                                        </span>
                                    </div>
                                    <strong className={cn('mt-2 block text-[32px] font-bold leading-none tracking-tight tabular-nums sm:text-[38px]', tone.text)}>
                                        {ratio === null ? '—' : formatLaborPercent(ratio)}
                                    </strong>
                                    <p className="mt-2 text-[11px] leading-relaxed text-white/60">
                                        {pending ? 'No hay todavía un coste fijo oficial para calcular la proporción.' :
                                            ratio === null ? 'No hay venta neta positiva con la que comparar este día.' :
                                            'Parte de las ventas netas destinada al coste de personal de este día.'}
                                    </p>
                                    <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                                        {ratio !== null && (
                                            <div className={cn('h-full rounded-full transition-[width]', tone.bar)}
                                                style={{ width: Math.min(100, Math.max(0, ratio)) + '%' }} />
                                        )}
                                    </div>
                                </section>

                                <div className="grid grid-cols-2 gap-2">
                                    {([
                                        { label: 'Coste total', value: pending ? '—' : formatLaborEuro(dayDetail.totalCost), emphasized: true },
                                        { label: 'Venta neta', value: formatLaborEuro(dayDetail.dayNetSales), emphasized: false },
                                        { label: 'Coste fijo', value: pending ? '—' : formatLaborEuro(dayDetail.totalFixed), emphasized: false },
                                        { label: 'Horas extra', value: formatLaborEuro(dayDetail.totalOvertime), emphasized: false },
                                    ] as const).map(metric => (
                                        <div key={metric.label} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.045] p-3">
                                            <span className="block text-[10px] font-medium text-white/60">{metric.label}</span>
                                            <strong className={cn('mt-1 block truncate text-[17px] font-semibold tabular-nums sm:text-[20px]',
                                                metric.emphasized ? 'text-white' : 'text-white/90')}>
                                                {metric.value}
                                            </strong>
                                        </div>
                                    ))}
                                </div>

                                <section className="min-w-0">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                        <h3 className="text-xs font-semibold text-white">Coste por trabajador</h3>
                                        <button type="button" onClick={() => setShowNoActivity(v => !v)}
                                            className="rounded-md px-1.5 py-1 text-[11px] font-medium text-sky-200 hover:bg-white/10">
                                            {showNoActivity ? 'Ocultar inactivos' : 'Mostrar todos'}
                                        </button>
                                    </div>
                                    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.035]">
                                        {shownWorkers.length ? shownWorkers.map(w => {
                                            const workerRatio = pending || dayDetail.dayNetSales <= 0 ? null : w.laborPctOfSales;
                                            const workerBand = laborRatioBand(workerRatio);
                                            const name = firstNameOnly(w.name);
                                            return (
                                                <div key={w.id} className={cn('flex min-w-0 items-center gap-2.5 border-b border-white/10 px-3 py-2.5 last:border-b-0', !w.hasActivity && w.total === 0 && 'opacity-50')}>
                                                    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/85">
                                                        {name.charAt(0)}
                                                    </span>
                                                    <div className="min-w-0 flex-1">
                                                        <span className="block truncate text-[12px] font-semibold text-white">{name}</span>
                                                        <span className="block truncate text-[10px] text-white/55">
                                                            {pending ? (w.overtime > 0 ? 'Extras ' + formatLaborEuro(w.overtime) : 'Coste fijo pendiente') :
                                                                'Fijo ' + formatLaborEuro(w.fixed) + (w.overtime > 0 ? ' · Extras ' + formatLaborEuro(w.overtime) : '')}
                                                        </span>
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                                                        <strong className="text-[12px] font-semibold tabular-nums text-white">
                                                            {formatLaborEuro(pending ? w.overtime : w.total)}
                                                        </strong>
                                                        <span className={cn('text-[10px] font-semibold tabular-nums', ratioStyles[workerBand].text)}>
                                                            {workerRatio === null ? '—' : formatWorkerPctLine(workerRatio)}
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }) : (
                                            <p className="px-3 py-5 text-center text-[12px] text-white/55">No hay trabajadores con costes registrados este día.</p>
                                        )}
                                    </div>
                                </section>

                                {!pending && (
                                    <p className="text-center text-[10px] leading-relaxed text-white/50">
                                        El coste fijo se distribuye entre los días naturales del mes según la nómina oficial.
                                        Los colores representan el porcentaje de coste sobre ventas netas.
                                    </p>
                                )}
                            </div>
                        );
                    })() : (
                        <p className="py-8 text-center text-sm text-white/65">No se pudo mostrar el detalle del día.</p>
                    )}
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
