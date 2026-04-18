'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X, Save, Banknote, Coins, Calendar,
    CreditCard, UserMinus, ArchiveRestore, Store,
    AlertTriangle, CloudSun, Receipt, ArrowLeft, ArrowRight,
    CheckCircle2, TrendingUp, RefreshCw, Minus, Plus
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendClosingNotification } from '@/app/actions/notifications';
import { madridDayUtcRangeIso } from '@/lib/madrid-date-bounds';

// export const FIXED_CASH_FUND = 100; // ELIMINADO: Se simplifica la lógica sin fondo fijo
export const BILLS = [100, 50, 20, 10, 5];
export const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

function parseDateTimeLocal(value: string): Date {
    // TIMEZONE IMMUNITY: no Date('YYYY-MM-DD...') parsing.
    // datetime-local comes as "YYYY-MM-DDTHH:mm"
    const [datePart, timePart] = value.split('T');
    const [yStr, mStr, dStr] = (datePart || '').split('-');
    const [hhStr, mmStr] = (timePart || '').split(':');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    const hh = Number(hhStr ?? 0);
    const mm = Number(mmStr ?? 0);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d, Number.isFinite(hh) ? hh : 0, Number.isFinite(mm) ? mm : 0);
}

function formatDateTimeLocalInput(d: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const CURRENCY_IMAGES: Record<number, string> = {
    100: '/currency/100e-Photoroom.png',
    50: '/currency/50e-Photoroom.png',
    20: '/currency/20-Photoroom.png',
    10: '/currency/10e-Photoroom.png',
    5: '/currency/5eur-Photoroom.png',
    2: '/currency/2eur-Photoroom.png',
    1: '/currency/1eur-Photoroom.png',
    0.50: '/currency/50ct-Photoroom.png',
    0.20: '/currency/20ct-Photoroom.png',
    0.10: '/currency/10ct-Photoroom.png',
    0.05: '/currency/5ct-Photoroom.png',
    0.02: '/currency/2ct-Photoroom.png',
    0.01: '/currency/1ct-Photoroom.png',
};

type ClosingStep = 'tpv_data' | 'count' | 'summary';

interface CashClosingModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    initialTotalSales?: number;
    initialTicketsCount?: number;
}

