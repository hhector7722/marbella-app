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
    const [rangeStart, setRangeStart] = useState<string | null>(() => startOfMonth(new Date()).toISOString().split('T')[0]);
    const [rangeEnd, setRangeEnd] = useState<string | null>(() => endOfMonth(new Date()).toISOString().split('T')[0]);
    const [typeFilter, setTypeFilter] = useState<'all' | 'income' | 'expense'>('all');

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
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
        <div className="min-h-screen bg-zinc-50 p-4 md:p-8 pb-24">
            <div className="max-w-6xl mx-auto space-y-6">

                {/* CABECERA TIPO BANCO */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-8 rounded-[2.5rem] shadow-sm border border-zinc-100">
                    <div className="flex items-center gap-6">
                        <button onClick={() => router.back()} className="w-12 h-12 flex items-center justify-center bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-all text-zinc-400">
                            <ArrowLeft size={20} />
                        </button>
                        <div>
                            <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tight">Extracto de Caja</h1>
                            <p className="text-zinc-400 font-bold text-[10px] uppercase tracking-widest mt-0.5">Bar La Marbella • Cuenta Operativa</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="text-right px-6 border-r border-zinc-100">
                            <span className="block text-[9px] font-black text-zinc-300 uppercase tracking-widest leading-none mb-1">Saldo Actual</span>
                            <span className="text-3xl font-black text-[#5B8FB9] tabular-nums">{summary.currentBalance.toFixed(2)}€</span>
                        </div>
                        <button className="flex items-center gap-2 bg-[#36606F] text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-[#2A4C58] transition-all active:scale-95 shadow-lg shadow-blue-900/10">
                            <Download size={14} />
                            Exportar
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    {/* FILTROS LATERALES */}
                    <div className="md:col-span-1 space-y-6">
                        <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-zinc-100 space-y-6">
                            <div>
                                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Periodo</h3>
                                <div className="space-y-2">
                                    <button
                                        onClick={() => setShowCalendar('range')}
                                        className={cn(
                                            "w-full p-4 rounded-2xl text-[10px] font-black uppercase text-left border-2 transition-all flex items-center justify-between",
                                            filterMode === 'range' ? "bg-zinc-900 border-zinc-900 text-white shadow-xl" : "bg-zinc-50 border-transparent text-zinc-500 hover:border-zinc-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Calendar size={14} />
                                            <span>Rango Personalizado</span>
                                        </div>
                                    </button>
                                    <button
                                        onClick={() => setShowCalendar('single')}
                                        className={cn(
                                            "w-full p-4 rounded-2xl text-[10px] font-black uppercase text-left border-2 transition-all flex items-center justify-between",
                                            filterMode === 'single' ? "bg-zinc-900 border-zinc-900 text-white shadow-xl" : "bg-zinc-50 border-transparent text-zinc-500 hover:border-zinc-200"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Calendar size={14} />
                                            <span>Un solo día</span>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-zinc-50">
                                <h3 className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-4">Tipo de Movimiento</h3>
                                <div className="flex flex-col gap-1.5 font-black text-[10px] uppercase tracking-widest">
                                    <button
                                        onClick={() => setTypeFilter('all')}
                                        className={cn("p-4 rounded-2xl text-left transition-all", typeFilter === 'all' ? "bg-[#5B8FB9] text-white" : "hover:bg-zinc-50 text-zinc-400")}
                                    >
                                        Todos
                                    </button>
                                    <button
                                        onClick={() => setTypeFilter('income')}
                                        className={cn("p-4 rounded-2xl text-left transition-all", typeFilter === 'income' ? "bg-emerald-500 text-white" : "hover:bg-zinc-50 text-emerald-500/60")}
                                    >
                                        Entradas
                                    </button>
                                    <button
                                        onClick={() => setTypeFilter('expense')}
                                        className={cn("p-4 rounded-2xl text-left transition-all", typeFilter === 'expense' ? "bg-rose-500 text-white" : "hover:bg-zinc-50 text-rose-500/60")}
                                    >
                                        Salidas
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* RESUMEN DEL RANGO */}
                        <div className="bg-zinc-900 p-8 rounded-[2.5rem] text-white shadow-2xl">
                            <span className="block text-[9px] font-black text-white/30 uppercase tracking-widest mb-4">Resumen del Periodo</span>
                            <div className="space-y-6">
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-white/50 uppercase">Entradas</span>
                                    <span className="text-xl font-black text-emerald-400">+{summary.income.toFixed(0)}€</span>
                                </div>
                                <div className="flex justify-between items-end">
                                    <span className="text-[10px] font-bold text-white/50 uppercase">Salidas</span>
                                    <span className="text-xl font-black text-rose-400">-{summary.expense.toFixed(0)}€</span>
                                </div>
                                <div className="pt-6 border-t border-white/10 flex justify-between items-end">
                                    <span className="text-[10px] font-black uppercase text-white/80">Neto</span>
                                    <span className={cn("text-2xl font-black", summary.balance >= 0 ? "text-emerald-400" : "text-orange-400")}>
                                        {summary.balance.toFixed(0)}€
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* LISTADO DE EXTRACTO */}
                    <div className="md:col-span-3 bg-white rounded-[2.5rem] shadow-sm border border-zinc-100 overflow-hidden flex flex-col min-h-[600px]">
                        <div className="p-8 border-b border-zinc-50 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest">Actividad Reciente</span>
                                <h2 className="text-lg font-black text-zinc-900 uppercase">
                                    {filterMode === 'single'
                                        ? format(new Date(selectedDate), 'd MMMM yyyy', { locale: es })
                                        : `${format(new Date(rangeStart!), 'd MMM', { locale: es })} - ${format(new Date(rangeEnd!), 'd MMM yyyy', { locale: es })}`}
                                </h2>
                            </div>
                        </div>

                        <div className="flex-1 overflow-x-auto overflow-y-auto no-scrollbar">
                            {loading ? (
                                <div className="flex items-center justify-center h-full py-20">
                                    <LoadingSpinner size="lg" />
                                </div>
                            ) : movements.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full py-32 opacity-20">
                                    <PiggyBank size={64} className="mb-4" />
                                    <p className="text-sm font-black uppercase tracking-widest">Sin actividad en este periodo</p>
                                </div>
                            ) : (
                                <div className="min-w-[600px]">
                                    <table className="w-full text-left">
                                        <thead>
                                            <tr className="bg-zinc-50/50 text-[9px] font-black text-zinc-400 uppercase tracking-[0.2em]">
                                                <th className="px-8 py-5">Fecha / Hora</th>
                                                <th className="px-4 py-5">Concepto</th>
                                                <th className="px-4 py-5 text-right">Cantidad</th>
                                                <th className="px-8 py-5 text-right">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50">
                                            {movements.map((mov) => {
                                                const isIncome = mov.type === 'income';
                                                return (
                                                    <tr key={mov.id} className="hover:bg-zinc-50/50 transition-colors group">
                                                        <td className="px-8 py-6">
                                                            <div className="flex flex-col">
                                                                <span className="text-[11px] font-black text-zinc-900 capitalize">{format(new Date(mov.created_at), 'eeee d MMM', { locale: es })}</span>
                                                                <span className="text-[10px] font-bold text-zinc-400 font-mono">{format(new Date(mov.created_at), 'HH:mm')}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-6">
                                                            <div className="flex items-center gap-4">
                                                                <div className={cn(
                                                                    "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                                                    isIncome ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                                                                )}>
                                                                    {isIncome ? <ArrowDown size={18} strokeWidth={3} /> : <ArrowUp size={18} strokeWidth={3} />}
                                                                </div>
                                                                <span className="text-[11px] font-bold text-zinc-600 uppercase max-w-[250px] truncate">{mov.notes || (isIncome ? 'Entrada manual' : 'Salida manual')}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-6 text-right">
                                                            <span className={cn(
                                                                "text-sm font-black tabular-nums",
                                                                isIncome ? "text-emerald-600" : "text-rose-600"
                                                            )}>
                                                                {isIncome ? '+' : '-'}{mov.amount.toFixed(2)}€
                                                            </span>
                                                        </td>
                                                        <td className="px-8 py-6 text-right">
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
            </div>
        </div>
    );
}