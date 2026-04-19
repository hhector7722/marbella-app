'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import { ChevronLeft, ChevronRight, User, X } from 'lucide-react';
import {
    addMonths,
    eachDayOfInterval,
    endOfMonth,
    endOfWeek,
    format,
    isSameMonth,
    startOfMonth,
    startOfWeek,
    subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';

type DayCell = { total: number; fixed: number; overtime: number };

type MonthSummaryPayload = {
    year: number;
    month: number;
    daysInMonth: number;
    totalFixed: number;
    totalOvertime: number;
    totalCost: number;
    byDate: Record<string, DayCell>;
};

type WorkerRow = {
    id: string;
    name: string | null;
    fixed: number;
    overtime: number;
    total: number;
    /** (Coste total del trabajador / venta neta del día) × 100 */
    laborPctOfSales: number | null;
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
                className={cn('transition-[stroke-dashoffset] duration-300', colorClass)}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={c}
                strokeDashoffset={offset}
            />
        </svg>
    );
}

/** Anillo con el % en el hueco central (texto legible, sin rotar) */
function LaborPctRingCentered({
    percentRaw,
    size = 48,
}: {
    /** null = sin ventas; número = % real (puede ser >100) */
    percentRaw: number | null;
    size?: number;
}) {
    const stroke = Math.max(4, Math.round(size / 9));
    const arcFill = percentRaw === null ? 0 : Math.min(100, Math.max(0, percentRaw));
    const label =
        percentRaw === null
            ? '—'
            : `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 0 }).format(percentRaw)}%`;
    const textCls =
        percentRaw === null ? 'text-zinc-400' : laborPctIndicatorClass(percentRaw).split(' ')[0];

    return (
        <div
            className="relative flex items-center justify-center shrink-0"
            style={{ width: size, height: size }}
        >
            <LaborPctRing percent={arcFill} size={size} strokeWidth={stroke} />
            <span
                className={cn(
                    'absolute left-1/2 top-1/2 w-[min(72%,2.5rem)] -translate-x-1/2 -translate-y-1/2 text-center font-black tabular-nums leading-tight pointer-events-none',
                    size <= 38 ? 'text-[6px]' : 'text-[8px] sm:text-[9px]',
                    textCls,
                )}
            >
                {label}
            </span>
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
    const supabase = createClient();

    const def = defaultFullMonthPeriod();
    const [periodStart, setPeriodStart] = useState<string>(def.start);
    const [periodEnd, setPeriodEnd] = useState<string>(def.end);
    /** Mes del calendario (solo vista; las flechas lo mueven sin cambiar el periodo filtrado) */
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

    const filterActive = useMemo(() => {
        const cur = defaultFullMonthPeriod();
        return periodStart !== cur.start || periodEnd !== cur.end;
    }, [periodStart, periodEnd]);

    const laborPctOfPeriod = useMemo(() => {
        if (!summary || periodNetSales === null) return null;
        if (periodNetSales <= 0) return null;
        return (summary.totalCost / periodNetSales) * 100;
    }, [summary, periodNetSales]);

    const todayStr = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, first_name, last_name, avatar_url')
                .order('first_name');
            if (cancelled || error) return;
            const list = (data || []).filter((e: ProfileOption) => {
                const name = (e.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            });
            setEmployees(list);
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
            let cursor = startOfMonth(start);
            const endMonth = startOfMonth(end);

            const todayStr = format(new Date(), 'yyyy-MM-dd');

            while (cursor.getTime() <= endMonth.getTime()) {
                const y = cursor.getFullYear();
                const m = cursor.getMonth() + 1;
                const { data, error } = await supabase.rpc('get_labor_cost_month_summary', {
                    p_year: y,
                    p_month: m,
                    p_user_id: workerFilterId ?? null,
                });
                if (error) throw error;
                const raw = data as Record<string, unknown> | null;
                const rawByDate = (raw?.byDate as Record<string, unknown> | undefined) || {};
                for (const [key, val] of Object.entries(rawByDate)) {
                    const iso = key.split('T')[0];
                    if (iso > todayStr) continue;
                    if (!dayInPeriod(iso, periodStart, periodEnd)) continue;
                    const cell = val as Record<string, unknown> | null;
                    if (!cell || typeof cell !== 'object') continue;
                    byDate[iso] = {
                        total: Number(cell.total) || 0,
                        fixed: Number(cell.fixed) || 0,
                        overtime: Number(cell.overtime) || 0,
                    };
                }
                cursor = addMonths(cursor, 1);
            }

            let totalFixed = 0;
            let totalOvertime = 0;
            let totalCost = 0;
            for (const c of Object.values(byDate)) {
                totalFixed += c.fixed;
                totalOvertime += c.overtime;
                totalCost += c.total;
            }

            setSummary({
                year: start.getFullYear(),
                month: start.getMonth() + 1,
                daysInMonth: Object.keys(byDate).length,
                totalFixed,
                totalOvertime,
                totalCost,
                byDate,
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
        setViewMonth((vm) => subMonths(vm, 1));
    };

    const handleNextMonth = () => {
        setViewMonth((vm) => addMonths(vm, 1));
    };

    const clearTimeFilter = () => {
        const cur = defaultFullMonthPeriod();
        setPeriodStart(cur.start);
        setPeriodEnd(cur.end);
        setViewMonth(startOfMonth(new Date()));
        const n = new Date();
        setAppliedFilter({ kind: 'month', year: n.getFullYear(), month: n.getMonth() + 1 });
    };

    const openDayDetail = useCallback(
        async (day: Date) => {
            const key = format(day, 'yyyy-MM-dd');
            setSelectedDayStr(key);
            setDetailOpen(true);
            setDetailLoading(true);
            setDayDetail(null);
            try {
                const [laborRes, salesRes] = await Promise.all([
                    supabase.rpc('get_labor_cost_day_detail', { p_date: key }),
                    supabase.rpc('get_cash_closings_summary', {
                        p_start_date: key,
                        p_end_date: key,
                    }),
                ]);
                if (laborRes.error) throw laborRes.error;
                if (salesRes.error) console.warn(salesRes.error);
                const raw = laborRes.data as Record<string, unknown> | null;
                if (!raw) {
                    setDayDetail(null);
                    return;
                }
                const dayNetSales = salesRes.error
                    ? 0
                    : Number((salesRes.data as { totalNet?: number } | null)?.totalNet) || 0;

                const wrows = Array.isArray(raw.workers) ? raw.workers : [];
                let workers: WorkerRow[] = wrows.map((w: Record<string, unknown>) => {
                    const id = String(w.id ?? w.userId ?? '');
                    const total = Number(w.total) || 0;
                    let laborPctOfSales: number | null = null;
                    if (dayNetSales > 0) {
                        laborPctOfSales = (total / dayNetSales) * 100;
                    }
                    return {
                        id,
                        name: w.name != null ? String(w.name) : null,
                        fixed: Number(w.fixed ?? w.fixedCost) || 0,
                        overtime: Number(w.overtime ?? w.overtimeCost) || 0,
                        total,
                        laborPctOfSales,
                    };
                });

                if (workerFilterId) {
                    workers = workers.filter((w) => w.id === workerFilterId);
                    if (workers.length === 0) {
                        setDayDetail({
                            date: String(raw.date),
                            totalFixed: 0,
                            totalOvertime: 0,
                            totalCost: 0,
                            dayNetSales,
                            workers: [],
                        });
                        return;
                    }
                    const w = workers[0];
                    setDayDetail({
                        date: String(raw.date),
                        totalFixed: w.fixed,
                        totalOvertime: w.overtime,
                        totalCost: w.total,
                        dayNetSales,
                        workers: [w],
                    });
                    return;
                }

                const totalFixed = workers.reduce((s, w) => s + w.fixed, 0);
                const totalOvertime = workers.reduce((s, w) => s + w.overtime, 0);
                const totalCost =
                    Number(raw.totalCost ?? raw.dayTotal) ||
                    totalFixed + totalOvertime;
                setDayDetail({
                    date: String(raw.date),
                    totalFixed,
                    totalOvertime,
                    totalCost,
                    dayNetSales,
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
        [supabase, workerFilterId],
    );

    const closeDetail = () => {
        setDetailOpen(false);
        setDayDetail(null);
        setSelectedDayStr(null);
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">
                    <div className="bg-[#36606F] px-4 md:px-8 py-5 flex items-center justify-between gap-2 shrink-0">
                        <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider shrink-0 min-w-0">
                            Coste laboral
                        </h1>
                        <div className="flex items-center gap-1 md:gap-2 shrink-0 text-white">
                            <TimeFilterButton
                                onClick={() => setIsTimeFilterOpen(true)}
                                hasActiveFilter={filterActive}
                                onClear={clearTimeFilter}
                            />
                            <div className="relative shrink-0">
                                <button
                                    type="button"
                                    onClick={() => setIsWorkerModalOpen(true)}
                                    className="relative p-2 text-white/90 hover:text-white transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-white/10"
                                    aria-label="Filtrar por trabajador"
                                >
                                    <User size={24} strokeWidth={2.25} />
                                </button>
                                {workerFilterId ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setWorkerFilterId(null);
                                        }}
                                        className="absolute -right-0.5 -top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm ring-2 ring-[#36606F]"
                                        aria-label="Quitar filtro de trabajador"
                                    >
                                        <X size={9} strokeWidth={3} className="text-white" />
                                    </button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div className="px-4 md:px-8 pt-3 pb-3 border-b border-zinc-100 shrink-0">
                        <div className="flex justify-center w-full">
                            <div className="inline-flex items-center justify-center gap-1 sm:gap-2 max-w-full">
                                <button
                                    type="button"
                                    onClick={handlePrevMonth}
                                    className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                                    aria-label="Mes anterior"
                                >
                                    <ChevronLeft size={22} />
                                </button>
                                <span className="text-base md:text-lg font-black text-[#36606F] capitalize text-center px-1 sm:px-2 min-w-0 max-w-[min(100%,14rem)] sm:max-w-none">
                                    {format(viewMonth, 'MMMM yyyy', { locale: es })}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNextMonth}
                                    className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                                    aria-label="Mes siguiente"
                                >
                                    <ChevronRight size={22} />
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 md:p-8 flex-1 flex flex-col min-h-0">
                        <div className="grid grid-cols-4 gap-0.5 sm:gap-1 mb-4 py-2 border-y border-gray-50 shrink-0 min-w-0">
                            <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-100 px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Coste
                                </span>
                                <span className="text-[11px] font-black leading-tight text-rose-500 tabular-nums sm:text-xs md:text-sm">
                                    {summary ? formatEuroRead(summary.totalCost) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-100 px-0.5 text-center">
                                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                                    Fijo
                                </span>
                                <span className="text-[11px] font-black leading-tight text-zinc-700 tabular-nums sm:text-xs md:text-sm">
                                    {summary ? formatEuroRead(summary.totalFixed) : ' '}
                                </span>
                            </div>
                            <div className="flex min-w-0 flex-col items-center justify-center border-r border-gray-100 px-0.5 text-center">
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

                        {loading ? (
                            <div className="flex flex-col items-center justify-center py-20 gap-4 flex-1">
                                <LoadingSpinner size="lg" className="text-[#36606F]" />
                            </div>
                        ) : (
                            <div className="bg-[#EFEDED] rounded-2xl border border-zinc-100 shadow-inner overflow-hidden flex-1 flex flex-col min-h-0">
                                <div className="p-1 md:p-3 overflow-x-auto no-scrollbar flex-1">
                                    <div className="min-w-0">
                                        <div className="grid grid-cols-7 mb-1 md:mb-2 px-0.5 md:px-2">
                                            {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, index) => (
                                                <div
                                                    key={d}
                                                    className="text-[7px] md:text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em] text-center"
                                                >
                                                    <span className="hidden md:inline">{d}</span>
                                                    <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="grid grid-cols-7 gap-1 md:gap-2">
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

                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => clickable && openDayDetail(day)}
                                                        className={cn(
                                                            'group relative rounded-lg md:rounded-2xl border flex flex-col overflow-hidden text-left min-h-[52px] md:min-h-[100px] transition-all',
                                                            !isViewMonthDay &&
                                                                'bg-transparent border-transparent opacity-25 pointer-events-none',
                                                            isViewMonthDay &&
                                                                isFutureDay &&
                                                                'cursor-default border-zinc-200/60 bg-zinc-50/90',
                                                            isViewMonthDay &&
                                                                !inPeriod &&
                                                                !isFutureDay &&
                                                                'bg-zinc-100/80 border-zinc-200/80 opacity-60 cursor-not-allowed',
                                                            isViewMonthDay &&
                                                                inPeriod &&
                                                                !isFutureDay &&
                                                                'bg-white border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.99]',
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shrink-0',
                                                                showData
                                                                    ? 'bg-[#D64D5D]'
                                                                    : isFutureDay && isViewMonthDay
                                                                      ? 'bg-zinc-300'
                                                                      : 'bg-zinc-400',
                                                            )}
                                                        >
                                                            <span className="text-[8px] md:text-[10px] font-black text-white">
                                                                {format(day, 'd')}
                                                            </span>
                                                        </div>
                                                        <div className="p-1 md:p-2 flex flex-col flex-1 justify-center items-center">
                                                            <span
                                                                className={cn(
                                                                    'text-[9px] min-[370px]:text-[11px] md:text-lg font-black tabular-nums leading-none',
                                                                    showData ? 'text-zinc-900' : 'text-zinc-400',
                                                                )}
                                                            >
                                                                {showData ? formatEuroRead(total) : ' '}
                                                            </span>
                                                            <span className="text-[5px] md:text-[7px] font-black text-zinc-400 uppercase mt-0.5 hidden md:block">
                                                                Total
                                                            </span>
                                                        </div>
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {detailOpen &&
                typeof document !== 'undefined' &&
                createPortal(
                    <div
                        className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
                        onClick={(e) => {
                            if (e.target === e.currentTarget) closeDetail();
                        }}
                        role="presentation"
                    >
                        <div
                            className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="bg-[#36606F] px-4 py-2 text-white shrink-0 flex items-center justify-between gap-1">
                                <div className="flex-1" />
                                <div className="flex items-center justify-center gap-1 sm:gap-2 shrink-0">
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedDayStr) {
                                                const d = parseLocalSafe(selectedDayStr);
                                                d.setDate(d.getDate() - 1);
                                                openDayDetail(d);
                                            }
                                        }}
                                        className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                                        aria-label="Día anterior"
                                    >
                                        <ChevronLeft size={20} />
                                    </button>
                                    <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-center">
                                        {selectedDayStr
                                            ? format(parseLocalSafe(selectedDayStr), 'EEEE d MMM', { locale: es })
                                            : ''}
                                    </h3>
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (selectedDayStr) {
                                                const d = parseLocalSafe(selectedDayStr);
                                                d.setDate(d.getDate() + 1);
                                                openDayDetail(d);
                                            }
                                        }}
                                        className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                                        aria-label="Día siguiente"
                                    >
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                                <div className="flex-1 flex justify-end">
                                    <button
                                        type="button"
                                        onClick={closeDetail}
                                        className="p-2 hover:bg-white/10 rounded-xl transition-colors flex items-center justify-center -mr-2"
                                        aria-label="Cerrar"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col min-h-0">
                                {detailLoading ? (
                                    <div className="flex justify-center py-12">
                                        <LoadingSpinner className="text-[#36606F]" />
                                    </div>
                                ) : dayDetail && dayDetail.workers.length > 0 ? (
                                    <>
                                        <div className="mb-4 rounded-[1.25rem] bg-[#36606F] p-3 shadow-md">
                                            <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.2em] text-white/90">
                                                Resumen del día
                                            </p>
                                            <div className="grid grid-cols-4 gap-1 sm:gap-2">
                                                <div className="bg-white rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center text-center">
                                                    <span className="block text-[7px] font-black uppercase tracking-wider text-zinc-500 mb-0.5">
                                                        Coste total
                                                    </span>
                                                    <span className="text-[11px] font-black tabular-nums text-rose-600 sm:text-[12px] leading-none">
                                                        {formatEuroRead(dayDetail.totalCost)}
                                                    </span>
                                                </div>
                                                <div className="bg-white rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center text-center">
                                                    <span className="block text-[7px] font-black uppercase tracking-wider text-zinc-500 mb-0.5">
                                                        Fijo
                                                    </span>
                                                    <span className="text-[11px] font-black tabular-nums text-zinc-800 sm:text-[12px] leading-none">
                                                        {formatEuroRead(dayDetail.totalFixed)}
                                                    </span>
                                                </div>
                                                <div className="bg-white rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center text-center">
                                                    <span className="block text-[7px] font-black uppercase tracking-wider text-zinc-500 mb-0.5">
                                                        Extras
                                                    </span>
                                                    <span className="text-[11px] font-black tabular-nums text-amber-600 sm:text-[12px] leading-none">
                                                        {formatEuroRead(dayDetail.totalOvertime)}
                                                    </span>
                                                </div>
                                                <div className="bg-white rounded-xl p-1.5 sm:p-2 flex flex-col items-center justify-center text-center">
                                                    <span className="block text-[7px] font-black uppercase tracking-wider text-zinc-500 mb-0.5">
                                                        %
                                                    </span>
                                                    <span
                                                        className={cn(
                                                            'text-[11px] font-black tabular-nums sm:text-[12px] leading-none',
                                                            laborPctTextClass(
                                                                dayDetail.dayNetSales > 0
                                                                    ? (dayDetail.totalCost / dayDetail.dayNetSales) * 100
                                                                    : null,
                                                            ),
                                                        )}
                                                    >
                                                        {formatWorkerPctLine(
                                                            dayDetail.dayNetSales > 0
                                                                ? (dayDetail.totalCost / dayDetail.dayNetSales) * 100
                                                                : null,
                                                        )}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="mb-4 flex flex-col relative gap-1 pb-4">
                                            {dayDetail.workers.map((w) => (
                                                <div
                                                    key={w.id}
                                                    className="flex items-center justify-between py-2 px-1 border-b border-zinc-100 last:border-0 hover:bg-zinc-50/50 rounded-lg transition-colors"
                                                >
                                                    <div className="truncate text-[13px] font-black text-zinc-800 flex-1 pr-2">
                                                        {firstNameOnly(w.name)}
                                                    </div>
                                                    <div className="grid grid-cols-4 shrink-0 w-[190px] min-[400px]:w-[210px] sm:w-[240px] gap-1 text-center items-center">
                                                        <div className="min-w-0">
                                                            <span className="block text-[6px] sm:text-[7px] font-black uppercase text-zinc-400 mb-1 tracking-wider">
                                                                Fijo
                                                            </span>
                                                            <span className="text-[10px] font-black tabular-nums text-zinc-700 sm:text-[11px] leading-none">
                                                                {formatEuroRead(w.fixed)}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block text-[6px] sm:text-[7px] font-black uppercase text-zinc-400 mb-1 tracking-wider">
                                                                Extras
                                                            </span>
                                                            <span className="text-[10px] font-black tabular-nums text-amber-600 sm:text-[11px] leading-none">
                                                                {formatEuroRead(w.overtime)}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block text-[6px] sm:text-[7px] font-black uppercase text-zinc-400 mb-1 tracking-wider">
                                                                Total
                                                            </span>
                                                            <span className="text-[10px] font-black tabular-nums text-[#36606F] sm:text-[11px] leading-none">
                                                                {formatEuroRead(w.total)}
                                                            </span>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <span className="block text-[6px] sm:text-[7px] font-black uppercase text-zinc-400 mb-1 tracking-wider">
                                                                %
                                                            </span>
                                                            <span
                                                                className={cn(
                                                                    'text-[10px] block font-black tabular-nums sm:text-[11px] leading-none',
                                                                    laborPctTextClass(w.laborPctOfSales),
                                                                )}
                                                            >
                                                                {formatWorkerPctLine(w.laborPctOfSales)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-center text-zinc-400 font-bold text-sm py-8">
                                        Sin coste registrado este día
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

            <TimeFilterModal
                isOpen={isTimeFilterOpen}
                onClose={() => setIsTimeFilterOpen(false)}
                allowedKinds={['date', 'range', 'week', 'month', 'year']}
                initialValue={appliedFilter}
                onApply={(v: TimeFilterValue) => {
                    setAppliedFilter(v);
                    if (v.kind === 'month') {
                        const s = new Date(v.year, v.month - 1, 1);
                        const e = endOfMonth(s);
                        setPeriodStart(format(s, 'yyyy-MM-dd'));
                        setPeriodEnd(format(e, 'yyyy-MM-dd'));
                        setViewMonth(startOfMonth(s));
                        return;
                    }
                    if (v.kind === 'year') {
                        setPeriodStart(`${v.year}-01-01`);
                        setPeriodEnd(`${v.year}-12-31`);
                        setViewMonth(new Date(v.year, 0, 1));
                        return;
                    }
                    if (v.kind === 'range' || v.kind === 'week') {
                        const a = v.startDate.split('T')[0];
                        const b = v.endDate.split('T')[0];
                        setPeriodStart(a);
                        setPeriodEnd(b);
                        setViewMonth(startOfMonth(parseLocalSafe(a)));
                        return;
                    }
                    if (v.kind === 'date') {
                        const d = v.date.split('T')[0];
                        setPeriodStart(d);
                        setPeriodEnd(d);
                        setViewMonth(startOfMonth(parseLocalSafe(d)));
                    }
                }}
            />
        </div>
    );
}
