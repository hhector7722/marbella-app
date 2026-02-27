'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ArrowDownLeft,
    ArrowUpRight,
    Plus,
    Minus,
    Search,
    Filter,
    X,
    Calendar,
    ChevronLeft,
    ChevronRight,
    Check,
    TrendingUp,
    Wallet,
    TrendingDown,
    PiggyBank,
    ArrowRightLeft,
    ArrowUp,
    ArrowDown,
    Download,
    RefreshCw,
    AlertTriangle
} from 'lucide-react';

import { toast } from 'sonner';
import { format, addDays, startOfMonth, endOfMonth, isSameMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { CashDenominationForm } from '@/components/CashDenominationForm';
import { BoxInventoryView } from '@/components/BoxInventoryView';
import { MovementDetailModal } from '@/components/MovementDetailModal';
import CashClosingModal from '@/components/CashClosingModal';

interface Movement {
    id: string;
    created_at: string;
    amount: number;
    type: 'income' | 'expense';
    notes: string;
    running_balance: number;
    breakdown?: any;
    original_type?: string;
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
    const [isClosingModalOpen, setIsClosingModalOpen] = useState(false);

    // Datos
    const [movements, setMovements] = useState<Movement[]>([]);
    const [boxData, setBoxData] = useState<any>(null);
    const [cashModalMode, setCashModalMode] = useState<'none' | 'in' | 'out' | 'audit' | 'inventory'>('none');
    const [boxInventoryMap, setBoxInventoryMap] = useState<Record<number, number>>({});
    const [boxInventory, setBoxInventory] = useState<any[]>([]);
    const [summary, setSummary] = useState({
        income: 0,
        expense: 0,
        difference: 0,
        balance: 0,
        currentBalance: 0,
        initialBalanceInRange: 0
    });
    const [selectedMovement, setSelectedMovement] = useState<Movement | null>(null);

    // ARCHITECT_ULTRAFLUIDITY: Incremental rendering to keep Main Thread free
    const [displayLimit, setDisplayLimit] = useState(40);
    const visibleMovements = movements.slice(0, displayLimit);

    useEffect(() => {
        fetchMovements();
    }, [selectedDate, rangeStart, rangeEnd, filterMode, typeFilter]);

    async function fetchMovements() {
        setLoading(true);
        try {
            const { data: box } = await supabase.from('cash_boxes').select('id, current_balance, name').eq('type', 'operational').maybeSingle();
            if (!box) return;
            setBoxData(box);

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
                    setSummary({ income: 0, expense: 0, difference: 0, balance: 0, currentBalance: box.current_balance, initialBalanceInRange: 0 });
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

            // 1. Obtener datos básicos de la caja
            const { data: rangeMoves } = await supabase
                .from('treasury_log')
                .select('*')
                .gte('created_at', startISO)
                .lte('created_at', endISO)
                .order('created_at', { ascending: false });

            // 2. Obtener SALDO (Suma de IN/OUT históricos ignorando Arqueos)
            // Para un periodo dado, el saldo al final es: SUM(IN) - SUM(OUT) de TODO el pasado.
            const { data: runningData } = await supabase.rpc('get_theoretical_balance', {
                target_date: endISO
            });

            const theoreticalEndValue = runningData || 0;

            if (rangeMoves) {
                let currentRunning = theoreticalEndValue;

                const processed = rangeMoves.map((m: any) => {
                    const movement: Movement = {
                        ...m,
                        type: (m.type === 'IN' || m.type === 'CLOSE_ENTRY') ? 'income' :
                            (m.type === 'OUT' ? 'expense' : 'adjustment'),
                        original_type: m.type,
                        running_balance: currentRunning
                    };

                    // El saldo en la tabla sigue la línea de flujo (IN/OUT)
                    if (m.type === 'IN' || m.type === 'CLOSE_ENTRY' || m.type === 'OUT') {
                        const isInc = (m.type === 'IN' || m.type === 'CLOSE_ENTRY');
                        currentRunning -= (isInc ? m.amount : -m.amount);
                    }
                    return movement;
                });

                const filtered = processed.filter(m => m.original_type !== 'ADJUSTMENT' && m.original_type !== 'SWAP');
                const inc = rangeMoves.filter(m => (m.type === 'IN' || m.type === 'CLOSE_ENTRY')).reduce((sum, m) => sum + m.amount, 0);
                const exp = rangeMoves.filter(m => m.type === 'OUT').reduce((sum, m) => sum + m.amount, 0);

                // La diferencia es: Caja Real ACTUAL - Saldo ACTUAL
                const difference = box.current_balance - theoreticalEndValue;

                setMovements(filtered);
                setSummary({
                    income: inc,
                    expense: exp,
                    difference: difference,
                    balance: theoreticalEndValue,
                    currentBalance: box.current_balance,
                    initialBalanceInRange: currentRunning
                });
            }
        } catch (error) { console.error(error); } finally { setLoading(false); }
    }

    const handleCashTransaction = async (total: number, breakdown: any, notes: string, customDate?: string) => {
        try {
            if (!boxData) {
                toast.error("Error: Datos de caja no cargados");
                return;
            }

            const payload: any = {
                box_id: boxData.id,
                type: cashModalMode === 'audit' ? 'ADJUSTMENT' : (cashModalMode === 'in' ? 'IN' : 'OUT'),
                amount: total,
                breakdown: breakdown,
                notes: cashModalMode === 'audit' ? 'Arqueo de caja' : notes
            };

            if (customDate) {
                payload.created_at = customDate;
            } else if (selectedDate) {
                payload.created_at = selectedDate;
            }

            const { error } = await supabase.from('treasury_log').insert(payload);

            if (error) throw error;

            setCashModalMode('none');
            fetchMovements();
            toast.success('Operación realizada correctamente');
        } catch (error) {
            console.error(error);
            toast.error("Error al registrar operación");
        }
    };

    const openAudit = async () => {
        if (!boxData) return;
        const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxData.id).gt('quantity', 0);
        const initial: Record<number, number> = {};
        data?.forEach((d: any) => initial[Number(d.denomination)] = d.quantity);
        setBoxInventoryMap(initial);
        setBoxInventory(data || []);
        setCashModalMode('audit');
    };

    const openOut = async () => {
        if (!boxData) return;
        setBoxInventoryMap({});
        setBoxInventory([]);
        setCashModalMode('out');
    };

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

                {/* TARJETA GLOBAL INTEGRADA (TODO EN UN BLOQUE) */}
                <div className="bg-white rounded-[2.5rem] shadow-2xl overflow-hidden">

                    {/* CABECERA OSCURA INTEGRADA (TÍTULO + ACCIONES + FILTROS) */}
                    <div className="bg-[#36606F] p-4 md:p-6 space-y-6">
                        <div className="flex items-center justify-between gap-2 md:gap-4">
                            <div className="flex items-center gap-3 md:gap-4 flex-1">
                                <button
                                    onClick={() => router.back()}
                                    className="w-9 h-9 md:w-10 md:h-10 flex items-center justify-center bg-white/10 rounded-full hover:bg-white/20 transition-all text-white border border-white/10 active:scale-95 shrink-0"
                                >
                                    <ArrowLeft className="w-[18px] h-[18px] md:w-5 md:h-5" strokeWidth={3} />
                                </button>
                                <h1 className="text-lg md:text-4xl font-black text-white uppercase tracking-tight italic truncate">Caja Inicial</h1>
                            </div>

                            <div className="flex items-center justify-end gap-1 md:gap-4 shrink-0">
                                <button
                                    onClick={() => setCashModalMode('in')}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-emerald-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <Plus className="w-[14px] h-[14px] md:w-4 md:h-4 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">ENTRADA</span>
                                </button>
                                <button
                                    onClick={openOut}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-rose-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <Minus className="w-[14px] h-[14px] md:w-4 md:h-4 text-white" strokeWidth={3} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">SALIDA</span>
                                </button>
                                <button
                                    onClick={openAudit}
                                    className="bg-transparent hover:bg-white/10 px-1.5 md:px-3 py-1.5 rounded-xl flex flex-col items-center gap-1 transition-all active:scale-95 group"
                                >
                                    <div className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center bg-orange-500 rounded-full shadow-md group-hover:scale-110 transition-transform">
                                        <RefreshCw className="w-3 h-3 md:w-4 md:h-4 text-white" strokeWidth={4} />
                                    </div>
                                    <span className="text-[7px] md:text-[9px] font-black uppercase tracking-widest text-white/90">ARQUEO</span>
                                </button>
                            </div>
                        </div>

                        {/* FILTROS INTEGRADOS EN CABECERA */}
                        <div className="grid grid-cols-3 gap-2 pb-2">
                            <button
                                onClick={() => setShowMonthPicker(true)}
                                className={cn(
                                    "py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border outline-none truncate",
                                    filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? "bg-white border-white text-zinc-800 shadow-sm"
                                        : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                )}
                            >
                                {filterMode === 'range' && rangeStart && rangeEnd && isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                    ? format(new Date(rangeStart), 'MMMM yyyy', { locale: es })
                                    : 'SELECCIONAR MES'}
                            </button>

                            <button
                                onClick={() => {
                                    setRangeStart(null);
                                    setRangeEnd(null);
                                    setShowCalendar('range');
                                }}
                                className={cn(
                                    "py-2 rounded-xl text-[9px] font-black border transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
                                    filterMode === 'range' && rangeStart && rangeEnd && !isSameMonth(new Date(rangeStart), new Date(rangeEnd))
                                        ? "bg-white border-white text-zinc-800 shadow-sm"
                                        : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                )}
                            >
                                PERIODO
                            </button>

                            <button
                                onClick={() => setShowCalendar('single')}
                                className={cn(
                                    "py-2 rounded-xl text-[9px] font-black border transition-all flex items-center justify-center gap-2 uppercase tracking-widest outline-none",
                                    filterMode === 'single' ? "bg-white border-white text-zinc-800 shadow-sm" : "bg-white/5 border-white/20 text-white/70 hover:bg-white/10"
                                )}
                            >
                                FECHA
                            </button>
                        </div>
                    </div>

                    {/* CUERPO BLANCO (RESUMEN + TABLA) */}
                    <div className="bg-white">
                        {/* RESUMEN: Grid 4x1 en móvil y escritorio */}
                        <div className="py-4 px-2 grid grid-cols-4 border-b border-zinc-50">
                            <div className="flex flex-col items-center justify-center text-center px-1">
                                <span className="text-[13px] md:text-2xl font-black text-emerald-500 line-clamp-1">+{summary.income.toFixed(0)}€</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">INGRESOS</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-rose-500 line-clamp-1">-{summary.expense.toFixed(0)}€</span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">GASTOS</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className="text-[13px] md:text-2xl font-black text-[#36606F] line-clamp-1 tabular-nums">
                                    {summary.balance.toFixed(0)}€
                                </span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">SALDO</span>
                            </div>

                            <div className="flex flex-col items-center justify-center text-center border-l border-zinc-100 px-1">
                                <span className={cn(
                                    "text-[13px] md:text-2xl font-black line-clamp-1",
                                    summary.difference > 0 ? "text-blue-500" : summary.difference < 0 ? "text-orange-500" : "text-zinc-400"
                                )}>
                                    {Math.abs(summary.difference) < 0.01 ? "0€" : `${summary.difference > 0 ? '+' : ''}${summary.difference.toFixed(0)}€`}
                                </span>
                                <span className="text-[7px] md:text-[8px] font-black text-zinc-400 uppercase tracking-tight md:tracking-widest mt-0.5">DIFERENCIA</span>
                            </div>
                        </div>

                        {/* LISTADO DE MOVIMIENTOS INTEGRADO */}
                        <div className="p-3 bg-white">
                            <div className="rounded-[1.5rem] overflow-hidden border border-zinc-100 shadow-xl">
                                <div className="w-full">
                                    <table className="w-full text-left font-sans">
                                        <thead className="bg-[#36606F] text-white">
                                            <tr className="text-[9px] md:text-[10px] font-black uppercase tracking-wider md:tracking-[0.15em]">
                                                <th className="px-3 md:px-6 py-4 w-[22%]">FECHA</th>
                                                <th className="px-2 md:px-6 py-4 w-[38%]">CONCEPTO</th>
                                                <th className="px-2 md:px-6 py-4 text-center w-[20%]">IMPORTE</th>
                                                <th className="px-3 md:px-8 py-4 text-right w-[20%]">SALDO</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-zinc-50/50">
                                            {loading ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20">
                                                        <div className="flex items-center justify-center">
                                                            <LoadingSpinner size="lg" />
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : movements.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="py-20 text-center">
                                                        <div className="flex flex-col items-center justify-center gap-2 opacity-20">
                                                            <PiggyBank size={32} />
                                                            <span className="text-[10px] font-black uppercase tracking-widest">Sin movimientos</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : (
                                                visibleMovements.map((mov) => {
                                                    const date = new Date(mov.created_at);
                                                    return (
                                                        <tr
                                                            key={mov.id}
                                                            className="group hover:bg-zinc-50/80 transition-colors cursor-pointer active:bg-zinc-100"
                                                            onClick={() => setSelectedMovement(mov)}
                                                        >
                                                            <td className="px-3 md:px-6 py-3">
                                                                <div className="flex flex-col">
                                                                    <span className="text-[10px] md:text-[13px] font-black text-zinc-900 italic">
                                                                        <span className="md:inline hidden">{format(date, 'eeee d MMM', { locale: es })}</span>
                                                                        <span className="md:hidden inline">{format(date, 'd MMM', { locale: es })}</span>
                                                                    </span>
                                                                    <span className="text-[8px] md:text-[10px] font-bold text-zinc-400 font-mono">
                                                                        {format(date, 'HH:mm')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 md:px-6 py-3">
                                                                <div className="flex items-center gap-1.5 md:gap-3">
                                                                    <div className={cn(
                                                                        "w-5 h-5 md:w-8 md:h-8 rounded-md md:rounded-lg flex items-center justify-center shrink-0 shadow-sm transition-transform group-hover:scale-110",
                                                                        mov.type === 'income' ? "bg-emerald-50 text-emerald-500" :
                                                                            mov.type === 'expense' ? "bg-rose-50 text-rose-500" :
                                                                                "bg-orange-50 text-orange-500"
                                                                    )}>
                                                                        {mov.type === 'income' ? <Plus size={10} className="md:size-[16px]" strokeWidth={3} /> :
                                                                            mov.type === 'expense' ? <ArrowUp size={10} className="md:size-[16px]" strokeWidth={3} /> :
                                                                                <RefreshCw size={10} className="md:size-[14px]" strokeWidth={3} />}
                                                                    </div>
                                                                    <span className="text-[9px] md:text-[12px] font-bold text-zinc-500 uppercase tracking-tight truncate max-w-[60px] md:max-w-[200px]">
                                                                        {mov.notes || (mov.type === 'income' ? 'Entrada manual' : mov.type === 'expense' ? 'Salida manual' : 'Arqueo de caja')}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="px-2 md:px-6 py-3 text-center">
                                                                <span className={cn(
                                                                    "text-[10px] md:text-[15px] font-black tabular-nums",
                                                                    mov.type === 'income' ? "text-emerald-500" :
                                                                        mov.type === 'expense' ? "text-rose-500" :
                                                                            mov.amount > 0 ? "text-blue-500" : "text-orange-500"
                                                                )}>
                                                                    {mov.type === 'income' ? '+' : mov.type === 'expense' ? '-' : (mov.amount > 0 ? '+' : '')}{mov.amount.toFixed(0)}€
                                                                </span>
                                                            </td>
                                                            <td className="px-3 md:px-8 py-3 text-right">
                                                                <span className="text-[10px] md:text-[15px] font-black text-zinc-900 tabular-nums">
                                                                    {mov.running_balance.toFixed(0)}€
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>

                                    {/* SCROLL SENSOR */}
                                    {movements.length > displayLimit && (
                                        <div
                                            className="py-6 flex justify-center"
                                            ref={(el) => {
                                                if (!el) return;
                                                const observer = new IntersectionObserver((entries) => {
                                                    if (entries[0].isIntersecting) {
                                                        setDisplayLimit(prev => prev + 40);
                                                    }
                                                });
                                                observer.observe(el);
                                            }}
                                        >
                                            <LoadingSpinner size="sm" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* MODALES EXTERNOS */}
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

            {showMonthPicker && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowMonthPicker(false)}>
                    <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="p-6 border-b border-zinc-50 flex items-center justify-between">
                            <h3 className="font-black text-zinc-900 uppercase text-[10px] tracking-widest">Seleccionar Mes</h3>
                            <button onClick={() => setShowMonthPicker(false)} className="p-3 hover:bg-zinc-100 rounded-2xl transition-colors"><X size={18} className="text-zinc-400" /></button>
                        </div>
                        <div className="p-6">
                            <div className="flex items-center justify-between mb-8 px-2">
                                <button onClick={() => setPickerYear(pickerYear - 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronLeft size={20} className="text-zinc-400" /></button>
                                <span className="font-black text-xl text-zinc-900 tracking-tighter">{pickerYear}</span>
                                <button onClick={() => setPickerYear(pickerYear + 1)} className="p-3 hover:bg-zinc-50 rounded-2xl transition-colors"><ChevronRight size={20} className="text-zinc-400" /></button>
                            </div>
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
                                                isSelected ? "bg-zinc-900 border-zinc-900 text-white shadow-lg scale-105" : "bg-zinc-50 border-transparent text-zinc-400 hover:border-zinc-200 hover:text-zinc-900"
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

            {cashModalMode !== 'none' && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-[120] p-4 animate-in fade-in duration-300" onClick={() => setCashModalMode('none')}>
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                        {cashModalMode === 'inventory' ? (
                            <BoxInventoryView boxName={boxData?.name || 'Caja'} inventory={boxInventory} onBack={() => setCashModalMode('none')} />
                        ) : (
                            <CashDenominationForm
                                key={cashModalMode + (boxData?.id || '')}
                                type={cashModalMode === 'audit' ? 'audit' : (cashModalMode === 'in' ? 'in' : 'out')}
                                boxName={boxData?.name || 'Caja'}
                                onSubmit={handleCashTransaction}
                                onCancel={() => setCashModalMode('none')}
                                initialCounts={cashModalMode === 'audit' ? boxInventoryMap : {}}
                                availableStock={boxInventoryMap}
                            />
                        )}
                    </div>
                </div>
            )}

            {selectedMovement && (
                <MovementDetailModal movement={selectedMovement} onClose={() => setSelectedMovement(null)} />
            )}

            {isClosingModalOpen && (
                <CashClosingModal
                    isOpen={isClosingModalOpen}
                    onClose={() => setIsClosingModalOpen(false)}
                    onSuccess={() => {
                        setIsClosingModalOpen(false);
                        fetchMovements();
                        toast.success("Cierre realizado correctamente");
                    }}
                />
            )}
        </div>
    );
}