'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    Search,
    Filter,
    X,
    Calendar,
    ChevronLeft,
    ChevronRight,
    TrendingUp,
    Wallet,
    TrendingDown,
    PiggyBank,
    ArrowRightLeft,
    ArrowUp,
    ArrowDown,
    Download
} from 'lucide-react';
import { format, addDays, startOfMonth, endOfMonth, isSameMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: 'income' | 'expense';
    notes: string;
    running_balance: number;
}

export default function MovementsPage() {
    const supabase = createClient();
    const router = useRouter();

    // Estados de Filtro
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('range');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'));
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'));
    const [pickerYear, setPickerYear] = useState(new Date().getFullYear());
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [showMonthPicker, setShowMonthPicker] = useState(false);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Datos
    const [movements, setMovements] = useState<Movement[]>([]);
    const [summary, setSummary] = useState({
        income: 0,
        expense: 0,
        balance: 0,
        currentBalance: 0,
        initialBalanceInRange: 0
    });

    useEffect(() => {
        fetchMovements();
    }, [selectedDate, rangeStart, rangeEnd, filterMode, typeFilter]);

    async function fetchMovements() {
        setLoading(true);
        try {
            const { data: box } = await supabase.from('cash_boxes').select('id, current_balance').eq('type', 'operational').maybeSingle();
            if (!box) return;

            let startISO: string;
            let endISO: string;

            if (filterMode === 'single') {
                const d = new Date(selectedDate);
                d.setHours(0, 0, 0, 0);
                startISO = d.toISOString();
                d.setHours(23, 59, 59, 999);
                endISO = d.toISOString();
            } else {
                if (!rangeStart || !rangeEnd) {
                    setMovements([]);
                    setSummary({ income: 0, expense: 0, balance: 0, currentBalance: box.current_balance, initialBalanceInRange: 0 });
                    setLoading(false);
                    return;
                }
                const s = new Date(rangeStart);
                s.setHours(0, 0, 0, 0);
                const e = new Date(rangeEnd);
                e.setHours(23, 59, 59, 999);
                startISO = s.toISOString();
                endISO = e.toISOString();
            }

            // 1. Obtener todos los movimientos desde el FIN del rango hasta AHORA
            // para calcular el saldo que había al finalizar el rango.
            const { data: futureMoves } = await supabase
                .from('treasury_log')
                .select('amount, type')
                .eq('box_id', box.id)
                .neq('type', 'ADJUSTMENT')
                .gt('created_at', endISO);

            const futureSum = futureMoves?.reduce((sum, m) => {
                const isInc = (m.type === 'IN' || m.type === 'CLOSE_ENTRY');
                return sum + (isInc ? m.amount : -m.amount);
            }, 0) || 0;

            const balanceAtEnd = box.current_balance - futureSum;

            // 2. Obtener movimientos dentro del rango
            const { data: rangeMoves } = await supabase
                .from('treasury_log')
                .select('*')
                .eq('box_id', box.id)
                .neq('type', 'ADJUSTMENT')
                .gte('created_at', startISO)
                .lte('created_at', endISO)
                .order('created_at', { ascending: false });

            if (rangeMoves) {
                let currentRunning = balanceAtEnd;
                const processed = rangeMoves.map((m: any) => {
                    const movement = {
                        ...m,
                        type: (m.type === 'IN' || m.type === 'CLOSE_ENTRY') ? 'income' : 'expense',
                        running_balance: currentRunning
                    };
                    // Preparar el saldo para la FILA ANTERIOR (más antigua)
                    const isInc = (m.type === 'IN' || m.type === 'CLOSE_ENTRY');
                    currentRunning -= (isInc ? m.amount : -m.amount);
                    return movement;
                });

                const filtered = typeFilter === 'all'
                    ? processed
                    : processed.filter(m => m.type === typeFilter);

                const inc = rangeMoves.filter(m => (m.type === 'IN' || m.type === 'CLOSE_ENTRY')).reduce((sum, m) => sum + m.amount, 0);
                const exp = rangeMoves.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.amount, 0);

                setMovements(filtered);
                setSummary({
                    income: inc,
                    expense: exp,
                    balance: inc - exp,
                    currentBalance: box.current_balance,
                    initialBalanceInRange: currentRunning
                });
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const monthsList = Array.from({ length: 6 }).map((_, i) => {
        const d = subMonths(new Date(), i);
        return {
            label: format(d, 'MMMM', { locale: es }),
            start: startOfMonth(d),
            end: endOfMonth(d),
            isCurrent: i === 0
        };
    });

    const handleMonthSelect = (m: { start: Date, end: Date }) => {
        setRangeStart(format(m.start, 'yyyy-MM-dd'));
        setRangeEnd(format(m.end, 'yyyy-MM-dd'));
        setFilterMode('range');
    };

    const generateCalendarDays = () => {
        const year = calendarBaseDate.getFullYear();
        const month = calendarBaseDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const days: (number | null)[] = [];
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(d);
        return days;
    };

    const handleDateSelect = (day: number) => {
        const dateStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (showCalendar === 'single') {
            setSelectedDate(dateStr);
            setFilterMode('single');
            setShowCalendar(null);
        } else if (showCalendar === 'range') {
            if (!rangeStart || (rangeStart && rangeEnd)) {
                setRangeStart(dateStr);
                setRangeEnd(null);
            } else {
                if (new Date(dateStr) < new Date(rangeStart)) {
                    setRangeStart(dateStr);
                } else {
                    setRangeEnd(dateStr);
                    setFilterMode('range');
                    setShowCalendar(null);
                }
            }
        }
    };

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-8 pb-24 text-zinc-900">
            <div className="max-w-4xl mx-auto space-y-6">

                {/* CABECERA COMPACTA */}
                <div className="flex items-center justify-between bg-white/20 backdrop-blur-md px-6 py-4 rounded-[2rem] border border-white/20 shadow-xl">
                    <div className="flex items-center gap-4">
                        <button onClick={() => router.back()} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-xl hover:bg-white/30 transition-all text-white">
                            <ArrowLeft size={20} strokeWidth={3} />
                        </button>
                        <h1 className="text-xl font-black text-white uppercase tracking-tight italic">Caja Inicial</h1>
                    </div>

                    <div className="flex items-center gap-6">
                        <button className="flex items-center justify-center w-10 h-10 bg-emerald-500 text-white rounded-xl shadow-lg shadow-emerald-900/20 active:scale-95 transition-all outline-none">
                            <Download size={18} strokeWidth={3} />
                        </button>
                    </div>
                </div>

                {/* FILTROS EN UNA SOLA FILA */}
                <div className="bg-white p-4 rounded-[2rem] shadow-xl border border-white/10 flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                        <button
                            onClick={() => setShowMonthPicker(true)}
                            className={cn(
                                "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 flex items-center justify-center gap-2 outline-none",
                                filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                    ? "bg-[#36606F] border-[#36606F] text-white shadow-lg"
                                    : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200"
                            )}
                        >
                            <Calendar size={14} />
                            {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                : 'Seleccionar Mes'}
                        </button>

                        <button
                            onClick={() => {
                                setRangeStart(null);
                                setRangeEnd(null);
                                setShowCalendar('range');
                            }}
                            className={cn(
                                "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black border-2 transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
                                filterMode === 'range' && rangeStart && rangeEnd && !isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                    ? "bg-[#36606F] border-[#36606F] text-white shadow-lg"
                                    : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                            )}
                        >
                            <Calendar size={14} />
                            {filterMode === 'range' && rangeStart && rangeEnd && !isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                ? `${format(new Date(rangeStart!), 'dd MMM', { locale: es })} - ${format(new Date(rangeEnd!), 'dd MMM', { locale: es })}`
                                : 'Rango'}
                        </button>

                        <button
                            onClick={() => setShowCalendar('single')}
                            className={cn(
                                "flex-1 px-4 py-2.5 rounded-xl text-[10px] font-black border-2 transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
                                filterMode === 'single' ? "bg-[#36606F] border-[#36606F] text-white shadow-lg" : "bg-white border-zinc-100 text-zinc-400 hover:border-zinc-200"
                            )}
                        >
                            <Calendar size={14} />
                            {filterMode === 'single' ? format(new Date(selectedDate), 'dd MMMM', { locale: es }) : 'Día Único'}
                        </button>
                    </div>
                </div>

                {/* RESUMEN SEGÚN FILTRO (BENTO GRID - UNA SOLA FILA) */}
                <div className="bg-white rounded-[2rem] shadow-xl border border-white/10 overflow-hidden divide-x divide-zinc-50 grid grid-cols-3">
                    <div className="p-4 md:p-6 flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] md:text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Ingresos</span>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <span className="text-lg md:text-2xl font-black text-emerald-500">+{summary.income.toFixed(0)}€</span>
                        </div>
                    </div>

                    <div className="p-4 md:p-6 flex flex-col items-center justify-center text-center">
                        <span className="text-[9px] md:text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Gastos</span>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <span className="text-lg md:text-2xl font-black text-rose-500">-{summary.expense.toFixed(0)}€</span>
                        </div>
                    </div>

                    <div className="p-4 md:p-6 flex flex-col items-center justify-center text-center bg-zinc-50/50">
                        <span className="text-[9px] md:text-[10px] font-black text-[#36606F] uppercase tracking-widest mb-1">Saldo</span>
                        <div className="flex items-center gap-1.5 md:gap-2">
                            <span className="text-lg md:text-2xl font-black text-[#36606F] tabular-nums">
                                {summary.currentBalance.toFixed(2)}€
                            </span>
                        </div>
                    </div>
                </div>


                {/* TARJETA DE MOVIMIENTOS */}
                <div className="bg-white rounded-[2.5rem] shadow-2xl border border-white/10 overflow-hidden flex flex-col min-h-[500px]">
                    <div className="px-8 py-6 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
                        <h3 className="text-xs font-black text-zinc-900 uppercase tracking-widest flex items-center gap-2">
                            <ArrowRightLeft size={16} className="text-[#5B8FB9]" />
                            Listado de Operaciones
                        </h3>
                        <span className="text-[10px] font-bold text-zinc-400 uppercase">{movements.length} movimientos</span>
                    </div>

                    <div className="flex-1 overflow-x-auto no-scrollbar">
                        {loading ? (
                            <div className="flex items-center justify-center h-full py-24">
                                <LoadingSpinner size="lg" />
                            </div>
                        ) : movements.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full py-32 opacity-20">
                                <PiggyBank size={64} className="mb-4 text-[#5B8FB9]" />
                                <p className="text-sm font-black uppercase tracking-widest">Sin actividad en este rango</p>
                            </div>
                        ) : (
                            <div className="min-w-[700px]">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="bg-zinc-50/30 text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em] border-b border-zinc-100">
                                            <th className="px-8 py-5">Fecha / Hora</th>
                                            <th className="px-4 py-5">Concepto</th>
                                            <th className="px-4 py-5 text-right">Monto</th>
                                            <th className="px-8 py-5 text-right">Saldo</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-zinc-50">
                                        {movements.map((mov, idx) => {
                                            const isIncome = mov.type === 'income';
                                            return (
                                                <tr
                                                    key={mov.id}
                                                    className={cn(
                                                        "transition-colors group",
                                                        idx % 2 === 0 ? "bg-white" : "bg-zinc-50/30"
                                                    )}
                                                >
                                                    <td className="px-8 py-5">
                                                        <div className="flex flex-col">
                                                            <span className="text-[11px] font-black text-zinc-900 capitalize italic">{format(new Date(mov.created_at), 'eeee d MMM', { locale: es })}</span>
                                                            <span className="text-[10px] font-bold text-zinc-400 font-mono">{format(new Date(mov.created_at), 'HH:mm')}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-5">
                                                        <div className="flex items-center gap-4">
                                                            <div className={cn(
                                                                "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                                                isIncome ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                                                            )}>
                                                                {isIncome ? <ArrowDown size={16} strokeWidth={3} /> : <ArrowUp size={16} strokeWidth={3} />}
                                                            </div>
                                                            <span className="text-[11px] font-bold text-zinc-600 uppercase max-w-[300px] truncate">{mov.notes || (isIncome ? 'Entrada manual' : 'Salida manual')}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-5 text-right">
                                                        <span className={cn(
                                                            "text-sm font-black tabular-nums",
                                                            isIncome ? "text-emerald-600" : "text-rose-600"
                                                        )}>
                                                            {isIncome ? '+' : '-'}{mov.amount.toFixed(2)}€
                                                        </span>
                                                    </td>
                                                    <td className="px-8 py-5 text-right">
                                                        <span className="text-sm font-black text-zinc-900 tabular-nums">
                                                            {mov.running_balance.toFixed(2)}€
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL CALENDARIO */}
            {showCalendar && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                            <button onClick={() => setShowCalendar(null)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6 px-2">
                                <button onClick={() => setCalendarBaseDate(subMonths(calendarBaseDate, 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-zinc-900 text-xs uppercase tracking-tight">{format(calendarBaseDate, 'MMMM yyyy', { locale: es })}</span>
                                <button onClick={() => setCalendarBaseDate(addDays(endOfMonth(calendarBaseDate), 1))} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>

                            <div className="grid grid-cols-7 gap-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-[9px] font-black text-zinc-300 py-2">{d}</div>
                                ))}
                                {generateCalendarDays().map((day, i) => {
                                    if (!day) return <div key={i} />;
                                    const dStr = `${calendarBaseDate.getFullYear()}-${String(calendarBaseDate.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const isSelected = showCalendar === 'single' ? selectedDate === dStr : (rangeStart === dStr || rangeEnd === dStr);
                                    const isInRange = showCalendar === 'range' && rangeStart && rangeEnd && new Date(dStr) > new Date(rangeStart) && new Date(dStr) < new Date(rangeEnd);

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => handleDateSelect(day)}
                                            className={cn(
                                                "aspect-square flex items-center justify-center rounded-2xl text-[11px] font-black transition-all",
                                                isSelected ? "bg-zinc-900 text-white shadow-xl scale-110" : isInRange ? "bg-blue-50 text-[#5B8FB9]" : "hover:bg-zinc-50 text-zinc-600"
                                            )}
                                        >
                                            {day}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL SELECTOR DE MES / AÑO */}
            {showMonthPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar Mes</h3>
                            <button onClick={() => setShowMonthPicker(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>

                        <div className="p-6">
                            {/* Selector de Año */}
                            <div className="flex items-center justify-between mb-8 px-2">
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronLeft size={20} className="text-zinc-400" />
                                </button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors">
                                    <ChevronRight size={20} className="text-zinc-400" />
                                </button>
                            </div>

                            {/* Rejilla de Meses */}
                            <div className="grid grid-cols-3 gap-2">
                                {Array.from({ length: 12 }).map((_, i) => {
                                    const date = new Date(pickerYear, i, 1);
                                    const isSelected = filterMode === 'range' && rangeStart === format(startOfMonth(date), 'yyyy-MM-dd') && rangeEnd === format(endOfMonth(date), 'yyyy-MM-dd');

                                    return (
                                        <button
                                            key={i}
                                            onClick={() => {
                                                const s = startOfMonth(date);
                                                const e = endOfMonth(date);
                                                setRangeStart(format(s, 'yyyy-MM-dd'));
                                                setRangeEnd(format(e, 'yyyy-MM-dd'));
                                                setFilterMode('range');
                                                setShowMonthPicker(false);
                                            }}
                                            className={cn(
                                                "py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2",
                                                isSelected
                                                    ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105"
                                                    : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
                                            )}
                                        >
                                            {format(date, 'MMM', { locale: es })}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}