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

// --- CONSTANTS ---
const FIXED_CASH_FUND = 100;
const BILLS = [500, 200, 100, 50, 20, 10, 5];
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

            const { data: closing, error } = await supabase
                .from('cash_closings')
                .insert({
                    opened_by: user?.id,
                    closed_by: user?.id,
                    closed_at: new Date().toISOString(),
                    net_sales: totalSalesGross,
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

            if (error) throw error;

            // Insert breakdown
            const countEntries = Object.entries(counts).map(([denomination, count]) => ({
                closing_id: closing.id,
                denomination: parseFloat(denomination),
                quantity: count,
                total_amount: parseFloat(denomination) * count
            })).filter(item => item.quantity > 0);

            if (countEntries.length > 0) {
                await supabase.from('cash_counts').insert(countEntries);
            }

            toast.success("Cierre completado con éxito");
            if (onSuccess) onSuccess();
            onClose();
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

                {/* Header (Detail View Style) */}
                <div className="bg-[#36606F] px-8 py-4 flex items-center justify-between text-white relative shrink-0">
                    <div className="flex flex-col">
                        <div className="flex items-center gap-2 opacity-60 mb-1">
                            <Calculator size={14} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em]">Cierre de Caja Diaria</span>
                        </div>
                        <div className="flex items-center gap-4 mt-1">
                            <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'tpv_data' ? 'text-white' : 'text-white/40')}>1. Ventas</div>
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
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TPV 2 (Principal)</label>
                                    <input
                                        type="number"
                                        className="w-full text-2xl font-black text-gray-800 bg-transparent border-b-2 border-gray-200 focus:border-[#36606F] outline-none transition-colors"
                                        placeholder="0.00"
                                        value={tpvData.tpv2 || ''}
                                        onChange={e => setTpvData({ ...tpvData, tpv2: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">TPV 1 (Auxiliar)</label>
                                    <input
                                        type="number"
                                        className="w-full text-2xl font-black text-gray-400 bg-transparent border-b-2 border-gray-100 focus:border-[#36606F] outline-none transition-colors"
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

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-rose-400"></div> No Efectivo
                                    </h4>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                        <div>
                                            <label className="flex items-center gap-2 text-[9px] font-black text-rose-500 uppercase mb-1"><CreditCard size={12} /> Tarjeta</label>
                                            <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-rose-300"
                                                value={tpvData.cardSales || ''} onChange={e => setTpvData({ ...tpvData, cardSales: parseFloat(e.target.value) || 0 })} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 text-[9px] font-black text-orange-500 uppercase mb-1"><UserMinus size={12} /> Pendiente</label>
                                            <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-orange-300"
                                                value={tpvData.pendingSales || ''} onChange={e => setTpvData({ ...tpvData, pendingSales: parseFloat(e.target.value) || 0 })} />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-widest flex items-center gap-2 px-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div> Extras y Datos
                                    </h4>
                                    <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4">
                                        <div>
                                            <label className="flex items-center gap-2 text-[9px] font-black text-emerald-600 uppercase mb-1"><ArchiveRestore size={12} /> Deuda Recuperada</label>
                                            <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-emerald-300"
                                                value={tpvData.debtRecovered || ''} onChange={e => setTpvData({ ...tpvData, debtRecovered: parseFloat(e.target.value) || 0 })} />
                                        </div>
                                        <div>
                                            <label className="flex items-center gap-2 text-[9px] font-black text-[#36606F] uppercase mb-1"><Receipt size={12} /> Nº Tickets</label>
                                            <input type="number" className="w-full p-2 text-sm font-bold border-b border-gray-200 bg-transparent outline-none focus:border-blue-300"
                                                value={tpvData.ticketsCount || ''} onChange={e => setTpvData({ ...tpvData, ticketsCount: parseInt(e.target.value) || 0 })} />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <CloudSun className="text-blue-500" size={20} />
                                    <span className="text-[10px] font-black text-blue-900 uppercase">Clima del Día</span>
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
                            <div className="p-4 flex flex-col gap-4">
                                <div className="grid grid-cols-4 md:grid-cols-5 gap-3">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="bg-white p-2 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center gap-1 group transition-all hover:border-[#36606F]/50">
                                            <div className="h-8 w-full flex items-center justify-center">
                                                <img src={CURRENCY_IMAGES[bill]} alt={bill + "€"} className="h-full w-auto object-contain drop-shadow-sm group-hover:scale-110 transition-transform" />
                                            </div>
                                            <span className="font-black text-gray-400 text-[8px] uppercase tracking-tighter">{bill}€</span>
                                            <input type="number" min="0" placeholder="0"
                                                className="w-full bg-gray-50 border-none rounded-lg p-1 text-center font-black text-[#36606F] outline-none text-[10px] focus:ring-1 focus:ring-blue-200"
                                                value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                        </div>
                                    ))}
                                    {COINS.map(coin => (
                                        <div key={coin} className="bg-white p-2 rounded-2xl border border-gray-100 shadow-sm flex flex-col items-center gap-1 group transition-all hover:border-[#36606F]/50">
                                            <div className="h-8 w-full flex items-center justify-center">
                                                <img src={CURRENCY_IMAGES[coin]} alt={coin + "€"} className="h-full w-auto object-contain drop-shadow-sm group-hover:scale-110 transition-transform" />
                                            </div>
                                            <span className="font-black text-gray-400 text-[8px] uppercase tracking-tighter">{coin < 1 ? (coin * 100).toFixed(0) + "c" : coin + "€"}</span>
                                            <input type="number" min="0" placeholder="0"
                                                className="w-full bg-gray-50 border-none rounded-lg p-1 text-center font-black text-[#36606F] outline-none text-[10px] focus:ring-1 focus:ring-blue-200"
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
                                <h3 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Acción de Caja</h3>
                                <p className="text-gray-400 text-sm font-bold uppercase tracking-widest mt-1">Sigue estas instrucciones para el sobre</p>
                            </div>

                            <div className="grid grid-cols-2 gap-8 py-8 border-y border-gray-50">
                                <div className="flex flex-col items-center justify-center text-center">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Retirar al Sobre</span>
                                    <span className="text-4xl font-black text-[#36606F]">{cashToWithdraw.toFixed(2)}€</span>
                                    <span className="text-[9px] text-[#36606F]/50 font-bold mt-1 uppercase">Ventas + Beneficio</span>
                                </div>
                                <div className="flex flex-col items-center justify-center text-center border-l border-gray-50">
                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2">Dejar en Cajón</span>
                                    <span className="text-4xl font-black text-emerald-500">{cashLeft.toFixed(2)}€</span>
                                    <span className="text-[9px] text-emerald-500/50 font-bold mt-1 uppercase">Fondo Fijo (100€)</span>
                                </div>
                            </div>

                            {cashLeft < FIXED_CASH_FUND && (
                                <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-4 text-amber-800 animate-pulse">
                                    <AlertTriangle className="shrink-0" size={24} />
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-tight">Fondo Insuficiente</p>
                                        <p className="text-[10px] font-bold opacity-80">No hay suficiente efectivo para completar el fondo de {FIXED_CASH_FUND}€. Faltan {(FIXED_CASH_FUND - cashLeft).toFixed(2)}€.</p>
                                    </div>
                                </div>
                            )}

                            <div className={cn(
                                "p-6 rounded-[2rem] border-2 flex justify-between items-center",
                                difference === 0 ? "bg-emerald-50 border-emerald-100" : "bg-rose-50 border-rose-100"
                            )}>
                                <div className="flex items-center gap-4">
                                    <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-sm", difference === 0 ? "bg-emerald-500" : "bg-rose-500")}>
                                        {difference === 0 ? <CheckCircle2 size={24} /> : <AlertTriangle size={24} />}
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Resultado</span>
                                        <h4 className={cn("text-lg font-black", difference === 0 ? "text-emerald-700" : "text-rose-700")}>
                                            {difference === 0 ? "Cuadre Perfecto" : `Descuadre ${difference > 0 ? '+' : ''}${difference.toFixed(2)}€`}
                                        </h4>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] font-bold text-gray-400">Teórico: {expectedCash.toFixed(2)}€</div>
                                    <div className="text-[10px] font-bold text-gray-400">Físico: {totalCounted.toFixed(2)}€</div>
                                </div>
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
                                {step === 'summary' ? <Save size={20} /> : <ArrowRight size={20} />}
                                {step === 'summary' ? 'Confirmar Cierre' : (step === 'count' ? 'Ver Resumen' : 'Siguiente')}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
