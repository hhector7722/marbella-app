'use client';

import { useMemo, useState } from 'react';
import { X, Save, Plus, Minus, ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';

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

type PurchaseStep = 'details' | 'payment' | 'change' | 'summary';

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

const nowStr = () => formatDateTimeLocalInput(new Date());

const calculateTotal = (c: Record<number, number>) =>
    DENOMINATIONS.reduce((acc, val) => acc + (val * (c[val] || 0)), 0);

export function PurchaseMultiSourceForm({
    paymentSources,
    inventoriesByBoxId,
    onSubmit,
    onCancel
}: PurchaseMultiSourceFormProps) {
    const [step, setStep] = useState<PurchaseStep>('details');
    const [price, setPrice] = useState<number | ''>('');
    const [notes, setNotes] = useState('');
    const [selectedDate, setSelectedDate] = useState(nowStr());
    const [sources, setSources] = useState<SourceEntry[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [changeDestinationBoxId, setChangeDestinationBoxId] = useState<string | null>(null);
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);
    const [zoomContext, setZoomContext] = useState<'change' | string | null>(null);

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

    const hasAnySourceInput = useMemo(() => totalFromSources >= 0.005, [totalFromSources]);

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

    const canGoPayment = priceNum > 0;
    const needsChangeStep = changeAmount >= 0.01;
    const canAdvanceFromPayment = priceNum > 0 && totalFromSources >= priceNum - 0.01;
    const canAdvanceFromChange = changeOk && !!changeDestinationBoxId;

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
            customDate: selectedDate ? parseDateTimeLocal(selectedDate).toISOString() : undefined,
            sources: sourcesPayload,
            changeAmount,
            changeDestinationBoxId: changeAmount >= 0.01 ? changeDestinationBoxId : null,
            changeBreakdown: changeAmount >= 0.01 ? changeBreakdown : {}
        });
    };

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white rounded-2xl relative">
            <div className="bg-[#36606F] px-4 py-2.5 flex flex-col gap-1 text-white shrink-0 relative">
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-black uppercase tracking-wider">Compra</h3>
                    <input
                        type="datetime-local"
                        value={selectedDate}
                        onChange={e => setSelectedDate(e.target.value)}
                        className="bg-transparent border-none p-0 text-white text-[10px] font-black uppercase tracking-widest outline-none text-center cursor-pointer [color-scheme:dark] min-h-[48px]"
                    />
                    <div className="flex items-center justify-end w-[120px] shrink-0">
                        {step === 'payment' && (
                            <div className="px-2 py-1 rounded-xl bg-white/10 border border-white/10 text-right min-h-[48px] flex flex-col items-end justify-center">
                                <span className="text-[8px] font-black uppercase tracking-widest text-white/80 leading-none">Total</span>
                                <span className="text-[12px] font-black tabular-nums text-white leading-none mt-0.5">
                                    {totalFromSources > 0.005 ? `${totalFromSources.toFixed(2)}€` : ' '}
                                </span>
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'details' ? 'text-white' : 'text-white/40')}>1. Datos</div>
                    <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'payment' ? 'text-white' : 'text-white/40')}>2. Pago</div>
                    <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'change' ? 'text-white' : 'text-white/40')}>3. Cambio</div>
                    <div className={cn("text-[10px] font-black uppercase tracking-widest transition-colors", step === 'summary' ? 'text-white' : 'text-white/40')}>4. Resumen</div>
                </div>
            </div>

            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {step === 'details' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                            <div className="flex flex-col p-2 bg-white rounded-xl border border-zinc-200/50 shadow-sm min-w-0">
                                <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1">Concepto</label>
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Motivo..."
                                    className="w-full bg-transparent border-none p-0 text-zinc-600 font-bold outline-none text-xs min-h-[48px]"
                                />
                            </div>
                            <div className="flex flex-col p-2 bg-orange-50/50 rounded-xl border border-orange-100 shadow-sm w-[120px] shrink-0">
                                <label className="block text-[8px] font-black text-orange-400 uppercase tracking-widest mb-1 ml-1">Precio (€)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={price}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setPrice(val === '' ? '' : parseFloat(val));
                                    }}
                                    placeholder="0.00"
                                    className="w-full bg-transparent border-none p-0 text-orange-600 text-sm font-black outline-none text-center min-h-[48px]"
                                />
                            </div>
                        </div>

                        {priceNum <= 0 && (
                            <div className="bg-white rounded-2xl border border-rose-100 shadow-sm p-3">
                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Falta precio</p>
                            </div>
                        )}
                    </div>
                )}

                {step === 'payment' && (
                    <>
                        <div className="relative">
                            <h4 className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1.5">Origen de pago</h4>
                            <div className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 items-stretch">
                                {paymentSources.map(src => {
                                    const amount = getDisplayAmount(src);
                                    const isSelected = selectedSourceId === src.id;
                                    return (
                                        <button
                                            key={src.id}
                                            type="button"
                                            onClick={() => setSelectedSourceId(src.id)}
                                            className={cn(
                                                "min-h-[48px] min-w-0 px-2 py-1.5 rounded-lg border-2 font-black text-[8px] uppercase tracking-tight transition-all flex flex-col items-center justify-center gap-0 shrink-0",
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
                        </div>

                {zoomDenom !== null && zoomContext !== null && (
                    <DenominationZoomModal
                        isOpen={true}
                        onClose={() => { setZoomDenom(null); setZoomContext(null); }}
                        denomination={zoomDenom}
                        value={zoomContext === 'change' ? (changeBreakdown[zoomDenom] ?? 0) : (getSourceEntry(zoomContext).breakdown[zoomDenom] ?? 0)}
                        onValueChange={(v) => {
                            if (zoomContext === 'change') {
                                setChangeBreakdown(prev => {
                                    const next = { ...prev, [zoomDenom]: v };
                                    if (v === 0) delete next[zoomDenom];
                                    return next;
                                });
                            } else {
                                const entry = getSourceEntry(zoomContext).breakdown;
                                const next = { ...entry, [zoomDenom]: v };
                                if (v === 0) delete next[zoomDenom];
                                setSourceBreakdown(zoomContext, next);
                            }
                        }}
                        availableStock={zoomContext !== 'change' ? (inventoriesByBoxId[zoomContext]?.[zoomDenom] ?? 0) : undefined}
                    />
                )}
                {selectedSource && (
                    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-3">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">
                                Desglose desde {selectedSource.shortLabel}
                            </p>
                            <div className="text-right shrink-0">
                                <div className="text-[8px] font-black uppercase tracking-widest text-zinc-400 leading-none">Total</div>
                                <div className="text-[12px] font-black tabular-nums text-zinc-800 leading-none mt-0.5">
                                    {totalFromSources > 0.005 ? `${totalFromSources.toFixed(2)}€` : ' '}
                                </div>
                            </div>
                        </div>
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
                                            <div
                                                role="button"
                                                tabIndex={0}
                                                onClick={() => { setZoomDenom(denom); setZoomContext(selectedSource.id); }}
                                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setZoomDenom(denom); setZoomContext(selectedSource.id); } }}
                                                className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110 cursor-pointer rounded-lg hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]/40 focus:ring-offset-1 min-h-[48px]"
                                                aria-label={`Editar cantidad de ${denom >= 1 ? `${denom} euros` : `${(denom * 100).toFixed(0)} céntimos`}`}
                                            >
                                                <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg pointer-events-none" />
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
                                    className="w-full max-w-[140px] min-h-[48px] h-12 rounded-xl border-2 border-zinc-200 px-3 text-sm font-black outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400"
                                />
                            </div>
                        )}
                    </div>
                )}

                    </>
                )}

                {step === 'change' && (
                    <>
                        {changeAmount < 0.01 ? (
                            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sin cambio</p>
                            </div>
                        ) : (
                            <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4 space-y-3">
                                <div className="flex items-center justify-between gap-3">
                                    <h4 className="text-[10px] font-black text-emerald-800 uppercase tracking-widest">Cambio</h4>
                                    <div className="text-right">
                                        <div className="text-[8px] font-black uppercase tracking-widest text-emerald-700/70 leading-none">A devolver</div>
                                        <div className="text-2xl font-black tabular-nums text-emerald-800 leading-none mt-0.5">
                                            {changeAmount.toFixed(2)}€
                                        </div>
                                    </div>
                                </div>

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
                                    {!changeDestinationBoxId && (
                                        <p className="text-[9px] font-black text-rose-600 mt-1 uppercase tracking-widest">Falta destino</p>
                                    )}
                                </div>

                                <div>
                                    <p className="text-[8px] font-black text-gray-500 uppercase mb-1.5">Desglose del cambio</p>
                                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                                        {DENOMINATIONS.map(denom => {
                                            const qty = changeBreakdown[denom] ?? 0;
                                            return (
                                                <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                                                    <div
                                                        role="button"
                                                        tabIndex={0}
                                                        onClick={() => { setZoomDenom(denom); setZoomContext('change'); }}
                                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setZoomDenom(denom); setZoomContext('change'); } }}
                                                        className="w-full h-11 sm:h-14 flex items-center justify-center transition-transform group-hover:scale-110 cursor-pointer rounded-lg hover:bg-white/60 focus:outline-none focus:ring-2 focus:ring-[#5B8FB9]/40 focus:ring-offset-1 min-h-[48px]"
                                                        aria-label={`Editar cantidad de ${denom >= 1 ? `${denom} euros` : `${(denom * 100).toFixed(0)} céntimos`}`}
                                                    >
                                                        <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg pointer-events-none" />
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
                                    {!changeOk && (
                                        <p className="text-[9px] font-black text-rose-600 mt-1 uppercase tracking-widest">
                                            El desglose debe sumar {changeAmount.toFixed(2)}€
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}

                {step === 'summary' && (
                    <div className="space-y-4 animate-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Concepto</p>
                                    <p className="text-base font-black text-zinc-900 truncate">{(notes || 'Compra').trim() || 'Compra'}</p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Fecha</p>
                                    <p className="text-[10px] font-black text-zinc-700 uppercase tracking-widest">{selectedDate ? selectedDate.replace('T', ' ') : ' '}</p>
                                </div>
                            </div>

                            <div className="mt-4 rounded-2xl border border-zinc-200 overflow-hidden">
                                <div className="px-4 py-3 bg-white flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Precio</span>
                                    <span className="text-xl font-black tabular-nums text-zinc-900">{priceNum > 0 ? `${priceNum.toFixed(2)}€` : ' '}</span>
                                </div>
                                <div className="px-4 py-3 bg-rose-50/60 border-t border-zinc-200 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-rose-500">Entregado</span>
                                    <span className="text-xl font-black tabular-nums text-rose-700">{hasAnySourceInput ? `${totalFromSources.toFixed(2)}€` : ' '}</span>
                                </div>
                                <div className="px-4 py-3 bg-emerald-50/70 border-t border-zinc-200 flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Cambio</span>
                                    <span className="text-xl font-black tabular-nums text-emerald-800">{changeAmount >= 0.01 ? `${changeAmount.toFixed(2)}€` : ' '}</span>
                                </div>
                            </div>

                            {changeAmount >= 0.01 && (
                                <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Destino del cambio</span>
                                        <span className="text-[11px] font-black text-emerald-900">
                                            {changeDestinationBoxId
                                                ? (paymentSources.find(s => s.id === changeDestinationBoxId)?.shortLabel ?? 'Caja')
                                                : ' '}
                                        </span>
                                    </div>
                                    {!changeOk && (
                                        <p className="text-[9px] font-black text-rose-600 mt-1 uppercase tracking-widest">
                                            El desglose del cambio no cuadra
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            <div className="flex p-3 bg-white border-t gap-2 shrink-0">
                <button
                    type="button"
                    onClick={() => {
                        if (step === 'details') onCancel();
                        else if (step === 'payment') setStep('details');
                        else if (step === 'change') setStep('payment');
                        else {
                            if (needsChangeStep) setStep('change');
                            else setStep('payment');
                        }
                    }}
                    className={cn(
                        "flex-1 py-3 font-black uppercase tracking-widest text-[9px] rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1 shadow-md min-h-[48px]",
                        step === 'details'
                            ? "text-white bg-rose-500 hover:bg-rose-600 shadow-rose-200"
                            : "text-gray-500 bg-zinc-100 hover:bg-zinc-200 shadow-zinc-200/40"
                    )}
                >
                    {step === 'details' ? <X size={14} strokeWidth={3} /> : <ArrowLeft size={14} strokeWidth={3} />}
                    {step === 'details' ? 'Salir' : 'Atrás'}
                </button>
                <button
                    type="button"
                    onClick={() => {
                        if (step === 'details') setStep('payment');
                        else if (step === 'payment') {
                            if (needsChangeStep) setStep('change');
                            else setStep('summary');
                        } else if (step === 'change') setStep('summary');
                        else handleConfirm();
                    }}
                    disabled={
                        (step === 'details' && !canGoPayment) ||
                        (step === 'payment' && !canAdvanceFromPayment) ||
                        (step === 'change' && needsChangeStep && !canAdvanceFromChange) ||
                        (step === 'summary' && !canSubmit)
                    }
                    className={cn(
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95 min-h-[48px]",
                        ((step === 'details' && canGoPayment) ||
                            (step === 'payment' && canAdvanceFromPayment) ||
                            (step === 'change' && (!needsChangeStep || canAdvanceFromChange)) ||
                            (step === 'summary' && canSubmit))
                            ? (step === 'summary' ? "bg-orange-500 shadow-orange-200 hover:brightness-110" : "bg-[#5B8FB9] shadow-blue-900/20 hover:brightness-110")
                            : "bg-zinc-300 opacity-50 cursor-not-allowed"
                    )}
                >
                    {step === 'summary' ? <Save size={16} strokeWidth={3} /> : <ArrowRight size={16} strokeWidth={3} />}
                    {step === 'summary' ? 'Guardar compra' : 'Siguiente'}
                </button>
            </div>
        </div>
    );
}
