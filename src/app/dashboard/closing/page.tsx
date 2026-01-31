'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Banknote, Coins, Calculator, Loader2, CreditCard, UserMinus, ArchiveRestore, Store, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

// --- CONFIGURACIÓN ---
const FIXED_CASH_FUND = 100; // Fondo fijo obligatorio (100€)
const BILLS = [500, 200, 100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];

type ClosingStep = 'tpv_data' | 'count' | 'summary';

export default function ClosingPage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<ClosingStep>('tpv_data');

    // 1. ESTADO: TPVs (Desglosados para rigor)
    const [tpvData, setTpvData] = useState({
        tpv1: 0, // Fin de semana / Refuerzo
        tpv2: 0, // Principal (L-V)
        cardSales: 0,
        pendingSales: 0,
        debtRecovered: 0
    });

    // 2. ESTADO: CONTEO
    const [counts, setCounts] = useState<Record<string, number>>({});

    // 3. ESTADO: FONDO INICIAL
    const [openingCash, setOpeningCash] = useState(FIXED_CASH_FUND); // Por defecto esperamos 100€

    useEffect(() => {
        async function fetchOpening() {
            // Verificamos cuánto se dejó realmente ayer (por si hubo error y no fueron 100)
            const { data } = await supabase
                .from('cash_closings')
                .select('cash_left') // Usamos la nueva columna si existe, o calculamos
                .order('closed_at', { ascending: false })
                .limit(1)
                .single();

            if (data?.cash_left) {
                setOpeningCash(data.cash_left);
            }
        }
        fetchOpening();
    }, []);

    // --- CÁLCULOS ---
    const totalSalesGross = tpvData.tpv1 + tpvData.tpv2;
    const cashSalesToday = totalSalesGross - tpvData.cardSales - tpvData.pendingSales;

    // Dinero TEÓRICO (Libro Mayor)
    const expectedCash = openingCash + cashSalesToday + tpvData.debtRecovered;

    // Dinero REAL (Físico)
    const totalCounted = Object.entries(counts).reduce((sum, [val, qty]) => sum + (parseFloat(val) * qty), 0);

    // Descuadre
    const difference = totalCounted - expectedCash;

    // OPERATIVA DE RETIRADA
    // Si hay más de 100€, retiramos el exceso. Si hay menos, no se retira nada (y falta fondo).
    const cashToWithdraw = totalCounted > FIXED_CASH_FUND ? totalCounted - FIXED_CASH_FUND : 0;
    const cashLeft = totalCounted > FIXED_CASH_FUND ? FIXED_CASH_FUND : totalCounted;

    // --- HANDLERS ---
    const updateCount = (value: number, qty: string) => {
        const quantity = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [value]: quantity }));
    };

    const handleFinalizeClose = async () => {
        if (!confirm(`CONFIRMAR:\n\n1. Retirar: ${cashToWithdraw.toFixed(2)}€\n2. Dejar en caja: ${cashLeft.toFixed(2)}€\n\n¿Proceder?`)) return;

        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();

            const { data: closing, error } = await supabase
                .from('cash_closings')
                .insert({
                    opened_by: user?.id,
                    closed_by: user?.id,
                    closed_at: new Date().toISOString(),

                    // Totales
                    net_sales: totalSalesGross,
                    sales_card: tpvData.cardSales,
                    sales_pending: tpvData.pendingSales,
                    debt_recovered: tpvData.debtRecovered,

                    // Cuadre
                    cash_expected: expectedCash,
                    cash_counted: totalCounted,
                    difference: difference,

                    // Operativa de Retirada (NUEVO)
                    cash_withdrawn: cashToWithdraw,
                    cash_left: cashLeft, // Debería ser 100 siempre si todo va bien

                    // Guardamos el desglose de TPVs en las notas para no crear columnas extra innecesarias
                    notes: `TPV1: ${tpvData.tpv1.toFixed(2)}€ | TPV2: ${tpvData.tpv2.toFixed(2)}€ | ${difference !== 0 ? `Descuadre: ${difference.toFixed(2)}€` : 'OK'}`
                })
                .select()
                .single();

            if (error) throw error;

            // Insertar desglose monedas (Igual que antes)
            const countEntries = Object.entries(counts).map(([denomination, count]) => ({
                closing_id: closing.id,
                denomination: parseFloat(denomination),
                quantity: count,
                total_amount: parseFloat(denomination) * count
            })).filter(item => item.quantity > 0);

            if (countEntries.length > 0) {
                await supabase.from('cash_counts').insert(countEntries);
            }

            toast.success("Cierre completado. Recuerda retirar el dinero.");
            router.push('/dashboard');
        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-4 md:p-8 w-full max-w-4xl mx-auto min-h-screen flex flex-col">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <button onClick={() => router.back()} className="flex items-center gap-2 text-white/80 hover:text-white font-bold transition-colors text-sm">
                    <ArrowLeft size={16} /> Cancelar
                </button>
                <div className="flex gap-2">
                    {['tpv_data', 'count', 'summary'].map((s) => (
                        <div key={s} className={`h-2 w-8 rounded-full ${step === s ? 'bg-white' : 'bg-white/30'}`} />
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden flex-1 flex flex-col">

                {/* --- PASO 1: DATOS TPV (DESGLOSADO) --- */}
                {step === 'tpv_data' && (
                    <div className="p-6 md:p-10 flex-1 flex flex-col">
                        <h2 className="text-2xl font-black text-[#36606F] mb-2">1. Datos de Ventas</h2>
                        <p className="text-gray-500 text-sm mb-6">Introduce los totales Z de cada terminal.</p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Desglose TPVs */}
                            <div className="col-span-1 md:col-span-2 grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-2xl border border-gray-200">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">TPV 2 (Principal)</label>
                                    <input
                                        type="number"
                                        autoFocus
                                        className="w-full text-2xl font-black text-gray-800 border-b-2 border-gray-300 focus:border-blue-500 outline-none bg-transparent"
                                        placeholder="0.00"
                                        value={tpvData.tpv2 || ''}
                                        onChange={e => setTpvData({ ...tpvData, tpv2: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">TPV 1 (Refuerzo)</label>
                                    <input
                                        type="number"
                                        className="w-full text-2xl font-bold text-gray-600 border-b-2 border-gray-200 focus:border-blue-500 outline-none bg-transparent"
                                        placeholder="0.00"
                                        value={tpvData.tpv1 || ''}
                                        onChange={e => setTpvData({ ...tpvData, tpv1: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                                <div className="col-span-2 text-right pt-2 border-t border-gray-200">
                                    <span className="text-xs font-bold text-gray-400 uppercase mr-2">Total Bruto:</span>
                                    <span className="text-xl font-black text-[#36606F]">{totalSalesGross.toFixed(2)}€</span>
                                </div>
                            </div>

                            {/* Desglose Cobros */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-800">No Efectivo</h3>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase mb-1">
                                        <CreditCard size={14} /> Total Tarjetas
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full text-lg font-bold text-gray-700 border border-gray-200 rounded-lg p-3 focus:ring-2 ring-red-100 outline-none"
                                        value={tpvData.cardSales || ''}
                                        onChange={e => setTpvData({ ...tpvData, cardSales: parseFloat(e.target.value) || 0 })}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Suma de datáfonos TPV1 + TPV2</p>
                                </div>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-orange-400 uppercase mb-1">
                                        <UserMinus size={14} /> Pendiente / Fiado
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full text-lg font-bold text-gray-700 border border-gray-200 rounded-lg p-3 focus:ring-2 ring-orange-100 outline-none"
                                        value={tpvData.pendingSales || ''}
                                        onChange={e => setTpvData({ ...tpvData, pendingSales: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-800">Entradas Extra</h3>
                                <div>
                                    <label className="flex items-center gap-2 text-xs font-bold text-green-500 uppercase mb-1">
                                        <ArchiveRestore size={14} /> Recuperación Deuda
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full text-lg font-bold text-gray-700 border border-gray-200 rounded-lg p-3 focus:ring-2 ring-green-100 outline-none"
                                        value={tpvData.debtRecovered || ''}
                                        onChange={e => setTpvData({ ...tpvData, debtRecovered: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>

                        </div>

                        <button onClick={() => setStep('count')} className="mt-auto w-full py-4 bg-[#36606F] text-white rounded-xl font-bold text-lg hover:bg-[#2c4e5a] transition-all flex justify-center items-center gap-2 shadow-lg">
                            Siguiente: Arqueo <ArrowLeft className="rotate-180" size={20} />
                        </button>
                    </div>
                )}

                {/* --- PASO 2: ARQUEO FÍSICO (Idéntico visualmente, sin cambios) --- */}
                {step === 'count' && (
                    <div className="flex-1 flex flex-col h-full">
                        <div className="p-6 pb-2 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h2 className="text-xl font-black text-[#36606F]">2. Arqueo Físico</h2>
                            <div className="text-2xl font-mono font-bold text-gray-800 bg-white px-3 py-1 rounded-lg border shadow-sm">
                                {totalCounted.toFixed(2)}€
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                    {BILLS.map(bill => (
                                        <div key={bill} className="flex items-center gap-3">
                                            <span className="w-12 font-bold text-gray-600 text-right text-sm">{bill}€</span>
                                            <input type="number" min="0" placeholder="0" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-center font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#5B8FB9]" value={counts[bill] || ''} onChange={(e) => updateCount(bill, e.target.value)} />
                                        </div>
                                    ))}
                                </div>
                                <div className="space-y-3">
                                    {COINS.map(coin => (
                                        <div key={coin} className="flex items-center gap-3">
                                            <span className="w-12 font-bold text-gray-600 text-right text-sm">{coin}€</span>
                                            <input type="number" min="0" placeholder="0" className="flex-1 bg-gray-50 border border-gray-200 rounded-lg py-2 px-3 text-center font-bold outline-none focus:bg-white focus:ring-2 focus:ring-[#5B8FB9]" value={counts[coin] || ''} onChange={(e) => updateCount(coin, e.target.value)} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-gray-200 flex gap-4">
                            <button onClick={() => setStep('tpv_data')} className="px-6 font-bold text-gray-500 hover:bg-gray-100 rounded-xl">Atrás</button>
                            <button onClick={() => setStep('summary')} className="flex-1 py-3 bg-[#36606F] text-white rounded-xl font-bold shadow-lg hover:bg-[#2c4e5a]">Revisar Cierre</button>
                        </div>
                    </div>
                )}

                {/* --- PASO 3: RESUMEN Y ACCIÓN OPERATIVA (CRÍTICO) --- */}
                {step === 'summary' && (
                    <div className="p-6 md:p-10 flex-1 flex flex-col justify-center">
                        <div className="w-full max-w-2xl mx-auto space-y-6">

                            <h2 className="text-2xl font-black text-center text-gray-800">Acción Requerida</h2>

                            {/* TARJETA DE ACCIÓN PRINCIPAL (LO MÁS IMPORTANTE) */}
                            <div className="bg-[#36606F] rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                                <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl"></div>
                                <div className="grid grid-cols-2 gap-8 relative z-10">
                                    <div className="text-center border-r border-white/20">
                                        <div className="text-xs font-bold text-blue-200 uppercase mb-2 flex items-center justify-center gap-1">
                                            <Banknote size={14} /> RETIRAR (SOBRE)
                                        </div>
                                        <div className="text-4xl font-black">{cashToWithdraw.toFixed(2)}€</div>
                                        <div className="text-[10px] text-blue-200 mt-1">Beneficio + Ventas</div>
                                    </div>
                                    <div className="text-center">
                                        <div className="text-xs font-bold text-green-200 uppercase mb-2 flex items-center justify-center gap-1">
                                            <Store size={14} /> DEJAR (CAJÓN)
                                        </div>
                                        <div className="text-4xl font-black">{cashLeft.toFixed(2)}€</div>
                                        <div className="text-[10px] text-green-200 mt-1">Fondo Fijo</div>
                                    </div>
                                </div>
                                {cashLeft < FIXED_CASH_FUND && (
                                    <div className="mt-4 bg-red-500/20 p-2 rounded-lg text-center text-xs font-bold text-red-100 border border-red-500/30 flex items-center justify-center gap-2">
                                        <AlertTriangle size={14} />
                                        ATENCIÓN: Faltan {(FIXED_CASH_FUND - cashLeft).toFixed(2)}€ para el fondo fijo.
                                    </div>
                                )}
                            </div>

                            {/* Detalle del Cuadre (Secundario) */}
                            <div className={`p-4 rounded-xl border-2 flex justify-between items-center ${difference === 0 ? 'bg-green-50 border-green-100' : 'bg-red-50 border-red-100'}`}>
                                <div>
                                    <div className="text-xs font-bold uppercase text-gray-500">Resultado Contable</div>
                                    <div className={`font-black text-xl ${difference === 0 ? 'text-green-700' : 'text-red-600'}`}>
                                        {difference === 0 ? 'CUADRE PERFECTO' : `DESCUADRE: ${difference > 0 ? '+' : ''}${difference.toFixed(2)}€`}
                                    </div>
                                </div>
                                <div className="text-right text-xs text-gray-400">
                                    <div>Esperado: {expectedCash.toFixed(2)}€</div>
                                    <div>Contado: {totalCounted.toFixed(2)}€</div>
                                </div>
                            </div>

                            <div className="pt-4 flex gap-4">
                                <button onClick={() => setStep('count')} className="flex-1 py-3 bg-white border-2 border-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-50">
                                    Recontar
                                </button>
                                <button
                                    onClick={handleFinalizeClose}
                                    disabled={loading}
                                    className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl shadow-lg hover:bg-green-700 hover:scale-[1.02] transition-all flex justify-center gap-2"
                                >
                                    {loading ? <Loader2 className="animate-spin" /> : <Save size={20} />}
                                    Confirmar y Cerrar
                                </button>
                            </div>

                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}