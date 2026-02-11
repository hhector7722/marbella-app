'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    X, Save, Banknote, Coins, Calculator, Loader2,
    CreditCard, UserMinus, ArchiveRestore, Store,
    AlertTriangle, CloudSun, Receipt, ArrowLeft, ArrowRight,
    CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import Image from 'next/image';

// --- CONSTANTS ---
const FIXED_CASH_FUND = 100;
const BILLS = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

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
        tpv1: 0,
        tpv2: 0,
        cardSales: 0,
        pendingSales: 0,
        debtRecovered: 0,
        ticketsCount: 0,
        weather: 'Soleado'
    });

    // 2. STATE: COUNT
    const [counts, setCounts] = useState<Record<string, number>>({});

    // 3. STATE: OPENING CASH
    const [openingCash, setOpeningCash] = useState(FIXED_CASH_FUND);

    useEffect(() => {
        if (isOpen) {
            fetchOpening();
        } else {
            // Reset state on close
            setStep('tpv_data');
            setTpvData({
                tpv1: 0, tpv2: 0, cardSales: 0, pendingSales: 0,
                debtRecovered: 0, ticketsCount: 0, weather: 'Soleado'
            });
            setCounts({});
        }
    }, [isOpen]);

    async function fetchOpening() {
        const { data } = await supabase
            .from('cash_closings')
            .select('cash_left')
            .order('closed_at', { ascending: false })
            .limit(1)
            .single();

        if (data?.cash_left) {
            setOpeningCash(data.cash_left);
        }
    }

    // --- CALCULATIONS ---
    const totalSalesGross = tpvData.tpv1 + tpvData.tpv2;
    const cashSalesToday = totalSalesGross - tpvData.cardSales - tpvData.pendingSales;
    const expectedCash = openingCash + cashSalesToday + tpvData.debtRecovered;
    const totalCounted = Object.entries(counts).reduce((sum, [val, qty]) => sum + (parseFloat(val) * qty), 0);
    const difference = totalCounted - expectedCash;
    const cashToWithdraw = totalCounted > FIXED_CASH_FUND ? totalCounted - FIXED_CASH_FUND : 0;
    const cashLeft = totalCounted > FIXED_CASH_FUND ? FIXED_CASH_FUND : totalCounted;

    // --- HANDLERS ---
    const updateCount = (value: number, qty: string) => {
        const quantity = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [value]: quantity }));
    };

    const handleFinalizeClose = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // Calculate Net Sales (Excluding 10% IVA as expected by Dashboard)
            const netSalesCalculated = totalSalesGross / 1.10;

            const { data: closing, error } = await supabase
                .from('cash_closings')
                .insert({
                    opened_by: user?.id,
                    closed_by: user?.id, // Standard fields for project
                    closed_at: new Date().toISOString(),
                    net_sales: netSalesCalculated,
                    sales_card: tpvData.cardSales,
                    sales_pending: tpvData.pendingSales,
                    debt_recovered: tpvData.debtRecovered,
                    cash_expected: expectedCash,
                    cash_counted: totalCounted,
                    difference: difference,
                    cash_withdrawn: cashToWithdraw,
                    cash_left: cashLeft,
                    weather: tpvData.weather,
                    tickets_count: tpvData.ticketsCount,
                    notes: `TPV1: ${tpvData.tpv1.toFixed(2)}€ | TPV2: ${tpvData.tpv2.toFixed(2)}€`
                })
                .select()
                .single();

            if (error) {
                console.error("Error inserting closing:", error);
                throw new Error(`Error al guardar el cierre: ${error.message}`);
            }

            // Insert breakdown
            const countEntries = Object.entries(counts).map(([denomination, count]) => ({
                closing_id: closing.id,
                denomination: parseFloat(denomination),
                quantity: count,
                total_amount: parseFloat(denomination) * count
            })).filter(item => item.quantity > 0);

            if (countEntries.length > 0) {
                const { error: countError } = await supabase.from('cash_counts').insert(countEntries);
                if (countError) console.error("Error inserting counts:", countError);
            }

            toast.success("Cierre completado con éxito");
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
            <div className="bg-white rounded-[2.5rem] w-full max-w-4xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[95vh] flex flex-col" onClick={e => e.stopPropagation()}>

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
                            <div className="grid grid-cols-2 gap-4 p-5 bg-gray-50 rounded-[2rem] border border-gray-100">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TPV 2</label>
                                    <input
                                        type="number"
                                        className="w-full text-2xl font-black text-gray-800 bg-transparent border-b-2 border-gray-200 focus:border-[#36606F] outline-none transition-colors"
                                        placeholder="0.00"
                                        value={tpvData.tpv2 || ''}
                                        onChange={e => setTpvData({ ...tpvData, tpv2: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TPV 1</label>
                                    <input
                                        type="number"
                                        className="w-full text-2xl font-black text-gray-800 bg-transparent border-b-2 border-gray-200 focus:border-[#36606F] outline-none transition-colors"
                                        placeholder="0.00"
                                        value={tpvData.tpv1 || ''}
                                        onChange={e => setTpvData({ ...tpvData, tpv1: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="col-span-2 pt-2 flex justify-between items-center bg-white/50 p-3 rounded-xl mt-2">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Total Bruto</span>
                                    <span className="text-xl font-black text-[#36606F]">{totalSalesGross.toFixed(2)}€</span>
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
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#36606F]"
                                            value={tpvData.cardSales || ''} onChange={e => setTpvData({ ...tpvData, cardSales: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><UserMinus size={12} /> Pendiente</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#36606F]"
                                            value={tpvData.pendingSales || ''} onChange={e => setTpvData({ ...tpvData, pendingSales: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><ArchiveRestore size={12} /> Cobros</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#36606F]"
                                            value={tpvData.debtRecovered || ''} onChange={e => setTpvData({ ...tpvData, debtRecovered: parseFloat(e.target.value) || 0 })} />
                                    </div>
                                    <div>
                                        <label className="flex items-center gap-2 text-[9px] font-black text-gray-400 uppercase mb-1"><Receipt size={12} /> Nº Tickets</label>
                                        <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-[#36606F]"
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
                                    <span className="text-3xl font-black text-[#36606F]">{totalCounted.toFixed(2)}€</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black text-gray-400 uppercase">Esperado</span>
                                    <div className="text-lg font-bold text-gray-500">{expectedCash.toFixed(2)}€</div>
                                </div>
                            </div>
                            <div className="p-4 flex flex-col gap-8">
                                <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-8">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="flex flex-col items-center gap-2 group transition-all">
                                            <div className="h-24 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[bill]}
                                                    alt={bill + "€"}
                                                    width={80}
                                                    height={96}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <span className="font-black text-gray-400 text-[10px] uppercase tracking-widest">{bill}€</span>
                                            <input type="number" min="0" placeholder="0"
                                                className="w-full bg-white/50 border border-gray-200 rounded-xl p-2 text-center font-black text-[#36606F] outline-none text-xs focus:ring-2 focus:ring-[#36606F]/20"
                                                value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                        </div>
                                    ))}
                                    {COINS.map(coin => (
                                        <div key={coin} className="flex flex-col items-center gap-2 group transition-all">
                                            <div className="h-20 w-full flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image
                                                    src={CURRENCY_IMAGES[coin]}
                                                    alt={coin + "€"}
                                                    width={64}
                                                    height={80}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <span className="font-black text-gray-400 text-[10px] uppercase tracking-widest">{coin < 1 ? (coin * 100).toFixed(0) + "c" : coin + "€"}</span>
                                            <input type="number" min="0" placeholder="0"
                                                className="w-full bg-white/50 border border-gray-200 rounded-xl p-2 text-center font-black text-[#36606F] outline-none text-xs focus:ring-2 focus:ring-[#36606F]/20"
                                                value={counts[coin] || ''} onChange={(e) => updateCount(coin, e.target.value)} />
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
                                <div className="flex flex-col items-center justify-center text-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Retirar</span>
                                    <span className="text-3xl font-black text-[#36606F]">{cashToWithdraw.toFixed(2)}€</span>
                                </div>
                                <div className="flex flex-col items-center justify-center text-center border-l border-gray-50">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Fondo de caja</span>
                                    <span className="text-3xl font-black text-emerald-500">{cashLeft.toFixed(2)}€</span>
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
                            step === 'summary' ? 'bg-emerald-500 shadow-emerald-200' : 'bg-[#36606F] shadow-blue-900/20'
                        )}
                    >
                        {loading ? <Loader2 className="animate-spin" /> : (
                            <>
                                {step === 'summary' ? '' : ''}
                                {step === 'summary' ? 'Confirmar Cierre' : (step === 'count' ? 'Ver Resumen' : 'Siguiente')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
