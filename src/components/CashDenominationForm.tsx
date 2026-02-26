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
    forcePurchaseMode?: boolean; // New prop
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
    isEditing = false,
    forcePurchaseMode = false
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
    const [isPurchaseMode, setIsPurchaseMode] = useState(forcePurchaseMode || false);
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

    const netDifference = totalGiven - totalReceived;
    const isMathCorrect = Math.abs(netDifference - purchasePrice) < 0.01;
    // check stock issue for OUTs
    const hasStockIssue = ((type === 'out' && !isPurchaseMode) || (isPurchaseMode && purchaseTab === 'given')) && DENOMINATIONS.some(d => (counts[d] || 0) > (availableStock[d] || 0));
    // canSubmitPurchase allows submission if Math is Correct, OR if they are just doing a simple exit of money (given = price) without expecting change
    const canSubmitPurchase = isMathCorrect && purchasePrice > 0 && totalGiven >= purchasePrice && !hasStockIssue;

    const handleConfirm = () => {
        if (isPurchaseMode) {
            // Calculate net breakdown: Given - Received
            const netBreakdown: any = {};
            DENOMINATIONS.forEach(d => {
                const net = (counts[d] || 0) - (receivedCounts[d] || 0);
                if (net !== 0) netBreakdown[d] = net;
            });
            // Total cost is purchasePrice, passing netBreakdown to deduct precise stock
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
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <span className="block text-[8px] uppercase tracking-widest opacity-50 font-black leading-none mb-0.5">
                            {isPurchaseMode ? 'Precio Final' : 'Total Acumulado'}
                        </span>
                        <div className="flex items-baseline justify-end gap-0.5">
                            <span className="text-xl font-black tabular-nums">{total.toFixed(2)}</span>
                            <span className="text-xs font-black opacity-50">€</span>
                        </div>
                    </div>

                    {type === 'out' && !isEditing && !forcePurchaseMode && (
                        <div className="flex flex-col items-center gap-1 pr-1 border-l border-white/10 pl-4 h-10 justify-center">
                            <span className="text-[7px] font-black uppercase opacity-50 tracking-widest">Compra</span>
                            <button
                                onClick={() => setIsPurchaseMode(!isPurchaseMode)}
                                className={cn(
                                    "w-10 h-5 rounded-full transition-all relative outline-none",
                                    isPurchaseMode ? "bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.4)]" : "bg-white/20"
                                )}
                            >
                                <div className={cn(
                                    "absolute w-3 h-3 bg-white rounded-full top-1 transition-all shadow-sm",
                                    isPurchaseMode ? "left-6" : "left-1"
                                )} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">

                {/* DATE & NOTES & PRICE ROW */}
                {isPurchaseMode ? (
                    <div className="flex flex-col gap-2 px-1">
                        {/* ROW 1: Fecha y Concepto */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex flex-col justify-center bg-blue-600 p-2 rounded-xl border border-white/10 shadow-sm transition-all">
                                <input
                                    type="datetime-local"
                                    value={selectedDate}
                                    onChange={(e) => setSelectedDate(e.target.value)}
                                    className="w-full bg-transparent border-none p-0 text-white text-[10px] font-black uppercase tracking-widest outline-none focus:ring-0 cursor-pointer text-center"
                                />
                            </div>
                            <div className="flex flex-col p-2 bg-white rounded-xl border border-zinc-200/50 shadow-sm">
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Concepto</label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Motivo..."
                                    className="w-full bg-transparent border-none p-0 text-zinc-600 font-bold outline-none text-xs"
                                />
                            </div>
                        </div>

                        {/* ROW 2: Precio, Entregado, Cambio */}
                        <div className="grid grid-cols-3 gap-2">
                            {/* PRECIO */}
                            <div className="flex flex-col p-1.5 bg-orange-50/50 rounded-xl border border-orange-100 shadow-sm justify-center">
                                <label className="block text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1 text-center">Precio</label>
                                <div className="flex items-center justify-center gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustPrice(-1)}
                                        className="w-6 h-6 flex items-center justify-center text-orange-400 active:scale-95 transition-all shrink-0"
                                    >
                                        <Minus size={14} strokeWidth={3} />
                                    </button>
                                    <div className="flex items-center relative flex-1 max-w-[48px] justify-center">
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={purchasePrice || ''}
                                            onChange={(e) => setPurchasePrice(parseFloat(e.target.value) || 0)}
                                            placeholder="0.00"
                                            className="w-full bg-transparent border-none p-0 text-orange-600 text-sm font-black outline-none focus:ring-0 text-center flex-1 min-w-0"
                                        />
                                        <span className="text-orange-400 font-black absolute right-0 text-[10px] pointer-events-none opacity-50">€</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleAdjustPrice(1)}
                                        className="w-6 h-6 flex items-center justify-center text-orange-400 active:scale-95 transition-all shrink-0"
                                    >
                                        <Plus size={14} strokeWidth={3} />
                                    </button>
                                </div>
                            </div>

                            {/* LO QUE DAS / ENTREGADO */}
                            <button
                                onClick={() => setPurchaseTab('given')}
                                className={cn(
                                    "flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center",
                                    purchaseTab === 'given' ? "bg-white text-rose-500 shadow-md border border-rose-100 scale-[1.02]" : "bg-zinc-100 text-zinc-400 hover:text-zinc-600 border border-transparent"
                                )}
                            >
                                <span className="text-[8px] opacity-80 uppercase tracking-widest">Entregado</span>
                                <span className="text-xs mt-0.5">{totalGiven.toFixed(2)}€</span>
                            </button>

                            {/* TU CAMBIO / CAMBIO */}
                            <button
                                onClick={() => setPurchaseTab('received')}
                                className={cn(
                                    "flex-1 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex flex-col items-center justify-center",
                                    purchaseTab === 'received' ? "bg-white text-emerald-500 shadow-md border border-emerald-100 scale-[1.02]" : "bg-zinc-100 text-zinc-400 hover:text-zinc-600 border border-transparent"
                                )}
                            >
                                <span className="text-[8px] opacity-80 uppercase tracking-widest">Cambio</span>
                                <span className="text-xs mt-0.5">{totalReceived.toFixed(2)}€</span>
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-2 px-1">
                        <div className={cn(
                            "flex flex-col justify-center bg-blue-600 p-2 rounded-xl border border-white/10 shadow-sm transition-all",
                            isAudit && "col-span-full"
                        )}>
                            <input
                                type="datetime-local"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-full bg-transparent border-none p-0 text-white text-[10px] font-black uppercase tracking-widest outline-none focus:ring-0 cursor-pointer text-center"
                            />
                        </div>

                        {!isAudit && (
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
                                    hasStockIssue
                                        ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200"
                                        : "border-zinc-200 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20"
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

                    {/* IN-GRID ACTIONS (Fills the remaining 3 columns next to 1c on small screens, or wraps on larger depending on cols) */}
                    <div className={cn(
                        "col-span-3 sm:hidden flex items-end justify-end gap-1.5 h-full pt-4",
                        (((!isPurchaseMode && type === 'out') || (isPurchaseMode && purchaseTab === 'given')) && (availableStock[0.01] || 0) > 0)
                            ? "pb-[16px]" // Offset to align with h-10 input instead of the Disp: label
                            : "pb-1"
                    )}>
                        <button
                            onClick={handleConfirm}
                            disabled={isPurchaseMode ? !canSubmitPurchase : (totalGiven <= 0)}
                            className={cn(
                                "flex-[2] h-10 text-white font-black uppercase tracking-widest text-[11px] rounded-xl shadow-md flex justify-center gap-1.5 transition-all active:scale-95 flex-col items-center",
                                isPurchaseMode
                                    ? (canSubmitPurchase ? "bg-orange-500 shadow-orange-200" : "bg-zinc-300 opacity-50 cursor-not-allowed")
                                    : ((totalGiven <= 0)
                                        ? "bg-gray-300 opacity-50 shadow-none cursor-not-allowed"
                                        : "bg-emerald-500 shadow-emerald-200")
                            )}
                        >
                            <div className="flex items-center gap-1.5">
                                <Save size={16} strokeWidth={3} />
                                {hasStockIssue ? 'STOCK INSUFICIENTE' : 'GUARDAR'}
                            </div>
                            {isPurchaseMode && !canSubmitPurchase && purchasePrice > 0 && (
                                <span className="text-[7px] leading-none -mt-1 mb-0.5 font-bold tracking-tight">
                                    {totalGiven < purchasePrice ? `Falta ${(purchasePrice - totalGiven).toFixed(2)}€` : `Da cambio: ${(totalGiven - purchasePrice - totalReceived).toFixed(2)}€`}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={onCancel}
                            className="flex-1 h-10 bg-rose-500 text-white font-black uppercase tracking-widest text-[10px] active:bg-rose-600 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shadow-md shadow-rose-200"
                        >
                            <X size={14} strokeWidth={3} />
                            Salir
                        </button>
                    </div>
                </div>
            </div>
            {/* DESKTOP FOOTER */}
            <div className="hidden sm:flex p-3 bg-white border-t gap-2 shrink-0">
                <button
                    onClick={handleConfirm}
                    disabled={isPurchaseMode ? !canSubmitPurchase : (totalGiven <= 0)}
                    className={cn(
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95",
                        isPurchaseMode
                            ? (canSubmitPurchase ? "bg-orange-500 shadow-orange-200 hover:brightness-110" : "bg-zinc-300 opacity-50 cursor-not-allowed")
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
                            {totalGiven < purchasePrice ? `Falta ${(purchasePrice - totalGiven).toFixed(2)}€` : `Da cambio: ${(totalGiven - purchasePrice - totalReceived).toFixed(2)}€`}
                        </span>
                    )}
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-white bg-rose-500 font-black uppercase tracking-widest text-[9px] hover:bg-rose-600 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shadow-md shadow-rose-200"
                >
                    <X size={14} strokeWidth={3} />
                    Salir
                </button>
            </div>
        </div >
    );
};
