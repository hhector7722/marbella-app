'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { DENOMINATIONS } from '@/lib/constants';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';
import { getBoxInventoryForAutofill } from '@/app/actions/cash-box-inventory';
import { greedyCashBreakdown, hasAnyInventoryStock } from '@/lib/greedy-cash-breakdown';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { formatCashCountDateInput } from '@/components/cash/CashCountDateButton';

interface CashDenominationFormProps {
    type: 'in' | 'out' | 'audit';
    boxName: string;
    boxId?: string;
    onSubmit: (total: number, breakdown: Record<number, number>, notes: string, date?: string) => void;
    onCancel: () => void;
    initialCounts?: Record<number, number>;
    availableStock?: Record<number, number>;
    initialNotes?: string;
    initialDate?: string;
    submitLabel?: string;
    isEditing?: boolean;
    forcePurchaseMode?: boolean;
    variant?: 'default' | 'tipPool' | 'embedded';
    onTotalChange?: (total: number) => void;
    formId?: string;
    selectedDate?: string;
    onSelectedDateChange?: (next: string) => void;
}

export const TIP_POOL_CASH_FORM_ID = 'tips-cash-denomination-form';
export const CASH_COUNT_FORM_ID = 'cash-denomination-form';

function inventoryFromStockMap(stock: Record<number, number>) {
    return DENOMINATIONS.map((d) => ({ denomination: d, quantity: stock[d] || 0 })).filter((r) => r.quantity > 0);
}

