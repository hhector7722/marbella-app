'use client';

import { useState, useEffect } from 'react';
import { X, Save, ShoppingCart, Plus, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

export interface PaymentSourceOption {
    id: string;
    name: string;
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

const formatForInput = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

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
    const [changeDestinationBoxId, setChangeDestinationBoxId] = useState<string | null>(null);
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});
    const [expandedSourceId, setExpandedSourceId] = useState<string | null>(null);

    const cashSources = paymentSources.filter(s => s.hasInventory);
    const totalFromSources = sources.reduce((sum, s) => sum + s.amount, 0);
    const priceNum = price === '' ? 0 : price;
    const changeAmount = Math.max(0, totalFromSources - priceNum);
    const changeTotal = calculateTotal(changeBreakdown);
    const changeOk = changeAmount < 0.01 || Math.abs(changeTotal - changeAmount) < 0.01;

    const getSourceHasInventory = (id: string) => paymentSources.find(s => s.id === id)?.hasInventory ?? false;

    const setSourceBreakdown = (sourceId: string, breakdown: Record<number, number>) => {
        setSources(prev =>
            prev.map(s => s.sourceId === sourceId ? { ...s, breakdown } : s)
        );
    };

    const getSourceEntry = (sourceId: string): SourceEntry =>
        sources.find(s => s.sourceId === sourceId) ?? { sourceId, amount: 0, breakdown: {} };

    const addOrUpdateSource = (sourceId: string, amount: number) => {
        setSources(prev => {
            const idx = prev.findIndex(s => s.sourceId === sourceId);
            const entry: SourceEntry = { sourceId, amount, breakdown: idx >= 0 ? prev[idx].breakdown : {} };
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], amount };
                return next;
            }
            return [...prev, entry];
        });
    };

    const totalPaidFromCash = sources
        .filter(s => getSourceHasInventory(s.sourceId))
        .reduce((sum, s) => sum + s.amount, 0);
    const totalFromCashBreakdowns = sources
        .filter(s => getSourceHasInventory(s.sourceId))
        .reduce((sum, s) => sum + calculateTotal(s.breakdown), 0);
    const cashBreakdownsOk = totalPaidFromCash < 0.01 || Math.abs(totalFromCashBreakdowns - totalPaidFromCash) < 0.01;

    const canSubmit =
        priceNum > 0 &&
        totalFromSources >= priceNum - 0.01 &&
        cashBreakdownsOk &&
        (changeAmount < 0.01 || (changeOk && changeDestinationBoxId));

    const handleConfirm = () => {
        if (!canSubmit) return;
        onSubmit({
            price: priceNum,
            notes: notes || 'Compra',
            customDate: selectedDate ? new Date(selectedDate).toISOString() : undefined,
            sources,
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
                    <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Orígenes de pago</h4>
                    <p className="text-[9px] text-gray-400 mb-2">Indica cuánto pagas desde cada caja. Suma = precio (o más si hay cambio).</p>
                    <div className="space-y-2">
                        {paymentSources.map(src => {
                            const entry = getSourceEntry(src.id);
                            const isExpanded = expandedSourceId === src.id;
                            const stock = src.hasInventory ? (inventoriesByBoxId[src.id] ?? {}) : {};
                            const breakdownTotal = calculateTotal(entry.breakdown);
                            const amountMatch = Math.abs(entry.amount - breakdownTotal) < 0.01;
                            const needsBreakdown = src.hasInventory && entry.amount > 0.005;
                            const breakdownValid = !needsBreakdown || amountMatch;

                            return (
                                <div key={src.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                                    <div className="flex items-center justify-between p-2 gap-2">
                                        <span className="text-[10px] font-black text-zinc-700 truncate">{src.name}</span>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                value={entry.amount > 0 ? entry.amount : ''}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    const num = v === '' ? 0 : parseFloat(v);
                                                    addOrUpdateSource(src.id, num);
                                                }}
                                                placeholder="0"
                                                className="w-16 text-right bg-zinc-50 border border-zinc-200 rounded-lg px-2 py-1.5 text-[11px] font-black outline-none focus:ring-2 focus:ring-orange-200"
                                            />
                                            <span className="text-[10px] font-black text-zinc-400">€</span>
                                            {src.hasInventory && entry.amount > 0.005 && (
                                                <button
                                                    type="button"
                                                    onClick={() => setExpandedSourceId(isExpanded ? null : src.id)}
                                                    className="p-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center"
                                                    aria-label={isExpanded ? 'Cerrar desglose' : 'Desglose'}
                                                >
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {!breakdownValid && needsBreakdown && (
                                        <p className="text-[9px] text-rose-500 px-2 pb-1">Desglose debe sumar {entry.amount.toFixed(2)}€</p>
                                    )}
                                    {isExpanded && src.hasInventory && (
                                        <div className="p-2 pt-0 border-t border-zinc-100">
                                            <p className="text-[8px] font-black text-gray-400 uppercase mb-1.5">Desglose (billetes/monedas)</p>
                                            <div className="grid grid-cols-4 gap-1">
                                                {DENOMINATIONS.map(denom => {
                                                    const qty = entry.breakdown[denom] ?? 0;
                                                    const avail = stock[denom] ?? 0;
                                                    const over = qty > avail;
                                                    return (
                                                        <div key={denom} className="flex flex-col items-center gap-0.5">
                                                            <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={36} height={36} className="h-8 w-auto object-contain" />
                                                            <div className="flex items-center gap-0.5 w-full justify-center">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const next = { ...entry.breakdown, [denom]: Math.max(0, (entry.breakdown[denom] ?? 0) - 1) };
                                                                        if (next[denom] === 0) delete next[denom];
                                                                        setSourceBreakdown(src.id, next);
                                                                    }}
                                                                    className="w-6 h-7 flex items-center justify-center rounded bg-rose-50 text-rose-500"
                                                                >
                                                                    <Minus size={10} />
                                                                </button>
                                                                <input
                                                                    type="number"
                                                                    value={qty || ''}
                                                                    onChange={e => {
                                                                        const v = parseInt(e.target.value, 10) || 0;
                                                                        const next = { ...entry.breakdown, [denom]: v };
                                                                        if (v === 0) delete next[denom];
                                                                        setSourceBreakdown(src.id, next);
                                                                    }}
                                                                    className="w-8 h-7 text-center text-[10px] font-black rounded border border-zinc-200"
                                                                />
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setSourceBreakdown(src.id, { ...entry.breakdown, [denom]: (entry.breakdown[denom] ?? 0) + 1 })}
                                                                    className="w-6 h-7 flex items-center justify-center rounded bg-emerald-50 text-emerald-600"
                                                                >
                                                                    <Plus size={10} />
                                                                </button>
                                                            </div>
                                                            {avail > 0 && <span className={cn("text-[7px]", over && "text-rose-500")}>Disp: {avail}</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <p className="text-[9px] text-zinc-500 mt-1.5">Total orígenes: <span className="font-black">{totalFromSources > 0.005 ? totalFromSources.toFixed(2) : ' '} €</span></p>
                </div>

                {changeAmount >= 0.01 && (
                    <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 space-y-2">
                        <h4 className="text-[10px] font-black text-emerald-700 uppercase tracking-widest">Cambio: {changeAmount.toFixed(2)} €</h4>
                        <div>
                            <label className="block text-[8px] font-black text-gray-500 uppercase mb-1">Destino del cambio</label>
                            <select
                                value={changeDestinationBoxId ?? ''}
                                onChange={e => setChangeDestinationBoxId(e.target.value || null)}
                                className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black outline-none focus:ring-2 focus:ring-emerald-200"
                            >
                                <option value="">Elige caja</option>
                                {cashSources.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-[8px] font-black text-gray-500 uppercase mb-1.5">Desglose del cambio (opcional)</p>
                            <div className="grid grid-cols-4 gap-1">
                                {DENOMINATIONS.map(denom => {
                                    const qty = changeBreakdown[denom] ?? 0;
                                    return (
                                        <div key={denom} className="flex flex-col items-center gap-0.5">
                                            <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={32} height={32} className="h-7 w-auto object-contain" />
                                            <div className="flex items-center gap-0.5">
                                                <button
                                                    type="button"
                                                    onClick={() => setChangeBreakdown(prev => {
                                                        const next = { ...prev, [denom]: Math.max(0, (prev[denom] ?? 0) - 1) };
                                                        if (next[denom] === 0) delete next[denom];
                                                        return next;
                                                    })}
                                                    className="w-5 h-6 flex items-center justify-center rounded bg-rose-50 text-rose-500"
                                                >
                                                    <Minus size={8} />
                                                </button>
                                                <span className="w-6 text-center text-[10px] font-black">{qty}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setChangeBreakdown(prev => ({ ...prev, [denom]: (prev[denom] ?? 0) + 1 }))}
                                                    className="w-5 h-6 flex items-center justify-center rounded bg-emerald-50 text-emerald-600"
                                                >
                                                    <Plus size={8} />
                                                </button>
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
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95",
                        canSubmit ? "bg-orange-500 shadow-orange-200 hover:brightness-110" : "bg-zinc-300 opacity-50 cursor-not-allowed"
                    )}
                >
                    <Save size={16} strokeWidth={3} />
                    Guardar compra
                </button>
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-white bg-rose-500 font-black uppercase tracking-widest text-[9px] hover:bg-rose-600 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shadow-md shadow-rose-200"
                >
                    <X size={14} strokeWidth={3} />
                    Salir
                </button>
            </div>
        </div>
    );
}
