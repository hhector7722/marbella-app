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

export default function LaborHistoryPage() {
    const supabase = createClient();
    const router = useRouter();

    const [rangeStart, setRangeStart] = useState<string>(() =>
        format(startOfMonth(new Date()), 'yyyy-MM-dd')
    );
    const [loading, setLoading] = useState(true);
    const [summary, setSummary] = useState<MonthSummaryPayload | null>(null);
    const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);

    const [detailOpen, setDetailOpen] = useState(false);
    const [detailLoading, setDetailLoading] = useState(false);
    const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
    const [dayDetail, setDayDetail] = useState<{
        date: string;
        totalFixed: number;
        totalOvertime: number;
        totalCost: number;
        workers: WorkerRow[];
    } | null>(null);

    const monthDate = useMemo(() => parseLocalSafe(rangeStart), [rangeStart]);

    const calendarDays = useMemo(() => {
        const base = parseLocalSafe(rangeStart);
        const startVisible = startOfWeek(startOfMonth(base), { weekStartsOn: 1 });
        const endVisible = endOfWeek(endOfMonth(base), { weekStartsOn: 1 });
        return eachDayOfInterval({ start: startVisible, end: endVisible });
    }, [rangeStart]);

    const fetchMonth = useCallback(async () => {
        setLoading(true);
        try {
            const d = parseLocalSafe(rangeStart);
            const { data, error } = await supabase.rpc('get_labor_cost_month_summary', {
                p_year: d.getFullYear(),
                p_month: d.getMonth() + 1,
            });
            if (error) throw error;
            const raw = data as Record<string, unknown> | null;
            if (!raw) {
                setSummary(null);
                return;
            }
            const rawByDate = (raw.byDate as Record<string, unknown> | undefined) || {};
            const byDate: Record<string, DayCell> = {};
            for (const [key, val] of Object.entries(rawByDate)) {
                const cell = val as Record<string, unknown> | null;
                if (!cell || typeof cell !== 'object') continue;
                byDate[key] = {
                    total: Number(cell.total) || 0,
                    fixed: Number(cell.fixed) || 0,
                    overtime: Number(cell.overtime) || 0,
                };
            }
            setSummary({
                year: Number(raw.year),
                month: Number(raw.month),
                daysInMonth: Number(raw.daysInMonth),
                totalFixed: Number(raw.totalFixed) || 0,
                totalOvertime: Number(raw.totalOvertime) || 0,
                totalCost: Number(raw.totalCost) || 0,
                byDate,
            });
        } catch (e) {
            console.error(e);
            toast.error('No se pudo cargar el coste laboral. ¿Permisos de gestor?');
            setSummary(null);
        } finally {
            setLoading(false);
        }
    }, [supabase, rangeStart]);

    useEffect(() => {
        fetchMonth();
    }, [fetchMonth]);

    const handlePrevMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const prev = subMonths(current, 1);
        setRangeStart(format(startOfMonth(prev), 'yyyy-MM-dd'));
    };

    const handleNextMonth = () => {
        const current = parseLocalSafe(rangeStart);
        const next = addMonths(current, 1);
        setRangeStart(format(startOfMonth(next), 'yyyy-MM-dd'));
    };

    const openDayDetail = async (day: Date) => {
        const key = format(day, 'yyyy-MM-dd');
        setSelectedDayStr(key);
        setDetailOpen(true);
        setDetailLoading(true);
        setDayDetail(null);
        try {
            const { data, error } = await supabase.rpc('get_labor_cost_day_detail', {
                p_date: key,
            });
            if (error) throw error;
            const raw = data as Record<string, unknown> | null;
            if (!raw) {
                setDayDetail(null);
                return;
            }
            const wrows = Array.isArray(raw.workers) ? raw.workers : [];
            const workers: WorkerRow[] = wrows.map((w: Record<string, unknown>) => ({
                id: String(w.id ?? w.userId ?? ''),
                name: w.name != null ? String(w.name) : null,
                fixed: Number(w.fixed ?? w.fixedCost) || 0,
                overtime: Number(w.overtime ?? w.overtimeCost) || 0,
                total: Number(w.total) || 0,
            }));
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
                        <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider shrink-0">
                            Coste laboral
                        </h1>
                        <div className="flex items-center gap-1 md:gap-2 shrink-0 text-white">
                            <TimeFilterButton
                                onClick={() => setIsTimeFilterOpen(true)}
                                hasActiveFilter={false}
                                onClear={() => {}}
                            />
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                                aria-label="Mes anterior"
                            >
                                <ChevronLeft size={22} />
                            </button>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                className="p-2 rounded-xl hover:bg-white/10 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center"
                                aria-label="Mes siguiente"
                            >
                                <ChevronRight size={22} />
                            </button>
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

                    <div className="px-4 md:px-8 pt-4 pb-2 text-center border-b border-zinc-100 shrink-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.25em] text-zinc-400">
                            Mes en curso
                        </p>
                        <p className="text-base md:text-lg font-black text-[#36606F] capitalize">
                            {format(monthDate, 'MMMM yyyy', { locale: es })}
                        </p>
                    </div>

                    <div className="p-4 md:p-8 flex-1 flex flex-col min-h-0">
                        <div className="grid grid-cols-3 gap-2 mb-6 py-4 border-y border-gray-50 shrink-0">
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Coste total
                                </span>
                                <span className="text-lg md:text-xl font-black text-rose-500 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalCost) : ' '}
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center border-x border-gray-50">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Fijo (mes)
                                </span>
                                <span className="text-lg md:text-xl font-black text-zinc-700 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalFixed) : ' '}
                                </span>
                            </div>
                            <div className="flex flex-col items-center justify-center text-center">
                                <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">
                                    Extras (mes)
                                </span>
                                <span className="text-lg md:text-xl font-black text-amber-600 tabular-nums">
                                    {summary ? formatEuroRead(summary.totalOvertime) : ' '}
                                </span>
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
                                            {calendarDays.map((day, idx) => {
                                                const key = format(day, 'yyyy-MM-dd');
                                                const cell = summary?.byDate[key];
                                                const total = cell?.total ?? 0;
                                                const isCurrentMonth = isSameMonth(day, monthDate);

                                                return (
                                                    <button
                                                        key={key}
                                                        type="button"
                                                        onClick={() => isCurrentMonth && openDayDetail(day)}
                                                        className={cn(
                                                            'group relative rounded-lg md:rounded-2xl border flex flex-col overflow-hidden text-left min-h-[52px] md:min-h-[100px] transition-all',
                                                            isCurrentMonth
                                                                ? 'bg-white border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.99]'
                                                                : 'bg-transparent border-transparent opacity-25 pointer-events-none'
                                                        )}
                                                    >
                                                        <div className="bg-[#D64D5D] px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shrink-0">
                                                            <span className="text-[8px] md:text-[10px] font-black text-white">
                                                                {format(day, 'd')}
                                                            </span>
                                                        </div>
                                                        <div className="p-1 md:p-2 flex flex-col flex-1 justify-center items-center">
                                                            <span className="text-[9px] min-[370px]:text-[11px] md:text-lg font-black text-zinc-900 tabular-nums leading-none">
                                                                {isCurrentMonth ? formatEuroRead(total) : ' '}
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
                                                    className="flex flex-col gap-1 p-3 bg-zinc-50 rounded-2xl border border-zinc-100"
                                                >
                                                    <div className="flex justify-between items-baseline gap-2">
                                                        <span className="text-xs font-black text-zinc-800 truncate">
                                                            {w.name || '—'}
                                                        </span>
                                                        <span className="text-sm font-black text-[#36606F] tabular-nums shrink-0">
                                                            {formatEuroRead(w.total)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between text-[10px] font-bold text-zinc-500">
                                                        <span>Fijo {formatEuroRead(w.fixed)}</span>
                                                        <span>Extras {formatEuroRead(w.overtime)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-auto pt-4 border-t border-zinc-100 flex justify-between items-center shrink-0">
                                            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                                                Total día
                                            </span>
                                            <span className="text-xl font-black text-rose-500 tabular-nums">
                                                {formatEuroRead(dayDetail.totalCost)}
                                            </span>
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
                initialValue={{
                    kind: 'month',
                    year: monthDate.getFullYear(),
                    month: monthDate.getMonth() + 1,
                }}
                onApply={(v: TimeFilterValue) => {
                    if (v.kind === 'month') {
                        const s = new Date(v.year, v.month - 1, 1);
                        setRangeStart(format(startOfMonth(s), 'yyyy-MM-dd'));
                        return;
                    }
                    if (v.kind === 'year') {
                        const s = new Date(v.year, 0, 1);
                        setRangeStart(format(startOfMonth(s), 'yyyy-MM-dd'));
                        return;
                    }
                    if (v.kind === 'range' || v.kind === 'week') {
                        const d = parseLocalSafe(v.startDate);
                        setRangeStart(format(startOfMonth(d), 'yyyy-MM-dd'));
                        return;
                    }
                    if (v.kind === 'date') {
                        const d = parseLocalSafe(v.date);
                        setRangeStart(format(startOfMonth(d), 'yyyy-MM-dd'));
                    }
                }}
            />
        </div>
    );
}
