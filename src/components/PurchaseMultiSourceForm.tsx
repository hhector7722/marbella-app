'use client';

import { useState } from 'react';
import { X, Save, ShoppingCart, Plus, Minus } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

export interface PaymentSourceOption {
    id: string;
    name: string;
    shortLabel: string;
    hasInventory: boolean;
}

export interface SourceEntry {
    sourceId: string;
    amount: number;
    breakdown: Record<number, number>;
}

export interface PurchaseMultiSourcePayload {
    price: number;
    notes: string;
    customDate?: string;
    sources: SourceEntry[];
    changeAmount: number;
    changeDestinationBoxId: string | null;
    changeBreakdown: Record<number, number>;
}

interface PurchaseMultiSourceFormProps {
    paymentSources: PaymentSourceOption[];
    inventoriesByBoxId: Record<string, Record<number, number>>;
    onSubmit: (payload: PurchaseMultiSourcePayload) => void;
    onCancel: () => void;
}

const nowStr = () => new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const calculateTotal = (c: Record<number, number>) =>
    DENOMINATIONS.reduce((acc, val) => acc + (val * (c[val] || 0)), 0);

export function PurchaseMultiSourceForm({
    paymentSources,
    inventoriesByBoxId,
    onSubmit,
    onCancel
}: PurchaseMultiSourceFormProps) {
    const [price, setPrice] = useState<number | ''>('');
    const [notes, setNotes] = useState('');
    const [selectedDate, setSelectedDate] = useState(nowStr());
    const [sources, setSources] = useState<SourceEntry[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [changeDestinationBoxId, setChangeDestinationBoxId] = useState<string | null>(null);
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});

    const cashSources = paymentSources.filter(s => s.hasInventory);
    const selectedSource = selectedSourceId ? paymentSources.find(s => s.id === selectedSourceId) : null;

    const getSourceEntry = (sourceId: string): SourceEntry =>
        sources.find(s => s.sourceId === sourceId) ?? { sourceId, amount: 0, breakdown: {} };

    const getDisplayAmount = (src: PaymentSourceOption): number => {
        const entry = getSourceEntry(src.id);
        if (src.hasInventory) return calculateTotal(entry.breakdown);
        return entry.amount;
    };

    const totalFromSources = paymentSources.reduce((sum, src) => sum + getDisplayAmount(src), 0);
    const priceNum = price === '' ? 0 : price;
    const changeAmount = Math.max(0, totalFromSources - priceNum);
    const changeTotal = calculateTotal(changeBreakdown);
    const changeOk = changeAmount < 0.01 || Math.abs(changeTotal - changeAmount) < 0.01;

    const setSourceBreakdown = (sourceId: string, breakdown: Record<number, number>) => {
        setSources(prev => {
            const idx = prev.findIndex(s => s.sourceId === sourceId);
            const next = idx >= 0 ? prev.map(s => s.sourceId === sourceId ? { ...s, breakdown } : s) : [...prev, { sourceId, amount: 0, breakdown }];
            return next;
        });
    };

    const setSourceTpvAmount = (sourceId: string, amount: number) => {
        setSources(prev => {
            const idx = prev.findIndex(s => s.sourceId === sourceId);
            const entry = { sourceId, amount, breakdown: {} as Record<number, number> };
            if (idx >= 0) return prev.map(s => s.sourceId === sourceId ? { ...s, amount } : s);
            return [...prev, entry];
        });
    };

    const canSubmit =
        priceNum > 0 &&
        totalFromSources >= priceNum - 0.01 &&
        (changeAmount < 0.01 || (changeOk && changeDestinationBoxId));

    const buildSourcesForPayload = (): SourceEntry[] => {
        return paymentSources.map(src => {
            const entry = getSourceEntry(src.id);
            const amount = src.hasInventory ? calculateTotal(entry.breakdown) : entry.amount;
            return { sourceId: src.id, amount, breakdown: entry.breakdown };
        }).filter(s => s.amount >= 0.005);
    };

    const handleConfirm = () => {
        if (!canSubmit) return;
        const sourcesPayload = buildSourcesForPayload();
        onSubmit({
            price: priceNum,
            notes: notes || 'Compra',
            customDate: selectedDate ? new Date(selectedDate).toISOString() : undefined,
            sources: sourcesPayload,
            changeAmount,
            changeDestinationBoxId: changeAmount >= 0.01 ? changeDestinationBoxId : null,
            changeBreakdown: changeAmount >= 0.01 ? changeBreakdown : {}
        });
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white rounded-2xl">
            <div className="bg-[#36606F] px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg bg-orange-500">
                        <ShoppingCart size={20} className="text-white" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black uppercase tracking-wider">Compra</h3>
                        <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">Varias cajas</p>
                    </div>
                </div>
                <div className="text-right">
                    <span className="block text-[8px] uppercase tracking-widest opacity-50 font-black">Total a pagar</span>
                    <span className="text-xl font-black tabular-nums">{priceNum > 0.005 ? priceNum.toFixed(2) : ' '} €</span>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col justify-center bg-blue-500 p-2 rounded-xl border border-white/10 shadow-sm">
                        <input
                            type="datetime-local"
                            value={selectedDate}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-white text-[10px] font-black uppercase tracking-widest outline-none text-center"
                        />
                    </div>
                    <div className="flex flex-col p-2 bg-white rounded-xl border border-zinc-200/50 shadow-sm">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Concepto</label>
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Motivo..."
                            className="w-full bg-transparent border-none p-0 text-zinc-600 font-bold outline-none text-xs"
                        />
                    </div>
                </div>

                <div className="flex flex-col p-1.5 bg-orange-50/50 rounded-xl border border-orange-100 shadow-sm">
                    <label className="block text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1 text-center">Precio (€)</label>
                    <input
                        type="number"
                        step="0.01"
                        value={price}
                        onChange={e => {
                            const val = e.target.value;
                            setPrice(val === '' ? '' : parseFloat(val));
                        }}
                        placeholder="0.00"
                        className="w-full bg-transparent border-none p-0 text-orange-600 text-sm font-black outline-none text-center"
                    />
                </div>

                <div>
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Origen de pago</h4>
                    <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5">
                        {paymentSources.map(src => {
                            const amount = getDisplayAmount(src);
                            const isSelected = selectedSourceId === src.id;
                            return (
                                <button
                                    key={src.id}
                                    type="button"
                                    onClick={() => setSelectedSourceId(src.id)}
                                    className={cn(
                                        "min-h-[40px] min-w-0 px-2 py-1.5 rounded-lg border-2 font-black text-[8px] uppercase tracking-tight transition-all flex flex-col items-center justify-center gap-0 shrink-0",
                                        isSelected
                                            ? "bg-orange-500 border-orange-500 text-white shadow-md"
                                            : "bg-white border-zinc-200 text-zinc-700 hover:border-orange-300 hover:bg-orange-50"
                                    )}
                                >
                                    <span className="whitespace-nowrap">{src.shortLabel}</span>
                                    {amount > 0.005 && (
                                        <span className={cn("text-[7px] tabular-nums leading-none", isSelected ? "text-white/90" : "text-zinc-500")}>
                                            {amount.toFixed(2)}€
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1">Total: <span className="font-black">{totalFromSources > 0.005 ? totalFromSources.toFixed(2) : ' '} €</span></p>
                </div>

                {selectedSource && (
                    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            Desglose desde {selectedSource.shortLabel}
                        </p>
                        {selectedSource.hasInventory ? (
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                                {DENOMINATIONS.map(denom => {
                                    const entry = getSourceEntry(selectedSource.id);
                                    const qty = entry.breakdown[denom] ?? 0;
                                    const stock = inventoriesByBoxId[selectedSource.id] ?? {};
                                    const avail = stock[denom] ?? 0;
                                    const hasStockIssue = qty > avail;
                                    return (
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
                                                        onClick={() => {
                                                            const next = { ...entry.breakdown, [denom]: Math.max(0, (entry.breakdown[denom] ?? 0) - 1) };
                                                            if (next[denom] === 0) delete next[denom];
                                                            setSourceBreakdown(selectedSource.id, next);
                                                        }}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={qty || ''}
                                                        onChange={e => {
                                                            const v = parseInt(e.target.value, 10) || 0;
                                                            const next = { ...entry.breakdown, [denom]: v };
                                                            if (v === 0) delete next[denom];
                                                            setSourceBreakdown(selectedSource.id, next);
                                                        }}
                                                        placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setSourceBreakdown(selectedSource.id, { ...entry.breakdown, [denom]: (entry.breakdown[denom] ?? 0) + 1 })}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                                {avail > 0 && (
                                                    <span className="text-[7px] font-bold text-gray-400 uppercase mt-1 block">Disp: {avail}</span>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-1">
                                <label className="text-[8px] font-black text-gray-500 uppercase">Importe (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={getSourceEntry(selectedSource.id).amount > 0 ? getSourceEntry(selectedSource.id).amount : ''}
                                    onChange={e => {
                                        const v = e.target.value;
                                        setSourceTpvAmount(selectedSource.id, v === '' ? 0 : parseFloat(v));
                                    }}
                                    placeholder="0.00"
                                    className="w-full max-w-[120px] h-11 rounded-xl border-2 border-zinc-200 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                />
                            </div>
                        )}
                    </div>
                )}

                {changeAmount >= 0.01 && (
                    <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 space-y-2">
                        <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Cambio: {changeAmount.toFixed(2)} €</h4>
                        <div>
                            <label className="block text-[8px] font-black text-gray-500 uppercase mb-1">Destino del cambio</label>
                            <select
                                value={changeDestinationBoxId ?? ''}
                                onChange={e => setChangeDestinationBoxId(e.target.value || null)}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black outline-none focus:ring-2 focus:ring-emerald-200 min-h-[48px]"
                            >
                                <option value="">Elige caja</option>
                                {cashSources.map(s => (
                                    <option key={s.id} value={s.id}>{s.shortLabel}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-gray-500 uppercase mb-1.5">Desglose del cambio (opcional)</p>
                            <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                                {DENOMINATIONS.map(denom => {
                                    const qty = changeBreakdown[denom] ?? 0;
                                    return (
                                        <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                                            <div className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110">
                                                <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg" />
                                            </div>
                                            <div className="text-center w-full">
                                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                                                    {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                                </span>
                                                <div className="flex items-center justify-between w-full h-10 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                                                    <button
                                                        type="button"
                                                        onClick={() => setChangeBreakdown(prev => {
                                                            const next = { ...prev, [denom]: Math.max(0, (prev[denom] ?? 0) - 1) };
                                                            if (next[denom] === 0) delete next[denom];
                                                            return next;
                                                        })}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        value={qty || ''}
                                                        onChange={e => {
                                                            const v = parseInt(e.target.value, 10) || 0;
                                                            setChangeBreakdown(prev => {
                                                                const next = { ...prev, [denom]: v };
                                                                if (v === 0) delete next[denom];
                                                                return next;
                                                            });
                                                        }}
                                                        placeholder=""
                                                        className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setChangeBreakdown(prev => ({ ...prev, [denom]: (prev[denom] ?? 0) + 1 }))}
                                                        className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                            {!changeOk && <p className="text-[9px] text-rose-500 mt-1">El desglose debe sumar {changeAmount.toFixed(2)}€</p>}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex p-3 bg-white border-t gap-2 shrink-0">
                <button
                    onClick={handleConfirm}
                    disabled={!canSubmit}
                    className={cn(
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 min-h-[48px]",
                        canSubmit ? "bg-orange-500 shadow-orange-200 hover:brightness-110" : "bg-zinc-300 opacity-50 cursor-not-allowed"
                    )}
                >
                    <Save size={16} strokeWidth={3} />
                    Guardar compra
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-white bg-rose-500 font-black uppercase tracking-widest text-[9px] hover:bg-rose-600 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shadow-md shadow-rose-200 min-h-[48px]"
                >
                    <X size={14} strokeWidth={3} />
                    Salir
                </button>
            </div>
        </div>
    );
}
