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
    PiggyBank
} from 'lucide-react';
import { format, addDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: 'income' | 'expense';
    notes: string;
    calculated_balance?: number;
}

export default function MovementsPage() {
    const supabase = createClient();
    const router = useRouter();

    // Estados de Filtro
    const [filterMode, setFilterMode] = useState<'single' | 'range'>('single');
    const [selectedDate, setSelectedDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
    const [rangeStart, setRangeStart] = useState<string | null>(null);
    const [rangeEnd, setRangeEnd] = useState<string | null>(null);

    // Estados de UI
    const [showCalendar, setShowCalendar] = useState<'single' | 'range' | null>(null);
    const [calendarBaseDate, setCalendarBaseDate] = useState(new Date());
    const [loading, setLoading] = useState(true);

    // Datos
    const [movements, setMovements] = useState<Movement[]>([]);
    const [summary, setSummary] = useState({
        income: 0,
        expense: 0,
        balance: 0
    });

    useEffect(() => {
        fetchMovements();
    }, [selectedDate, rangeStart, rangeEnd, filterMode]);

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
                    setSummary({ income: 0, expense: 0, balance: 0 });
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

            const { data } = await supabase
                .from('treasury_log')
                .select('*')
                .eq('box_id', box.id)
                .gte('created_at', startISO)
                .lte('created_at', endISO)
                .order('created_at', { ascending: false });

            if (data) {
                setMovements(data.map((m: any) => ({
                    ...m,
                    type: (m.type === 'IN' || m.type === 'CLOSE_ENTRY') ? 'income' : 'expense'
                })));
                const inc = data.filter(m => (m.type === 'IN' || m.type === 'CLOSE_ENTRY')).reduce((sum, m) => sum + m.amount, 0);
                const exp = data.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.amount, 0);
                setSummary({
                    income: inc,
                    expense: exp,
                    balance: inc - exp
                });
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    // Calendario
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

    const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

    return (
        <div className="min-h-screen bg-[#36606F] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-[2.5rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[80vh]">

                    {/* Header */}
                    <div className="bg-[#36606F] px-8 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Wallet className="text-white" size={20} />
                            <h1 className="text-base font-black text-white uppercase tracking-wider">
                                Movimientos Caja
                            </h1>
                        </div>
                        <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors">
                            <X size={20} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">
                        {/* Filters */}
                        <div className="mb-6 space-y-4">
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Día:</span>
                                    <button
                                        onClick={() => setShowCalendar('single')}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5",
                                            filterMode === 'single' ? "bg-[#36606F] border-[#36606F] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {format(new Date(selectedDate), 'dd MMM', { locale: es })}
                                    </button>
                                </div>
                                <div className="h-4 w-px bg-gray-200 shrink-0 mx-1"></div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Rango:</span>
                                    <button
                                        onClick={() => setShowCalendar('range')}
                                        className={cn(
                                            "h-8 px-3 rounded-lg text-[10px] font-bold border-2 transition-all flex items-center gap-1.5",
                                            filterMode === 'range' ? "bg-[#36606F] border-[#36606F] text-white shadow-sm" : "bg-gray-50 border-gray-100 text-gray-500 hover:border-gray-200"
                                        )}
                                    >
                                        <Calendar size={12} />
                                        {rangeStart && rangeEnd
                                            ? `${format(new Date(rangeStart), 'dd MMM', { locale: es })} - ${format(new Date(rangeEnd), 'dd MMM', { locale: es })}`
                                            : 'Selec...'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Clean KPI Summary */}
                        <div className="grid grid-cols-3 gap-8 py-6 px-4 border-b border-gray-100 mb-8">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Entradas</span>
                                <span className="text-2xl font-black text-emerald-500">+{summary.income.toFixed(0)}€</span>
                            </div>
                            <div className="flex flex-col items-center border-x border-gray-50">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Salidas</span>
                                <span className="text-2xl font-black text-rose-500">-{summary.expense.toFixed(0)}€</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Balance Neto</span>
                                <span className={cn(
                                    "text-2xl font-black",
                                    summary.balance >= 0 ? "text-[#36606F]" : "text-orange-500"
                                )}>
                                    {summary.balance.toFixed(0)}€
                                </span>
                            </div>
                        </div>

                        {/* Movements List */}
                        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="text-center py-20 text-gray-300 font-bold animate-pulse uppercase tracking-widest text-[10px]">Cargando movimientos...</div>
                                ) : movements.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-50 rounded-[2.5rem] border-2 border-dashed border-gray-100">
                                        <PiggyBank size={32} className="mx-auto text-gray-200 mb-2" />
                                        <p className="text-gray-400 font-bold text-xs uppercase tracking-widest">Sin movimientos</p>
                                    </div>
                                ) : (
                                    movements.map((mov, i) => {
                                        const isIncome = mov.type === 'income';
                                        return (
                                            <div key={mov.id} className="bg-gray-50/50 hover:bg-white p-4 rounded-2xl border border-gray-100 flex items-center justify-between transition-all hover:shadow-md group">
                                                <div className="flex items-center gap-4">
                                                    <div className={cn(
                                                        "w-10 h-10 rounded-xl flex items-center justify-center transition-all group-hover:scale-110",
                                                        isIncome ? "bg-emerald-50 text-emerald-500" : "bg-rose-50 text-rose-500"
                                                    )}>
                                                        {isIncome ? <ArrowDownLeft size={20} strokeWidth={3} /> : <ArrowUpRight size={20} strokeWidth={3} />}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-black text-gray-800 uppercase truncate max-w-[150px]">{mov.notes || (isIncome ? 'Entrada manual' : 'Salida manual')}</span>
                                                        <span className="text-[10px] font-bold text-gray-400 uppercase">{format(new Date(mov.created_at), 'eeee d MMM', { locale: es })}</span>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <span className={cn(
                                                        "text-sm font-black block",
                                                        isIncome ? "text-emerald-500" : "text-rose-500"
                                                    )}>
                                                        {isIncome ? '+' : '-'}{mov.amount.toFixed(2)}€
                                                    </span>
                                                    <span className="text-[9px] font-bold text-gray-300 font-mono uppercase">
                                                        {format(new Date(mov.created_at), 'HH:mm')}
                                                    </span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* MODAL CALENDARIO */}
                {showCalendar && (
                    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowCalendar(null)}>
                        <div className="bg-white rounded-[2rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                            <div className="p-5 border-b border-gray-50 flex items-center justify-between bg-gray-50/50">
                                <h3 className="font-black text-gray-800 uppercase text-[10px] tracking-widest">{showCalendar === 'single' ? 'Fecha Única' : 'Rango de Fechas'}</h3>
                                <button onClick={() => setShowCalendar(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X size={18} className="text-gray-400" /></button>
                            </div>

                            <div className="p-4">
                                <div className="flex items-center justify-between mb-4 px-2">
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() - 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronLeft size={20} className="text-gray-600" /></button>
                                    <span className="font-black text-gray-800 text-xs uppercase tracking-tighter">{calendarBaseDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
                                    <button onClick={() => setCalendarBaseDate(new Date(calendarBaseDate.getFullYear(), calendarBaseDate.getMonth() + 1, 1))} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><ChevronRight size={20} className="text-gray-600" /></button>
                                </div>

                                <div className="grid grid-cols-7 gap-1">
                                    {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                        <div key={d} className="text-center text-[9px] font-black text-gray-300 py-2">{d}</div>
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
                                                    "aspect-square flex items-center justify-center rounded-xl text-xs font-black transition-all",
                                                    isSelected ? "bg-[#36606F] text-white shadow-md" : isInRange ? "bg-blue-50 text-[#36606F]" : "hover:bg-gray-100 text-gray-700"
                                                )}
                                            >
                                                {day}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                            {showCalendar === 'range' && rangeStart && !rangeEnd && (
                                <div className="px-6 pb-6 text-center">
                                    <span className="inline-block px-3 py-1 bg-amber-50 text-amber-700 text-[9px] font-black rounded-full uppercase tracking-widest animate-pulse">
                                        Selecciona fecha final
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}