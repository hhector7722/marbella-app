'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X, Save, Banknote, Coins, Calculator,
    CreditCard, UserMinus, ArchiveRestore, Store,
    AlertTriangle, CloudSun, Receipt, ArrowLeft, ArrowRight,
    CheckCircle2, TrendingUp
} from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { sendClosingNotification } from '@/app/actions/notifications';

// export const FIXED_CASH_FUND = 100; // ELIMINADO: Se simplifica la lógica sin fondo fijo
export const BILLS = [100, 50, 20, 10, 5];
export const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

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
}

export default function CashClosingModal({ isOpen, onClose, onSuccess }: CashClosingModalProps) {
    const supabase = createClient();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<ClosingStep>('tpv_data');

    // 1. STATE: TPVs
    const [tpvData, setTpvData] = useState({
        totalSales: 0,
        cardSales: 0,
        pendingSales: 0,
        debtRecovered: 0,
        ticketsCount: 0,
        weather: 'Soleado'
    });

    // 2. STATE: COUNT
    const [counts, setCounts] = useState<Record<string, number>>({});

    // 3. STATE: OPENING CASH
    const [openingCash, setOpeningCash] = useState(0);

    useEffect(() => {
        if (isOpen) {
            // fetchOpening(); // Se elimina el fondo de caja fijo
            fetchTodayVentas();
        } else {
            // Reset state on close
            setStep('tpv_data');
            setTpvData({
                totalSales: 0, cardSales: 0, pendingSales: 0,
                debtRecovered: 0, ticketsCount: 0, weather: 'Soleado'
            });
            setCounts({});
        }
    }, [isOpen]);

    async function fetchTodayVentas() {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const { data: tickets } = await supabase
            .from('tickets_marbella')
            .select('total_documento')
            .eq('fecha', todayStr);

        const total = tickets?.reduce((sum, t) => sum + (Number(t.total_documento) || 0), 0) || 0;
        const count = tickets?.filter(t => (Number(t.total_documento) || 0) !== 0).length || 0;

        setTpvData(prev => ({
            ...prev,
            totalSales: Math.round(total * 100) / 100, // Round to 2 decimals
            ticketsCount: count
        }));
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

    const handleFinalizeClose = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const now = new Date();

            // Format movement name for treasury: "Cierre Sab 14 Feb"
            const movementName = `Cierre ${format(now, "EEE d MMM", { locale: es })}`;

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
                    closed_at: now.toISOString(),
                    closed_by: user?.id,
                    closing_date: format(now, "yyyy-MM-dd"),
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
            sendClosingNotification({
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
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>

                {/* Header (Detail View Style) */}
                <div className="bg-[#36606F] px-8 py-4 flex items-center justify-between text-white relative shrink-0">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 opacity-60 mb-1">
                            <Calculator size={14} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Cierre de Caja Diaria</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'tpv_data' ? 'text-white' : 'text-white/40')}>1. Datos</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'count' ? 'text-white' : 'text-white/40')}>2. Arqueo</div>
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'summary' ? 'text-white' : 'text-white/40')}>3. Resumen</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {/* STEP 1: SALES DATA */}
                    {step === 'tpv_data' && (
                        <div className="p-8 space-y-6">
                            <div className="p-5 bg-gray-50 rounded-[2rem] border border-gray-100 transition-all">
                                <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Ventas</label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="w-full text-4xl font-black text-[#5B8FB9] bg-transparent border-none outline-none focus:ring-0"
                                        placeholder="0.00"
                                        value={tpvData.totalSales || ''}
                                        onChange={e => setTpvData({ ...tpvData, totalSales: parseFloat(e.target.value) || 0 })}
                                    />
                                    <span className="text-4xl font-black text-[#5B8FB9]/40">€</span>
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

                            <div className="grid grid-cols-2 gap-6 bg-gray-50 p-6 rounded-[2rem] border border-gray-100">
                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><CreditCard size={12} /> Tarjeta</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#5B8FB9]"
                                            value={tpvData.cardSales || ''} onChange={e => setTpvData({ ...tpvData, cardSales: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><UserMinus size={12} /> Pendiente</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#5B8FB9]"
                                            value={tpvData.pendingSales || ''} onChange={e => setTpvData({ ...tpvData, pendingSales: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><ArchiveRestore size={12} /> Cobros</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#5B8FB9]"
                                            value={tpvData.debtRecovered || ''} onChange={e => setTpvData({ ...tpvData, debtRecovered: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><Receipt size={12} /> Nº Tickets</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#5B8FB9]"
                                            value={tpvData.ticketsCount || ''} onChange={e => setTpvData({ ...tpvData, ticketsCount: parseInt(e.target.value) || 0 })} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 2: COUNT */}
                    {step === 'count' && (
                        <div className="flex flex-col h-full overflow-hidden">
                            <div className="p-6 bg-gray-50 border-b flex justify-between items-center shrink-0">
                                <div>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Arqueo en Caja</h3>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted.toFixed(2)}€</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Esperado</span>
                                    <div className="text-lg font-bold text-gray-500">{expectedCash.toFixed(2)}€</div>
                                </div>
                            </div>
                            <div className="p-4 flex flex-col gap-4">
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-y-6 gap-x-4">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-14 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[bill]}
                                                    alt={bill + "€"}
                                                    width={120}
                                                    height={120}
                                                    className="h-full w-auto object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{bill}€</span>
                                                <input type="number" min="0" placeholder="0"
                                                    className="w-full bg-white border-2 border-transparent focus:border-[#5B8FB9]/20 rounded-xl p-1.5 text-center font-black text-[#5B8FB9] outline-none text-xs focus:ring-4 focus:ring-[#5B8FB9]/5 transition-all shadow-sm"
                                                    value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                            </div>
                                        </div>
                                    ))}
                                    {COINS.map(coin => (
                                        <div key={coin} className="flex flex-col items-center gap-1.5 group transition-all">
                                            <div className="h-10 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[coin]}
                                                    alt={coin + "€"}
                                                    width={100}
                                                    height={100}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">{coin < 1 ? (coin * 100).toFixed(0) + "c" : coin + "€"}</span>
                                                <input type="number" min="0" placeholder="0"
                                                    className="w-full bg-white border-2 border-transparent focus:border-[#5B8FB9]/20 rounded-xl p-1.5 text-center font-black text-[#5B8FB9] outline-none text-xs focus:ring-4 focus:ring-[#5B8FB9]/5 transition-all shadow-sm"
                                                    value={counts[coin] || ''} onChange={(e) => updateCount(coin, e.target.value)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: SUMMARY */}
                    {step === 'summary' && (
                        <div className="p-8 space-y-8 animate-in slide-in-from-bottom-4 duration-300">
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Cierre de Caja</h3>
                            </div>

                            <div className="grid grid-cols-2 gap-8 py-8 border-y border-gray-50">
                                <div className="flex flex-col items-center justify-center text-center col-span-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Efectivo Contado (Total Retirado)</span>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalCounted.toFixed(2)}€</span>
                                </div>
                            </div>

                            <div className="flex flex-col items-center justify-center pt-4 border-t border-gray-50/50">
                                <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest mb-1">Descuadre</span>
                                <span className={cn(
                                    "text-xl font-black",
                                    difference === 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {difference === 0 ? "0.00€" : `${difference > 0 ? '+' : ''}${difference.toFixed(2)}€`}
                                </span>
                            </div>


                        </div>
                    )}
                </div>

                {/* Footer Controls */}
                <div className="p-6 bg-gray-50 border-t flex gap-4 shrink-0">
                    {step !== 'tpv_data' && (
                        <button
                            onClick={() => setStep(step === 'summary' ? 'count' : 'tpv_data')}
                            className="px-8 font-black text-gray-400 uppercase tracking-widest text-xs hover:text-gray-600 transition-colors"
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
                            "flex-1 h-14 rounded-2xl shadow-xl flex items-center justify-center gap-3 text-white font-black uppercase tracking-widest transition-all active:scale-[0.98]",
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