export default function CashClosingModal({ isOpen, onClose, onSuccess, initialTotalSales = 0, initialTicketsCount = 0 }: CashClosingModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<ClosingStep>('tpv_data');
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    // 1. STATE: TPVs
    const [tpvData, setTpvData] = useState({
        totalSales: initialTotalSales || 0,
        cardSales: 0,
        pendingSales: 0,
        debtRecovered: 0,
        ticketsCount: initialTicketsCount || 0,
        weather: 'Soleado'
    });

    // 2. STATE: COUNT
    const [counts, setCounts] = useState<Record<string, number>>({});

    // 3. STATE: OPENING CASH
    const [openingCash, setOpeningCash] = useState(0);

    // 4. STATE: DATE/TIME (HIDDEN EDIT)
    const [selectedDateTime, setSelectedDateTime] = useState(() => formatDateTimeLocalInput(new Date()));
    const datePickerRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (isOpen) {
            // Priority: If opening for Today, use dashboard live data
            const now = new Date();
            const selectedDateStr = format(parseDateTimeLocal(selectedDateTime), 'yyyy-MM-dd');
            const todayStr = format(now, 'yyyy-MM-dd');

            if (selectedDateStr === todayStr && (initialTotalSales > 0 || initialTicketsCount > 0)) {
                setTpvData(prev => ({
                    ...prev,
                    totalSales: initialTotalSales,
                    ticketsCount: initialTicketsCount
                }));
            } else {
                fetchTodayVentas();
            }
        } else {
            // Reset state on close
            setStep('tpv_data');
            const now = formatDateTimeLocalInput(new Date());
            setSelectedDateTime(now);
            setTpvData({
                totalSales: 0, cardSales: 0, pendingSales: 0,
                debtRecovered: 0, ticketsCount: 0, weather: 'Soleado'
            });
            setCounts({});
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen) {
            fetchTodayVentas();
        }
    }, [selectedDateTime]);


    async function fetchTodayVentas() {
        setLoading(true);
        try {
            const dateObj = parseDateTimeLocal(selectedDateTime);
            const dateStr = format(dateObj, 'yyyy-MM-dd');
            const { startIso, endIso } = madridDayUtcRangeIso(dateStr);

            // Robust fetch: Aggregated sum directly from the table to avoid RPC dependency issues
            const { data: tickets, error: salesError } = await supabase
                .from('tickets_marbella')
                .select('total_documento')
                .gte('fecha_real', startIso)
                .lte('fecha_real', endIso);

            if (salesError) throw salesError;

            let total = 0;
            let count = 0;
            tickets?.forEach(t => {
                const val = Number(t.total_documento) || 0;
                if (val !== 0) {
                    total += val;
                    count += (val > 0 ? 1 : -1);
                }
            });

            setTpvData(prev => ({
                ...prev,
                totalSales: Math.max(0, Math.round(total * 100) / 100),
                ticketsCount: Math.max(0, count)
            }));
        } catch (error) {
            console.error("Error fetching sales data:", error);
            toast.error("Error al sincronizar datos de ventas");
        } finally {
            setLoading(false);
        }
    }

    // --- CALCULATIONS ---
    const totalSalesGross = tpvData.totalSales;
    const cashSalesToday = totalSalesGross - tpvData.cardSales - tpvData.pendingSales;
    const expectedCash = cashSalesToday + tpvData.debtRecovered;
    const totalCounted = Object.entries(counts).reduce((sum, [val, qty]) => sum + (parseFloat(val) * qty), 0);
    const difference = totalCounted - expectedCash;
    const cashToWithdraw = totalCounted; // Se retira TODO el efectivo contado
    const cashLeft = 0; // No queda nada en caja por defecto

    // --- HANDLERS ---
    const updateCount = (value: number, qty: string) => {
        const quantity = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [value]: quantity }));
    };

    const handleAdjustTpv = (field: keyof typeof tpvData, delta: number) => {
        setTpvData(prev => {
            const val = typeof prev[field] === 'number' ? prev[field] as number : 0;
            return { ...prev, [field]: Math.max(0, val + delta) };
        });
    };

    const handleAdjustCount = (value: number, delta: number) => {
        setCounts(prev => ({
            ...prev,
            [value]: (prev[value] || 0) + delta
        }));
    };

    const handleFinalizeClose = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const chosenDate = parseDateTimeLocal(selectedDateTime);

            // Format movement name for treasury: "Cierre Sab 14 Feb"
            const movementName = `Cierre ${format(chosenDate, "EEE d MMM", { locale: es })}`;

            // Calculate Net Sales (Excluding 10% IVA as expected by Dashboard)
            const netSalesCalculated = totalSalesGross / 1.10;

            // Prepare breakdown for the new unified treasury logic
            const breakdownJson: Record<string, number> = {};
            Object.entries(counts).forEach(([denomination, count]) => {
                if (count > 0) {
                    breakdownJson[denomination] = count;
                }
            });

            const { data: closing, error } = await supabase
                .from('cash_closings')
                .insert({
                    closed_at: chosenDate.toISOString(),
                    closed_by: user?.id,
                    closing_date: format(chosenDate, "yyyy-MM-dd"),
                    tpv_sales: totalSalesGross,
                    net_sales: netSalesCalculated,
                    sales_card: tpvData.cardSales,
                    sales_pending: tpvData.pendingSales,
                    debt_recovered: tpvData.debtRecovered,
                    card_payments: tpvData.cardSales,
                    pending_payments: tpvData.pendingSales,
                    collections: tpvData.debtRecovered,
                    cash_expected: expectedCash,
                    cash_counted: totalCounted,
                    difference: difference,
                    cash_withdrawn: cashToWithdraw,
                    cash_left: cashLeft,
                    weather: tpvData.weather,
                    tickets_count: tpvData.ticketsCount,
                    notes: movementName, // This will be the name in treasury log
                    status: 'closed',
                    breakdown: breakdownJson
                })
                .select()
                .single();

            if (error) {
                console.error("Error inserting closing:", error);
                throw new Error(`Error al guardar el cierre: ${error.message}`);
            }

            toast.success("Cierre completado con éxito");

            // Enviar notificación a los managers
            const avgTicket = tpvData.ticketsCount > 0 ? (totalSalesGross / tpvData.ticketsCount) : 0;
            const closingDateStr = format(chosenDate, "EEEE dd/MM", { locale: es });
            sendClosingNotification({
                dateStr: closingDateStr,
                totalSales: totalSalesGross,
                netSales: netSalesCalculated,
                avgTicket: avgTicket
            }).catch(err => console.error("Error sending closing notify:", err));

            if (onSuccess) await onSuccess();
            onClose();
        } catch (error: any) {
            console.error("FinalizeClose error:", error);
            toast.error(error.message || "Error desconocido al cerrar caja");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={cn(
                    "bg-white w-full max-w-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 rounded-2xl",
                    "max-h-[calc(100dvh-2rem)]",
                    "shadow-2xl shadow-black/20 border border-white/10"
                )}
                onClick={e => e.stopPropagation()}
            >

                {/* Header: fecha sin tarjeta/marco, flota sobre cabecera */}
                <div className="bg-[#36606F] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-white relative shrink-0">
                    <div className="flex flex-col">
                        <button
                            type="button"
                            className="relative flex items-center gap-2 cursor-pointer text-left outline-none border-0 bg-transparent p-0 hover:opacity-90 transition-opacity min-h-[48px] min-w-[48px]"
                            onClick={() => {
                                const el = datePickerRef.current;
                                if (!el) return;
                                // Try native picker (Chrome), fallback to focus/click for others.
                                const picker = el as HTMLInputElement & { showPicker?: () => void };
                                if (typeof picker.showPicker === 'function') picker.showPicker();
                                else { el.focus(); el.click(); }
                            }}
                        >
                            <Calendar size={16} className="text-white/80" aria-hidden />
                            <span className="text-[12px] sm:text-sm font-black uppercase tracking-wide text-white">
                                {format(parseDateTimeLocal(selectedDateTime), "eeee d 'de' MMMM, HH:mm", { locale: es })}
                            </span>
                            <input
                                ref={datePickerRef}
                                type="datetime-local"
                                value={selectedDateTime}
                                onChange={(e) => setSelectedDateTime(e.target.value)}
                                className={cn(
                                    // Overlay invisible but clickable/editable to ensure consistent behavior across browsers.
                                    "absolute inset-0 opacity-0 cursor-pointer",
                                    "min-h-[48px] min-w-[48px]"
                                )}
                            />
                        </button>
                        <div className="flex items-center gap-3 mt-1">
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'tpv_data' ? 'text-white' : 'text-white/40')}>1. Datos</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'count' ? 'text-white' : 'text-white/40')}>2. Arqueo</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'summary' ? 'text-white' : 'text-white/40')}>3. Resumen</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                        {(step === 'tpv_data' || step === 'count') && (
                            <span className="w-10 h-10 min-h-[48px] min-w-[48px]" aria-hidden />
                        )}
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20 min-h-[48px] min-w-[48px]">
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                {(step === 'tpv_data' || step === 'count') && (
                    <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                )}

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* STEP 1: SALES DATA */}
                    {step === 'tpv_data' && (
                        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                            <div className="p-4 sm:p-5 bg-gray-50 rounded-2xl border border-gray-100 transition-all">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ventas</label>
                                <div className="flex items-center gap-4">
                                    <div className="flex-1 flex items-center justify-between h-14 bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                        <button
                                            type="button"
                                            onClick={() => handleAdjustTpv('totalSales', -1)}
                                            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                        >
                                            <Minus size={20} strokeWidth={3} />
                                        </button>
                                        <div className="flex-1 h-full relative flex items-center">
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-full h-full text-xl font-black text-[#5B8FB9] bg-transparent border-none outline-none focus:ring-0 text-center p-0 focus:bg-blue-50/20 transition-colors"
                                                placeholder="0.00"
                                                value={tpvData.totalSales || ''}
                                                onChange={e => setTpvData({ ...tpvData, totalSales: parseFloat(e.target.value) || 0 })}
                                            />
                                            <span className="text-xl font-black text-[#5B8FB9]/40 absolute right-4 pointer-events-none">€</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => handleAdjustTpv('totalSales', 1)}
                                            className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                        >
                                            <Plus size={20} strokeWidth={3} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => fetchTodayVentas()}
                                        className="p-3 hover:bg-white/80 rounded-2xl transition-all active:scale-95 text-[#36606F]/60 hover:text-[#36606F] shadow-sm bg-white"
                                        title="Sincronizar con TPV"
                                    >
                                        <RefreshCw size={24} className={cn(loading && "animate-spin")} />
                                    </button>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CloudSun className="text-blue-500" size={20} />
                                    <span className="text-[10px] font-black text-blue-900 uppercase">Clima</span>
                                </div>
                                <select
                                    className="bg-white border border-blue-200 rounded-lg px-3 py-1.5 text-xs font-bold text-blue-900 outline-none"
                                    value={tpvData.weather}
                                    onChange={e => setTpvData({ ...tpvData, weather: e.target.value })}
                                >
                                    {['Soleado', 'Nublado', 'Lluvia', 'Frio', 'Calor', 'Evento'].map(w => (
                                        <option key={w} value={w}>{w}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4 sm:gap-6 bg-gray-50 p-4 sm:p-6 rounded-2xl border border-gray-100">
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><CreditCard size={12} /> Tarjeta</label>
                                        <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20">
                                            <button onClick={() => handleAdjustTpv('cardSales', -1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                            <input type="number" className="flex-1 w-0 h-full p-0 text-[10px] tracking-tighter tabular-nums font-black text-zinc-700 bg-transparent outline-none text-center focus:bg-blue-50/20 transition-colors"
                                                value={tpvData.cardSales || ''} onChange={e => setTpvData({ ...tpvData, cardSales: parseFloat(e.target.value) || 0 })} />
                                            <button onClick={() => handleAdjustTpv('cardSales', 1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><UserMinus size={12} /> Pendiente</label>
                                        <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20">
                                            <button onClick={() => handleAdjustTpv('pendingSales', -1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                            <input type="number" className="flex-1 w-0 h-full p-0 text-[10px] tracking-tighter tabular-nums font-black text-zinc-700 bg-transparent outline-none text-center focus:bg-blue-50/20 transition-colors"
                                                value={tpvData.pendingSales || ''} onChange={e => setTpvData({ ...tpvData, pendingSales: parseFloat(e.target.value) || 0 })} />
                                            <button onClick={() => handleAdjustTpv('pendingSales', 1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><ArchiveRestore size={12} /> Cobros</label>
                                        <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20">
                                            <button onClick={() => handleAdjustTpv('debtRecovered', -1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                            <input type="number" className="flex-1 w-0 h-full p-0 text-[10px] tracking-tighter tabular-nums font-black text-zinc-700 bg-transparent outline-none text-center focus:bg-blue-50/20 transition-colors"
                                                value={tpvData.debtRecovered || ''} onChange={e => setTpvData({ ...tpvData, debtRecovered: parseFloat(e.target.value) || 0 })} />
                                            <button onClick={() => handleAdjustTpv('debtRecovered', 1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><Receipt size={12} /> Nº Tickets</label>
                                        <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20">
                                            <button onClick={() => handleAdjustTpv('ticketsCount', -1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                            <input type="number" className="flex-1 w-0 h-full p-0 text-[10px] tracking-tighter tabular-nums font-black text-zinc-700 bg-transparent outline-none text-center focus:bg-blue-50/20 transition-colors"
                                                value={tpvData.ticketsCount || ''} onChange={e => setTpvData({ ...tpvData, ticketsCount: parseInt(e.target.value) || 0 })} />
                                            <button onClick={() => handleAdjustTpv('ticketsCount', 1)} className="w-8 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: COUNT */}
                    {step === 'count' && (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-4 sm:p-6 bg-gray-50 border-b flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Arqueo en Caja</h3>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted.toFixed(2)}€</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Esperado</span>
                                    <div className="text-lg font-bold text-gray-500">{expectedCash > 0.005 ? `${expectedCash.toFixed(2)}€` : " "}</div>
                                </div>
                            </div>
                            <div className="p-3 sm:p-4 flex flex-col gap-4">
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-y-5 sm:gap-y-6 gap-x-3 sm:gap-x-4">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-11 sm:h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[bill]}
                                                    alt={bill + "€"}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{bill}€</span>
                                                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button onClick={() => handleAdjustCount(bill, -1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                                    <input type="number" placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                        value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                                    <button onClick={() => handleAdjustCount(bill, 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {COINS.map(coin => (
                                        <div key={coin} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-11 sm:h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[coin]}
                                                    alt={coin + "€"}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{coin < 1 ? (coin * 100).toFixed(0) + "c" : coin + "€"}</span>
                                                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button onClick={() => handleAdjustCount(coin, -1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"><Minus size={14} strokeWidth={3} /></button>
                                                    <input type="number" placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                        value={counts[coin] || ''} onChange={(e) => updateCount(coin, e.target.value)} />
                                                    <button onClick={() => handleAdjustCount(coin, 1)} className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"><Plus size={14} strokeWidth={3} /></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: SUMMARY */}
                    {step === 'summary' && (
                        <div className="p-4 sm:p-6 space-y-6 sm:space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Cierre de Caja</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-6 sm:gap-8 py-6 sm:py-8 border-y border-gray-50">
                                <div className="flex flex-col items-center justify-center text-center col-span-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Efectivo Contado (Total Retirado)</span>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted > 0.005 ? `${totalCounted.toFixed(2)}€` : " "}</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center pt-4 border-t border-gray-50/50">
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Descuadre</span>
                                <span className={cn(
                                    "text-xl font-black",
                                    difference === 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {Math.abs(difference) < 0.005 ? " " : `${difference > 0 ? '+' : ''}${difference.toFixed(2)}€`}
                                </span>
                            </div>


                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-3 sm:p-4 bg-gray-50 border-t flex gap-3 sm:gap-4 shrink-0">
                    {step !== 'tpv_data' && (
                        <button
                            onClick={() => setStep(step === 'summary' ? 'count' : 'tpv_data')}
                            className="px-4 sm:px-6 min-h-[48px] font-black text-gray-400 uppercase tracking-widest text-xs hover:text-gray-600 transition-colors rounded-xl hover:bg-white/60 active:bg-white/80"
                        >
                            Atrás
                        </button>
                    )}
                    <button
                        onClick={() => {
                            if (step === 'tpv_data') setStep('count');
                            else if (step === 'count') setStep('summary');
                            else handleFinalizeClose();
                        }}
                        disabled={loading}
                        className={cn(
                            "flex-1 min-h-[48px] h-14 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest transition-all active:scale-[0.98]",
                            step === 'summary' ? 'bg-emerald-500 shadow-emerald-200' : 'bg-[#5B8FB9] shadow-blue-900/20'
                        )}
                    >
                        {loading ? <LoadingSpinner size="sm" className="text-white" /> : (
                            <>
                                {step === 'summary' ? '' : ''}
                                {step === 'summary' ? 'Confirmar Cierre' : (step === 'count' ? 'Ver Resumen' : 'Siguiente')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div >
    );
}