export const CashDenominationForm = ({
    type,
    boxId,
    onSubmit,
    initialCounts = {},
    availableStock = {},
    initialNotes = '',
    initialDate,
    isEditing = false,
    forcePurchaseMode = false,
    variant = 'default',
    onTotalChange,
    formId = CASH_COUNT_FORM_ID,
    selectedDate: selectedDateProp,
    onSelectedDateChange,
}: CashDenominationFormProps) => {
    const [counts, setCounts] = useState<Record<number, number>>(initialCounts);
    const countsSyncKeyRef = useRef('');

    useEffect(() => {
        const key = JSON.stringify(initialCounts ?? {});
        if (key === countsSyncKeyRef.current) return;
        countsSyncKeyRef.current = key;
        if (initialCounts && Object.keys(initialCounts).length > 0) {
            setCounts(initialCounts);
        }
    }, [initialCounts]);

    const [notes, setNotes] = useState(initialNotes);
    const nowStr = formatCashCountDateInput();
    const [internalDate, setInternalDate] = useState(initialDate ? formatCashCountDateInput(new Date(initialDate)) : nowStr);
    const selectedDate = selectedDateProp ?? internalDate;
    const setSelectedDate = onSelectedDateChange ?? setInternalDate;

    const [isPurchaseMode, setIsPurchaseMode] = useState(forcePurchaseMode || false);
    const [purchasePrice, setPurchasePrice] = useState<number | ''>('');
    const [receivedCounts, setReceivedCounts] = useState<Record<number, number>>({});
    const [purchaseTab, setPurchaseTab] = useState<'given' | 'received'>('given');
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);
    const [outTargetAmount, setOutTargetAmount] = useState<number | ''>('');
    const [autofillLoading, setAutofillLoading] = useState(false);

    const calculateTotal = (c: Record<number, number>) =>
        DENOMINATIONS.reduce((acc, val) => acc + val * (c[val] || 0), 0);
    const isAudit = type === 'audit';
    const isTipPool = variant === 'tipPool';
    const showOutAutofill = type === 'out' && !isAudit && !isEditing;
    const isOutSalidaLayout = type === 'out' && !isAudit;

    const autofillTargetAmount = isPurchaseMode
        ? (typeof purchasePrice === 'number' ? purchasePrice : 0)
        : (typeof outTargetAmount === 'number' ? outTargetAmount : 0);

    const stockHasInventory = useMemo(
        () => hasAnyInventoryStock(availableStock),
        [availableStock],
    );

    const autofillDisabled =
        autofillLoading ||
        autofillTargetAmount <= 0 ||
        !stockHasInventory;

    const handleAutofillBreakdown = async () => {
        const amount = autofillTargetAmount;
        if (amount <= 0) return;

        setAutofillLoading(true);
        try {
            let inventory = inventoryFromStockMap(availableStock);

            if (boxId) {
                const res = await getBoxInventoryForAutofill(boxId);
                if (!res.ok) {
                    toast.error(res.error);
                    return;
                }
                inventory = res.inventory;
            }

            if (!hasAnyInventoryStock(inventory)) {
                toast.error('El inventario de la caja está vacío.');
                return;
            }

            const { breakdown, remaining } = greedyCashBreakdown(amount, inventory);
            const nextCounts: Record<number, number> = {};
            DENOMINATIONS.forEach((d) => {
                const q = breakdown[d] ?? 0;
                if (q > 0) nextCounts[d] = q;
            });
            setCounts(nextCounts);
            if (isPurchaseMode) setPurchaseTab('given');

            if (remaining > 0.005) {
                toast.warning(
                    `No se puede completar el desglose exacto con las existencias actuales. Faltan ${remaining.toFixed(2)}€ por asignar.`,
                );
            }
        } catch (e) {
            console.error(e);
            toast.error('Error al autorrellenar el desglose.');
        } finally {
            setAutofillLoading(false);
        }
    };

    const handleCountChange = (val: number, qty: string) => {
        const numQty = parseInt(qty) || 0;
        if (isPurchaseMode && purchaseTab === 'received') {
            setReceivedCounts((prev) => ({ ...prev, [val]: numQty }));
        } else {
            setCounts((prev) => ({ ...prev, [val]: numQty }));
        }
    };

    const handleAdjust = (val: number, delta: number) => {
        if (isPurchaseMode && purchaseTab === 'received') {
            setReceivedCounts((prev) => ({ ...prev, [val]: Math.max(0, (prev[val] || 0) + delta) }));
        } else {
            setCounts((prev) => ({ ...prev, [val]: Math.max(0, (prev[val] || 0) + delta) }));
        }
    };

    const totalGiven = calculateTotal(counts);
    const totalReceived = calculateTotal(receivedCounts);
    const netDifference = totalGiven - totalReceived;
    const isMathCorrect = Math.abs(netDifference - (purchasePrice || 0)) < 0.01;
    const canSubmitPurchase = isMathCorrect && (purchasePrice || 0) > 0 && totalGiven >= (purchasePrice || 0);

    useEffect(() => {
        onTotalChange?.(isPurchaseMode ? (typeof purchasePrice === 'number' ? purchasePrice : 0) : totalGiven);
    }, [isPurchaseMode, onTotalChange, purchasePrice, totalGiven]);

    const handleConfirm = () => {
        if (isPurchaseMode) {
            const netBreakdown: Record<number, number> = {};
            DENOMINATIONS.forEach((d) => {
                const net = (counts[d] || 0) - (receivedCounts[d] || 0);
                if (net !== 0) netBreakdown[d] = net;
            });
            onSubmit(
                purchasePrice || 0,
                netBreakdown,
                notes || 'Compra',
                selectedDate ? new Date(selectedDate).toISOString() : undefined,
            );
        } else {
            onSubmit(totalGiven, counts, notes, selectedDate ? new Date(selectedDate).toISOString() : undefined);
        }
    };

    const activeCounts = isPurchaseMode && purchaseTab === 'received' ? receivedCounts : counts;
    const showStock = ((!isPurchaseMode && type === 'out') || (isPurchaseMode && purchaseTab === 'given')) &&
        Object.values(availableStock).some((n) => n > 0);

    return (
        <form
            id={formId}
            className="min-h-0"
            onSubmit={(e) => {
                e.preventDefault();
                handleConfirm();
            }}
        >
            <div className="relative flex min-h-0 flex-col bg-white">
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                <FloatingCalculatorFab
                    isOpen={calculatorOpen}
                    onToggle={() => setCalculatorOpen(true)}
                    className="bottom-20 right-4 sm:bottom-24 sm:right-6"
                />
                {zoomDenom !== null && (
                    <DenominationZoomModal
                        isOpen
                        onClose={() => setZoomDenom(null)}
                        denomination={zoomDenom}
                        value={activeCounts[zoomDenom] || 0}
                        onValueChange={(v) => handleCountChange(zoomDenom, String(v))}
                        availableStock={
                            (type === 'out' && !isPurchaseMode) || (isPurchaseMode && purchaseTab === 'given')
                                ? availableStock[zoomDenom] || 0
                                : undefined
                        }
                    />
                )}

                <div className="min-h-0 space-y-1.5 p-2">
                    {!isTipPool && isPurchaseMode ? (
                        <div className="flex flex-col gap-2 px-1">
                            <div className="flex flex-col p-2 bg-white rounded-lg border border-zinc-200/50 shadow-sm">
                                <label className="mb-1 ml-1 block text-[8px] font-black uppercase tracking-widest text-gray-400">
                                    Concepto
                                </label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Motivo..."
                                    className="w-full border-none bg-transparent p-0 text-xs font-bold text-zinc-600 outline-none"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="col-span-3 flex flex-col gap-2 sm:col-span-1 sm:gap-1.5">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                                        <div className="flex min-h-10 flex-1 flex-col justify-center rounded-lg border border-orange-100 bg-orange-50/50 p-1.5 shadow-sm">
                                            <label className="mb-1 block text-center text-[8px] font-black uppercase tracking-widest text-orange-400 sm:ml-1 sm:text-left">
                                                Importe total
                                            </label>
                                            <div className="relative mx-auto flex max-w-[120px] flex-1 items-center justify-center sm:mx-0 sm:max-w-none sm:justify-start sm:pl-1">
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={purchasePrice}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setPurchasePrice(val === '' ? '' : parseFloat(val));
                                                    }}
                                                    placeholder="0.00"
                                                    className="min-h-10 w-full flex-1 min-w-0 border-none bg-transparent p-0 text-center text-sm font-black tabular-nums text-orange-600 outline-none focus:ring-0 sm:text-left"
                                                />
                                                <span className="pointer-events-none absolute right-0 text-[10px] font-black text-orange-400 opacity-50 sm:static sm:ml-0.5">
                                                    €
                                                </span>
                                            </div>
                                        </div>
                                        {showOutAutofill ? (
                                            <button
                                                type="button"
                                                onClick={() => void handleAutofillBreakdown()}
                                                disabled={autofillDisabled}
                                                aria-label="Autorrellenar desglose"
                                                className={cn(
                                                    'inline-flex min-h-10 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-[10px] font-black uppercase tracking-widest text-white transition-all active:scale-95 sm:w-auto',
                                                    autofillDisabled
                                                        ? 'cursor-not-allowed bg-[#36606F]/40 opacity-50'
                                                        : 'bg-[#36606F] shadow-sm hover:brightness-110',
                                                )}
                                            >
                                                {autofillLoading ? (
                                                    <Loader2 size={14} className="animate-spin" aria-hidden />
                                                ) : (
                                                    <Wand2 size={14} strokeWidth={2.5} aria-hidden />
                                                )}
                                                Autorrellenar
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setPurchaseTab('given')}
                                    className={cn(
                                        'flex flex-1 flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                        purchaseTab === 'given'
                                            ? 'scale-[1.02] border border-rose-100 bg-white text-rose-500 shadow-md'
                                            : 'border border-transparent bg-zinc-100 text-zinc-400 hover:text-zinc-600',
                                    )}
                                >
                                    <span className="text-[8px] uppercase tracking-widest opacity-80">Entregado</span>
                                    <span className="mt-0.5 text-xs">
                                        {totalGiven > 0.005 ? `${totalGiven.toFixed(2)}€` : ' '}
                                    </span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPurchaseTab('received')}
                                    className={cn(
                                        'flex flex-1 flex-col items-center justify-center rounded-lg py-1.5 text-[10px] font-black uppercase tracking-widest transition-all',
                                        purchaseTab === 'received'
                                            ? 'scale-[1.02] border border-emerald-100 bg-white text-emerald-500 shadow-md'
                                            : 'border border-transparent bg-zinc-100 text-zinc-400 hover:text-zinc-600',
                                    )}
                                >
                                    <span className="text-[8px] uppercase tracking-widest opacity-80">Cambio</span>
                                    <span className="mt-0.5 text-xs">
                                        {totalReceived > 0.005 ? `${totalReceived.toFixed(2)}€` : ' '}
                                    </span>
                                </button>
                            </div>
                        </div>
                    ) : !isTipPool && isOutSalidaLayout && !isPurchaseMode ? (
                        <div className="flex flex-col gap-2 px-1">
                            <div className="flex min-h-12 items-center gap-2">
                                <div className="flex min-h-10 min-w-0 flex-1 items-center">
                                    <input
                                        type="number"
                                        step="0.01"
                                        min="0"
                                        value={outTargetAmount}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setOutTargetAmount(val === '' ? '' : parseFloat(val));
                                        }}
                                        placeholder="0.00"
                                        aria-label="Importe total"
                                        className="min-h-10 w-full border-none bg-transparent p-0 text-center text-sm font-black tabular-nums text-zinc-800 outline-none focus:ring-0"
                                    />
                                    <span className="pointer-events-none shrink-0 text-[10px] font-black text-zinc-400">€</span>
                                </div>
                                {showOutAutofill ? (
                                    <button
                                        type="button"
                                        onClick={() => void handleAutofillBreakdown()}
                                        disabled={autofillDisabled}
                                        aria-label="Autorrellenar desglose"
                                        title="Autorrellenar"
                                        className={cn(
                                            'inline-flex h-10 w-10 min-h-10 min-w-10 shrink-0 items-center justify-center rounded-lg text-white transition-all active:scale-95',
                                            autofillDisabled
                                                ? 'cursor-not-allowed bg-[#36606F]/40 opacity-50'
                                                : 'bg-[#36606F] shadow-sm hover:brightness-110',
                                        )}
                                    >
                                        {autofillLoading ? (
                                            <Loader2 size={14} className="animate-spin" aria-hidden />
                                        ) : (
                                            <Wand2 size={14} strokeWidth={2.5} aria-hidden />
                                        )}
                                    </button>
                                ) : null}
                                {!isEditing && !forcePurchaseMode ? (
                                    <button
                                        type="button"
                                        onClick={() => setIsPurchaseMode(true)}
                                        className="shrink-0 text-[9px] font-black uppercase tracking-widest text-zinc-500"
                                    >
                                        Compra
                                    </button>
                                ) : null}
                            </div>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Concepto / motivo..."
                                aria-label="Concepto"
                                className="min-h-10 w-full border-none bg-transparent p-0 text-xs font-bold text-zinc-600 outline-none"
                            />
                        </div>
                    ) : !isTipPool && !isAudit ? (
                        <input
                            type="text"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Ej. Cambio banco, Pago proveedor..."
                            aria-label="Concepto"
                            className="min-h-10 w-full border-none bg-transparent p-0 text-xs font-bold text-zinc-600 outline-none"
                        />
                    ) : null}

                    {isPurchaseMode && !canSubmitPurchase && (purchasePrice || 0) > 0 ? (
                        <p className="px-1 text-center text-[10px] font-bold text-rose-500">
                            {totalGiven < (purchasePrice || 0)
                                ? `Falta ${Math.abs((purchasePrice || 0) - totalGiven) > 0.005 ? ((purchasePrice || 0) - totalGiven).toFixed(2) : ' '}€`
                                : `Da cambio: ${Math.abs(totalGiven - (purchasePrice || 0) - totalReceived) > 0.005 ? (totalGiven - (purchasePrice || 0) - totalReceived).toFixed(2) : ' '}€`}
                        </p>
                    ) : null}

                    <DenominationCountGrid
                        counts={activeCounts}
                        onAdjust={handleAdjust}
                        onChange={handleCountChange}
                        availableStock={showStock ? availableStock : undefined}
                        onZoom={setZoomDenom}
                        showAvailable={showStock}
                    />
                </div>
            </div>
        </form>
    );
};
