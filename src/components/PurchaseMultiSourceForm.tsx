'use client';

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { DENOMINATIONS } from '@/lib/constants';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';
import { ScannerClient } from '@/app/dashboard/scanner/ScannerClient';
import { ClosingPetrolInput, ClosingStepRow } from '@/components/cash-closing/ClosingStep1Parts';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { formatCashCountDateInput } from '@/components/cash/CashCountDateButton';

export interface PaymentSourceOption {
    id: string;
    name: string;
    shortLabel: string;
    hasInventory: boolean;
    image_url?: string;
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
    /** Host Modal aporta título/cierre; oculta cabecera petróleo duplicada. */
    embedded?: boolean;
    selectedDate?: string;
    onSelectedDateChange?: (next: string) => void;
}

type PurchaseStep = 'details' | 'payment' | 'change' | 'scanner' | 'summary';

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

const nowStr = () => formatCashCountDateInput();

const calculateTotal = (c: Record<number, number>) =>
    DENOMINATIONS.reduce((acc, val) => acc + (val * (c[val] || 0)), 0);

export function PurchaseMultiSourceForm({
    paymentSources,
    inventoriesByBoxId,
    onSubmit,
    onCancel,
    embedded = false,
    selectedDate: selectedDateProp,
    onSelectedDateChange,
}: PurchaseMultiSourceFormProps) {
    const [step, setStep] = useState<PurchaseStep>('details');
    const [price, setPrice] = useState<number | ''>('');
    const [notes, setNotes] = useState('');
    const [internalDate, setInternalDate] = useState(nowStr());
    const selectedDate = selectedDateProp ?? internalDate;
    const setSelectedDate = onSelectedDateChange ?? setInternalDate;
    const [sources, setSources] = useState<SourceEntry[]>([]);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [changeDestinationBoxId, setChangeDestinationBoxId] = useState<string | null>(null);
    const [changeDestinationTouched, setChangeDestinationTouched] = useState(false);
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});
    const [scannerCompleted, setScannerCompleted] = useState(false);
    const [scannerInvoiceId, setScannerInvoiceId] = useState<string | null>(null);
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
    const canAdvanceFromScanner = scannerCompleted;

    const computeDefaultChangeDestination = (): string | null => {
        const activeCash = paymentSources
            .filter(s => s.hasInventory)
            .map(s => ({ id: s.id, amount: getDisplayAmount(s) }))
            .filter(s => s.amount >= 0.005);
        if (activeCash.length === 0) return null;
        if (activeCash.length === 1) return activeCash[0]!.id;
        return activeCash.reduce((best, cur) => (cur.amount > best.amount ? cur : best)).id;
    };

    const goToChangeStep = () => {
        if (!changeDestinationTouched) {
            setChangeDestinationBoxId(computeDefaultChangeDestination());
        }
        setStep('change');
    };

    const goToScannerStep = () => setStep('scanner');

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

    const footerTotal =
        step === 'payment' ? totalFromSources
        : step === 'change' ? changeTotal
        : priceNum;

    const handleFooterBack = () => {
        if (step === 'details') onCancel();
        else if (step === 'payment') setStep('details');
        else if (step === 'change') setStep('payment');
        else if (step === 'scanner') {
            if (needsChangeStep) goToChangeStep();
            else setStep('payment');
        }
        else if (step === 'summary') goToScannerStep();
    };

    const handleFooterAdvance = () => {
        if (step === 'details') setStep('payment');
        else if (step === 'payment') {
            if (needsChangeStep) goToChangeStep();
            else goToScannerStep();
        } else if (step === 'change') goToScannerStep();
        else if (step === 'scanner') setStep('summary');
        else handleConfirm();
    };

    const footerAdvanceDisabled =
        (step === 'details' && !canGoPayment) ||
        (step === 'payment' && !canAdvanceFromPayment) ||
        (step === 'change' && needsChangeStep && !canAdvanceFromChange) ||
        (step === 'scanner' && !canAdvanceFromScanner) ||
        (step === 'summary' && !canSubmit);

    return (
        <div className={cn(
            'relative flex flex-col h-full overflow-hidden bg-white',
            !embedded && 'rounded-2xl',
        )}>
            {!embedded ? (
            <div className="bg-[#36606F] px-4 py-2.5 flex items-center justify-between text-white shrink-0 relative">
                <h3 className="text-lg font-black uppercase tracking-wider">Compra</h3>
                <input
                    type="datetime-local"
                    value={selectedDate}
                    onChange={e => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none p-0 text-white text-[10px] font-black uppercase tracking-widest outline-none text-center cursor-pointer [color-scheme:dark] min-h-[48px]"
                />
            </div>
            ) : null}

            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
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
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {step === 'details' && (
                    <div className="space-y-5 p-4 sm:p-6 bg-white">
                        <ClosingStepRow title="Concepto">
                            <div className="relative flex h-9 w-full items-center rounded-xl border border-[#36606F] bg-white transition-colors focus-within:bg-[#36606F]/5">
                                <input
                                    type="text"
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    placeholder="Motivo..."
                                    className="h-full w-full bg-transparent px-2 text-center text-sm font-black text-zinc-800 outline-none placeholder:font-bold placeholder:text-zinc-400"
                                />
                            </div>
                        </ClosingStepRow>

                        <ClosingStepRow title="Precio">
                            <ClosingPetrolInput
                                value={price === '' ? 0 : price}
                                onChange={(next) => setPrice(next)}
                                showEuro
                            />
                        </ClosingStepRow>

                        {priceNum <= 0 && (
                            <p className="text-center text-[10px] font-black uppercase tracking-widest text-rose-600">
                                Falta precio
                            </p>
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

                {selectedSource && (
                    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-3">
                        <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-2">
                            Desglose desde {selectedSource.shortLabel}
                        </p>
                        {selectedSource.hasInventory ? (
                            <DenominationCountGrid
                                counts={getSourceEntry(selectedSource.id).breakdown}
                                onAdjust={(denom, delta) => {
                                    const entry = getSourceEntry(selectedSource.id);
                                    const next = { ...entry.breakdown, [denom]: Math.max(0, (entry.breakdown[denom] ?? 0) + delta) };
                                    if (next[denom] === 0) delete next[denom];
                                    setSourceBreakdown(selectedSource.id, next);
                                }}
                                onChange={(denom, raw) => {
                                    const v = parseInt(raw, 10) || 0;
                                    const next = { ...getSourceEntry(selectedSource.id).breakdown, [denom]: v };
                                    if (v === 0) delete next[denom];
                                    setSourceBreakdown(selectedSource.id, next);
                                }}
                                availableStock={inventoriesByBoxId[selectedSource.id]}
                                onZoom={(denom) => { setZoomDenom(denom); setZoomContext(selectedSource.id); }}
                                showAvailable
                            />
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
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Sin cambio</p>
                        ) : (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[8px] font-black text-gray-500 uppercase mb-1">Destino del cambio</label>
                                    <select
                                        value={changeDestinationBoxId ?? ''}
                                        onChange={e => {
                                            setChangeDestinationTouched(true);
                                            setChangeDestinationBoxId(e.target.value || null);
                                        }}
                                        className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[11px] font-black outline-none focus:ring-2 focus:ring-[#5B8FB9]/30 min-h-[48px]"
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
                                    <DenominationCountGrid
                                        counts={changeBreakdown}
                                        onAdjust={(denom, delta) => setChangeBreakdown(prev => {
                                            const next = { ...prev, [denom]: Math.max(0, (prev[denom] ?? 0) + delta) };
                                            if (next[denom] === 0) delete next[denom];
                                            return next;
                                        })}
                                        onChange={(denom, raw) => {
                                            const v = parseInt(raw, 10) || 0;
                                            setChangeBreakdown(prev => {
                                                const next = { ...prev, [denom]: v };
                                                if (v === 0) delete next[denom];
                                                return next;
                                            });
                                        }}
                                        onZoom={(denom) => { setZoomDenom(denom); setZoomContext('change'); }}
                                    />
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

                {step === 'scanner' && (
                    <div className="space-y-3">
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                            Escanea el albarán de la compra
                        </p>
                        {scannerCompleted ? (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3">
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">
                                    Albarán registrado correctamente
                                </p>
                                {scannerInvoiceId ? (
                                    <p className="text-[9px] font-bold text-emerald-700/80 mt-1">
                                        Guardado en Albaranes · puedes continuar al resumen
                                    </p>
                                ) : null}
                            </div>
                        ) : null}
                        <ScannerClient
                            embedded
                            onInvoiceSaved={(invoiceId) => {
                                setScannerInvoiceId(invoiceId);
                                setScannerCompleted(true);
                            }}
                        />
                    </div>
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

                            {scannerCompleted && (
                                <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Albarán escaneado</span>
                                        <span className="text-[11px] font-black text-zinc-800">Sí</span>
                                    </div>
                                </div>
                            )}

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

            <div className="shrink-0 border-t border-ds-borde bg-ds-superficie py-ds-3 px-1">
                <CashCountFooter
                    total={footerTotal}
                    instancePrefix="purchase-multi-source"
                    cancelLabel={step === 'details' ? 'Salir' : 'Atrás'}
                    saveLabel={step === 'summary' ? 'Guardar compra' : 'Siguiente'}
                    onCancel={handleFooterBack}
                    onSave={handleFooterAdvance}
                    saveDisabled={footerAdvanceDisabled}
                    extra={
                        step === 'change' && changeAmount >= 0.01 ? (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">A devolver</span>
                                <span className="text-sm font-bold tabular-nums text-zinc-500">{changeAmount.toFixed(2)}€</span>
                            </div>
                        ) : null
                    }
                />
            </div>
        </div>
    );
}
