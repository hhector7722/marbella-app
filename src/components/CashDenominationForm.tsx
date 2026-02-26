'use client';

import { useState, useEffect } from 'react';
import { X, Save, Calendar, ShoppingCart, ArrowRightLeft, ArrowRight, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

interface CashDenominationFormProps {
    type: 'in' | 'out' | 'audit';
    boxName: string;
    onSubmit: (total: number, breakdown: any, notes: string, date?: string) => void; // Updated signature
    onCancel: () => void;
    initialCounts?: any;
    availableStock?: Record<number, number>;
    initialNotes?: string;
    initialDate?: string; // New prop
    submitLabel?: string;
    isEditing?: boolean; // New prop
}

export const CashDenominationForm = ({
    type,
    boxName,
    onSubmit,
    onCancel,
    initialCounts = {},
    availableStock = {},
    initialNotes = '',
    initialDate,
    submitLabel,
    isEditing = false
}: CashDenominationFormProps) => {
    const [counts, setCounts] = useState<Record<number, number>>(initialCounts);

    // Sync counts when initialCounts changes (important for Arqueos)
    useEffect(() => {
        if (initialCounts && Object.keys(initialCounts).length > 0) {
            setCounts(initialCounts);
        }
    }, [initialCounts]);

    const [notes, setNotes] = useState(initialNotes);
    // Initialize date state. If initialDate is provided, use it, otherwise default to now (though usually for new movements we rely on DB default, but here we can be explicit if needed, or just leave undefined for new).
    // For editing, initialDate will be present.
    // datetime-local input expects YYYY-MM-DDThh:mm
    const formatForInput = (dateStr?: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    // If strict editing is required, we manage state. 
    // Default to NOW if no initialDate provided
    const nowStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const [selectedDate, setSelectedDate] = useState(initialDate ? formatForInput(initialDate) : nowStr);

    // 5. PURCHASE MODE STATES
    const [isPurchaseMode, setIsPurchaseMode] = useState(false);
    const [purchasePrice, setPurchasePrice] = useState<number>(0);
    const [receivedCounts, setReceivedCounts] = useState<Record<number, number>>({});
    const [purchaseTab, setPurchaseTab] = useState<'given' | 'received'>('given');

    const calculateTotal = (c: Record<number, number>) => DENOMINATIONS.reduce((acc, val) => acc + (val * (c[val] || 0)), 0);

    const handleCountChange = (val: number, qty: string) => {
        const numQty = parseInt(qty) || 0;
        if (isPurchaseMode && purchaseTab === 'received') {
            setReceivedCounts(prev => ({ ...prev, [val]: Math.max(0, numQty) }));
        } else {
            setCounts(prev => ({ ...prev, [val]: Math.max(0, numQty) }));
        }
    };

    const handleAdjust = (val: number, delta: number) => {
        if (isPurchaseMode && purchaseTab === 'received') {
            setReceivedCounts(prev => ({ ...prev, [val]: Math.max(0, (prev[val] || 0) + delta) }));
        } else {
            setCounts(prev => ({ ...prev, [val]: Math.max(0, (prev[val] || 0) + delta) }));
        }
    };

    const handleAdjustPrice = (delta: number) => {
        setPurchasePrice(prev => Math.max(0, (prev || 0) + delta));
    };

    const totalGiven = calculateTotal(counts);
    const totalReceived = calculateTotal(receivedCounts);
    const total = isPurchaseMode ? purchasePrice : totalGiven;

    const netDifference = Math.abs((totalGiven - totalReceived) - purchasePrice);
    const isMathCorrect = netDifference < 0.01;
    const canSubmitPurchase = isMathCorrect && purchasePrice > 0;

    const handleConfirm = () => {
        if (isPurchaseMode) {
            // Calculate net breakdown: Given - Received
            const netBreakdown: any = {};
            DENOMINATIONS.forEach(d => {
                const net = (counts[d] || 0) - (receivedCounts[d] || 0);
                if (net !== 0) netBreakdown[d] = net;
            });
            onSubmit(purchasePrice, netBreakdown, notes || 'Compra', selectedDate ? new Date(selectedDate).toISOString() : undefined);
        } else {
            onSubmit(totalGiven, counts, notes, selectedDate ? new Date(selectedDate).toISOString() : undefined);
        }
    };

    const isAudit = type === 'audit';
    const bgClass = isAudit ? 'bg-orange-400' : (type === 'in' ? 'bg-emerald-400' : 'bg-rose-400');

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white rounded-2xl">
            <div className="bg-[#36606F] px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center shadow-lg",
                        isPurchaseMode ? "bg-orange-500" : (type === 'in' ? "bg-emerald-500" : "bg-rose-500")
                    )}>
                        {isPurchaseMode ? <ShoppingCart size={20} className="text-white" /> : (type === 'in' ? <ArrowRightLeft size={20} /> : <ArrowRight size={20} />)}
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider">
                            {isPurchaseMode ? 'Compra' : (isAudit ? 'Arqueo' : (type === 'in' ? 'Entrada' : 'Salida'))}
                        </h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">{boxName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <span className="block text-[8px] uppercase tracking-widest opacity-50 font-black">
                            {isPurchaseMode ? 'Precio Final' : 'Total Acumulado'}
                        </span>
                        <span className="text-xl font-black">{total.toFixed(2)}€</span>
                    </div>
                </div>
                <button onClick={onCancel} className="w-10 h-10 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shadow-rose-900/20">
                    <X size={20} strokeWidth={3} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {/* PURCHASE MODE TOGGLE */}
                {type === 'out' && !isEditing && (
                    <div className="flex items-center gap-4 bg-white p-3 rounded-2xl shadow-sm border border-zinc-100">
                        <div className="flex-1">
                            <h4 className="text-[10px] font-black text-[#36606F] uppercase tracking-widest leading-none">Modo Compra</h4>
                            <p className="text-[8px] text-zinc-400 font-bold uppercase mt-1">Actívalo para pagar y recibir cambio</p>
                        </div>
                        <button
                            onClick={() => setIsPurchaseMode(!isPurchaseMode)}
                            className={cn(
                                "w-12 h-6 rounded-full transition-all relative outline-none",
                                isPurchaseMode ? "bg-orange-500" : "bg-zinc-200"
                            )}
                        >
                            <div className={cn(
                                "absolute w-4 h-4 bg-white rounded-full top-1 transition-all shadow-md",
                                isPurchaseMode ? "left-7" : "left-1"
                            )} />
                        </button>
                    </div>
                )}

                {/* DATE & NOTES & PRICE ROW */}
                <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 px-1">
                    <div className="flex flex-col justify-end bg-white/50 p-2 rounded-xl border border-zinc-200/50 shadow-sm">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1 flex items-center gap-1">
                            <Calendar size={8} />
                            Fecha
                        </label>
                        <input
                            type="datetime-local"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-zinc-600 text-[9px] font-black uppercase tracking-tighter outline-none focus:ring-0 cursor-pointer hover:text-[#5B8FB9] transition-colors"
                        />
                    </div>

                    {isPurchaseMode ? (
                        <div className="flex flex-col p-2 bg-orange-50/50 rounded-xl border border-orange-100 shadow-sm">
                            <label className="block text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1 ml-1">Precio de la Compra</label>
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => handleAdjustPrice(-1)}
                                    className="w-8 h-8 flex items-center justify-center text-orange-400 active:scale-95 transition-all shrink-0"
                                >
                                    <Minus size={16} strokeWidth={3} />
                                </button>
                                <div className="flex-1 flex items-center relative">
                                    <input
                                        type="number"
                                        step="0.01"
                                        value={purchasePrice || ''}
                                        onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                                        placeholder="0.00"
                                        className="w-full bg-transparent border-none p-0 text-orange-600 text-xl font-black outline-none focus:ring-0 text-center"
                                    />
                                    <span className="text-orange-400 font-black absolute right-0">€</span>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => handleAdjustPrice(1)}
                                    className="w-8 h-8 flex items-center justify-center text-orange-400 active:scale-95 transition-all shrink-0"
                                >
                                    <Plus size={16} strokeWidth={3} />
                                </button>
                            </div>
                        </div>
                    ) : !isAudit && (
                        <div className="flex flex-col p-2 bg-white rounded-xl border border-zinc-200/50 shadow-sm">
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Concepto / Motivo</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ej. Cambio banco, Pago proveedor..."
                                className="w-full bg-transparent border-none p-0 text-zinc-600 font-bold outline-none text-xs"
                            />
                        </div>
                    )}

                    {isPurchaseMode && (
                        <div className="flex flex-col p-2 bg-white rounded-xl border border-zinc-200/50 shadow-sm sm:col-span-2 lg:col-span-1">
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Concepto</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Nombre del proveedor o artículo..."
                                className="w-full bg-transparent border-none p-0 text-zinc-600 font-bold outline-none text-xs"
                            />
                        </div>
                    )}
                </div>

                {/* PURCHASE TABS */}
                {isPurchaseMode && (
                    <div className="flex gap-2 bg-zinc-100 p-1.5 rounded-2xl">
                        <button
                            onClick={() => setPurchaseTab('given')}
                            className={cn(
                                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center",
                                purchaseTab === 'given' ? "bg-white text-rose-500 shadow-md scale-[1.02]" : "text-zinc-400 hover:text-zinc-600"
                            )}
                        >
                            <span>Lo que das</span>
                            <span className="text-[14px] mt-0.5">{totalGiven.toFixed(2)}€</span>
                        </button>
                        <button
                            onClick={() => setPurchaseTab('received')}
                            className={cn(
                                "flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center",
                                purchaseTab === 'received' ? "bg-white text-emerald-500 shadow-md scale-[1.02]" : "text-zinc-400 hover:text-zinc-600"
                            )}
                        >
                            <span>Tu cambio</span>
                            <span className="text-[14px] mt-0.5">{totalReceived.toFixed(2)}€</span>
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                    {DENOMINATIONS.map(denom => (
                        <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                            <div className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110">
                                <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg" />
                            </div>
                            <div className="text-center w-full">
                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                                    {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                </span>
                                <div className={cn(
                                    "flex items-center justify-between w-full h-10 bg-white border rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1",
                                    (type === 'out' && !isPurchaseMode) && (counts[denom] || 0) > (availableStock[denom] || 0) ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200" :
                                        (isPurchaseMode && purchaseTab === 'given' && (counts[denom] || 0) > (availableStock[denom] || 0)) ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200" :
                                            "border-zinc-200 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20"
                                )}>
                                    <button
                                        type="button"
                                        onClick={() => handleAdjust(denom, -1)}
                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                    >
                                        <Minus size={14} strokeWidth={3} />
                                    </button>
                                    <input
                                        type="number"
                                        min="0"
                                        value={(isPurchaseMode && purchaseTab === 'received' ? receivedCounts[denom] : counts[denom]) || ''}
                                        onChange={(e) => handleCountChange(denom, e.target.value)}
                                        placeholder="0"
                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleAdjust(denom, 1)}
                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                    >
                                        <Plus size={14} strokeWidth={3} />
                                    </button>
                                </div>
                                {((!isPurchaseMode && type === 'out') || (isPurchaseMode && purchaseTab === 'given')) && (availableStock[denom] || 0) > 0 && (
                                    <span className="text-[7px] font-bold text-gray-400 uppercase mt-1 block">Disp: {availableStock[denom]}</span>
                                )}
                            </div>
                        </div>
                    ))}
                    {/* MOBILE IN-GRID ACTIONS (Fills the remaining 3 columns next to 1c) */}
                    <div className="sm:hidden col-span-3 flex items-end justify-end gap-1.5 pb-1 h-full pt-4">
                        <button
                            onClick={onCancel}
                            className="flex-1 h-10 bg-rose-500 text-white font-black uppercase tracking-widest text-[9px] active:bg-rose-600 rounded-xl transition-all active:scale-95 flex items-center justify-center shadow-md shadow-rose-200"
                        >
                            <X size={14} strokeWidth={3} />
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isPurchaseMode ? !canSubmitPurchase : (totalGiven <= 0)}
                            className={cn(
                                "flex-[2] h-10 text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all active:scale-95",
                                isPurchaseMode
                                    ? (canSubmitPurchase ? "bg-orange-500 shadow-orange-200" : "bg-zinc-300 opacity-50 cursor-not-allowed")
                                    : ((totalGiven <= 0)
                                        ? "bg-gray-300 opacity-50 shadow-none cursor-not-allowed"
                                        : "bg-emerald-500 shadow-emerald-200")
                            )}
                        >
                            <Save size={16} strokeWidth={3} />
                            Guardar
                        </button>
                    </div>
                </div>
            </div>
            {/* DESKTOP FOOTER */}
            <div className="hidden sm:flex p-3 bg-white border-t gap-2 shrink-0">
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-white bg-rose-500 font-black uppercase tracking-widest text-[9px] hover:bg-rose-600 rounded-xl transition-all active:scale-95 shadow-md shadow-rose-200"
                >
                    Cancelar
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={isPurchaseMode ? !canSubmitPurchase : (totalGiven <= 0)}
                    className={cn(
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95",
                        isPurchaseMode
                            ? (canSubmitPurchase ? "bg-orange-500 shadow-orange-200" : "bg-zinc-300 opacity-50 cursor-not-allowed")
                            : ((totalGiven <= 0)
                                ? "bg-gray-300 opacity-50 cursor-not-allowed shadow-none"
                                : "bg-emerald-500 hover:brightness-110 shadow-emerald-200")
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Save size={16} strokeWidth={3} />
                        {submitLabel || (isAudit ? 'Ajustar Arqueo' : 'Confirmar Operación')}
                    </div>
                    {isPurchaseMode && !canSubmitPurchase && purchasePrice > 0 && (
                        <span className="text-[7px] opacity-80">
                            {totalGiven - totalReceived > purchasePrice ? `Sobra ${(totalGiven - totalReceived - purchasePrice).toFixed(2)}€` : `Falta ${(purchasePrice - (totalGiven - totalReceived)).toFixed(2)}€`}
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
};
