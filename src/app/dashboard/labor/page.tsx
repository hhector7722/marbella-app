'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
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
import { timeFilterLabel } from '@/components/time/time-filter-types';

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
    /** Coste del trabajador / venta neta del día × 100 */
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
                    'absolute left-1/2 top-1/2 w-[min(72%,2.5rem)] -translate-x-1/2 -translate-y-1/2 text-center text-[8px] font-black tabular-nums leading-tight pointer-events-none sm:text-[9px]',
                    textCls,
                )}
            >
                {label}
            </span>
        </div>
    );
}

export default function LaborHistoryPage() {
    const supabase = createClient();
    const router = useRouter();

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

    const periodSubtitle = useMemo(() => {
        const a = parseLocalSafe(periodStart);
        const b = parseLocalSafe(periodEnd);
        if (format(a, 'yyyy-MM-dd') === format(b, 'yyyy-MM-dd')) {
            return format(a, "d MMM yyyy", { locale: es });
        }
        return `${format(a, "d MMM", { locale: es })} – ${format(b, "d MMM yyyy", { locale: es })}`;
    }, [periodStart, periodEnd]);

    const filterActive = useMemo(() => {
        const cur = defaultFullMonthPeriod();
        return periodStart !== cur.start || periodEnd !== cur.end;
    }, [periodStart, periodEnd]);

    const laborPctOfPeriod = useMemo(() => {
        if (!summary || periodNetSales === null) return null;
        if (periodNetSales <= 0) return null;
        return (summary.totalCost / periodNetSales) * 100;
    }, [summary, periodNetSales]);

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

            while (cursor.getTime() <= endMonth.getTime()) {
                const y = cursor.getFullYear();
                const m = cursor.getMonth() + 1;
                const { data, error } = await supabase.rpc('get_labor_cost_month_summary', {
                    p_year: y,
                    p_month: m,
                });
                if (error) throw error;
                const raw = data as Record<string, unknown> | null;
                const rawByDate = (raw?.byDate as Record<string, unknown> | undefined) || {};
                for (const [key, val] of Object.entries(rawByDate)) {
                    const iso = key.split('T')[0];
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

            const { data: salesData, error: salesErr } = await supabase.rpc('get_cash_closings_summary', {
                p_start_date: periodStart.split('T')[0],
                p_end_date: periodEnd.split('T')[0],
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
    }, [supabase, periodStart, periodEnd]);

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

    const openDayDetail = async (day: Date) => {
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
            const workers: WorkerRow[] = wrows.map((w: Record<string, unknown>) => {
                const total = Number(w.total) || 0;
                const laborPctOfSales =
                    dayNetSales > 0 ? (total / dayNetSales) * 100 : null;
                return {
                    id: String(w.id ?? w.userId ?? ''),
                    name: w.name != null ? String(w.name) : null,
                    fixed: Number(w.fixed ?? w.fixedCost) || 0,
                    overtime: Number(w.overtime ?? w.overtimeCost) || 0,
                    total,
                    laborPctOfSales,
                };
            });
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
    };

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
                            <button
                                type="button"
                                onClick={() => router.back()}
                                className="p-2 text-white/60 hover:text-white transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                                aria-label="Volver"
                            >
                                <X size={24} />
                            </button>
                        </div>
                    </div>

                    <div className="px-4 md:px-8 pt-3 pb-3 border-b border-zinc-100 shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 text-center mb-2">
                            {filterActive ? 'Periodo filtrado' : 'Periodo (mes actual)'}
                        </p>
                        <p
                            className="text-[10px] font-bold text-zinc-500 text-center mb-3 leading-snug px-1"
                            title={timeFilterLabel(appliedFilter)}
                        >
                            {periodSubtitle}
                        </p>
                        {/* Flechas pegadas al nombre del mes: ancho natural del texto */}
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-2 mb-6 py-4 border-y border-gray-50 shrink-0">
                            <div className="flex flex-col items-center justify-center text-center min-h-[4.5rem]">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Coste total
                                </span>
                                <span className="text-lg md:text-xl font-black text-rose-500 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalCost) : ' '}
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-gray-50 sm:border-x min-h-[4.5rem]">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Fijo
                                </span>
                                <span className="text-lg md:text-xl font-black text-zinc-700 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalFixed) : ' '}
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-t border-gray-50 pt-3 sm:border-t-0 sm:pt-0 sm:border-x min-h-[4.5rem]">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Extras
                                </span>
                                <span className="text-lg md:text-xl font-black text-amber-600 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalOvertime) : ' '}
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-t border-gray-50 pt-3 sm:border-t-0 sm:pt-0 min-h-[4.5rem]">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1 px-1 leading-tight">
                                    M.O. / ventas
                                </span>
                                <LaborPctRingCentered percentRaw={laborPctOfPeriod} size={52} />
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
                                                const cell = summary?.byDate[key];
                                                const total = cell?.total ?? 0;
                                                const isViewMonthDay = isSameMonth(day, viewMonth);
                                                const inPeriod = dayInPeriod(key, periodStart, periodEnd);
                                                const showData = isViewMonthDay && inPeriod;
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
                                                                !inPeriod &&
                                                                'bg-zinc-100/80 border-zinc-200/80 opacity-60 cursor-not-allowed',
                                                            isViewMonthDay &&
                                                                inPeriod &&
                                                                'bg-white border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.99]',
                                                        )}
                                                    >
                                                        <div
                                                            className={cn(
                                                                'px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shrink-0',
                                                                showData ? 'bg-[#D64D5D]' : 'bg-zinc-400',
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
                            <div className="bg-[#36606F] px-4 py-4 md:py-5 text-white shrink-0">
                                <div className="flex justify-end mb-1">
                                    <button
                                        type="button"
                                        onClick={closeDetail}
                                        className="p-2 hover:bg-white/10 rounded-xl transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                                        aria-label="Cerrar"
                                    >
                                        <X size={20} />
                                    </button>
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-60 block">
                                    Desglose por trabajador
                                </span>
                                <h3 className="text-lg font-black uppercase tracking-tight pr-8">
                                    {selectedDayStr
                                        ? format(parseLocalSafe(selectedDayStr), 'EEEE d MMMM', { locale: es })
                                        : ''}
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col min-h-0">
                                {detailLoading ? (
                                    <div className="flex justify-center py-12">
                                        <LoadingSpinner className="text-[#36606F]" />
                                    </div>
                                ) : dayDetail && dayDetail.workers.length > 0 ? (
                                    <>
                                        <div className="space-y-2 mb-4">
                                            {dayDetail.workers.map((w) => (
                                                <div
                                                    key={w.id}
                                                    className="flex flex-col gap-2 p-3 bg-zinc-50 rounded-2xl border border-zinc-100"
                                                >
                                                    <span className="text-xs font-black text-zinc-800 truncate">
                                                        {w.name || '—'}
                                                    </span>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-1 text-center items-start">
                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-[9px] font-black uppercase tracking-tight text-zinc-400">
                                                                Fijo
                                                            </span>
                                                            <span className="text-[11px] font-black text-zinc-700 tabular-nums">
                                                                {formatEuroRead(w.fixed)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 min-w-0 sm:border-x sm:border-zinc-200/80 sm:px-1">
                                                            <span className="text-[9px] font-black uppercase tracking-tight text-zinc-400">
                                                                Extras
                                                            </span>
                                                            <span className="text-[11px] font-black text-amber-700/90 tabular-nums">
                                                                {formatEuroRead(w.overtime)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col gap-0.5 min-w-0">
                                                            <span className="text-[9px] font-black uppercase tracking-tight text-zinc-400">
                                                                Total
                                                            </span>
                                                            <span className="text-[11px] font-black text-[#36606F] tabular-nums">
                                                                {formatEuroRead(w.total)}
                                                            </span>
                                                        </div>
                                                        <div className="flex flex-col items-center gap-1 min-w-0 sm:justify-start">
                                                            <span className="text-[9px] font-black uppercase tracking-tight text-zinc-400">
                                                                M.O./Vtas
                                                            </span>
                                                            <LaborPctRingCentered
                                                                percentRaw={w.laborPctOfSales}
                                                                size={44}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-auto pt-4 border-t border-zinc-100 flex flex-col gap-3 shrink-0">
                                            <div className="flex justify-between items-center gap-2">
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                                    Total día
                                                </span>
                                                <span className="text-xl font-black text-rose-500 tabular-nums">
                                                    {formatEuroRead(dayDetail.totalCost)}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest shrink-0">
                                                    M.O. / ventas (día)
                                                </span>
                                                <LaborPctRingCentered
                                                    percentRaw={
                                                        dayDetail.dayNetSales > 0
                                                            ? (dayDetail.totalCost / dayDetail.dayNetSales) * 100
                                                            : null
                                                    }
                                                    size={56}
                                                />
                                            </div>
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
