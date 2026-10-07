'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { DENOMINATIONS } from '@/lib/constants';
import { QuickCashTools } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';
import { ScannerClient, type ScannerClientHandle } from '@/app/dashboard/scanner/ScannerClient';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { formatCashCountDateInput } from '@/components/cash/CashCountDateButton';

export interface PaymentSourceOption {
    id: string;
    name: string;
    shortLabel: string;
    hasInventory: boolean;
    /** `cash` = caja con stock (inicial/cambio). `tpv` = caja del terminal. */
    kind?: 'cash' | 'tpv';
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
    /** Host Modal aporta título/cierre. */
    embedded?: boolean;
    selectedDate?: string;
    onSelectedDateChange?: (next: string) => void;
    /** Identidad del Modal padre, para la superficie derivada del desglose. */
    parentInstance?: string;
}

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

/** Imagen de la caja: la configurada; si no, el asset por defecto de su tipo. */
function resolveBoxImage(source: PaymentSourceOption): string {
    if (source.image_url) return source.image_url;
    if (source.kind === 'tpv') return '/icons/tpv.png';
    const label = `${source.name} ${source.shortLabel}`.toLowerCase();
    if (label.includes('cambio 2') || label.includes('cambio2')) return '/icons/cambio-2.png';
    if (label.includes('cambio 1') || label.includes('cambio1')) return '/icons/cambio-1.png';
    return '/icons/inicial.png';
}

/**
 * Fila de dos columnas del formulario de compra: concepto a la izquierda
 * (tinta blanca sobre el modal) y caja de texto blanca a la derecha.
 */
function PurchaseFieldRow({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="grid grid-cols-[6rem_1fr] items-center gap-x-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/85">{title}</span>
            <div className="flex min-w-0 items-center justify-center">{children}</div>
        </div>
    );
}

/** Tarjeta de caja: icono con su nombre debajo. Pulsarla abre su desglose. */
function BoxCard({
    source,
    amount,
    selected,
    onClick,
}: {
    source: PaymentSourceOption;
    amount: number;
    selected: boolean;
    onClick: () => void;
}) {
    const hasAmount = amount > 0.005;
    return (
        <button
            type="button"
            data-design-exception="native-business-button:seleccion-de-caja-compra"
            onClick={onClick}
            aria-pressed={selected}
            className={cn(
                'relative flex min-h-ds-tactil flex-col items-center justify-start gap-1 rounded-xl p-1.5 transition-all',
                selected ? 'bg-white/20 ring-2 ring-white/80' : 'bg-white/5 hover:bg-white/10'
            )}
        >
            {hasAmount ? (
                <span className="absolute -right-1 -top-1 z-10 rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black tabular-nums leading-none text-white shadow">
                    {amount.toFixed(2)}€
                </span>
            ) : null}
            <span className="flex h-11 w-11 items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={resolveBoxImage(source)}
                    alt=""
                    className="h-full w-full rounded-lg object-contain"
                />
            </span>
            <span className="w-full truncate text-center text-[10px] font-black uppercase tracking-tight leading-none text-white">
                {source.shortLabel}
            </span>
        </button>
    );
}

export function PurchaseMultiSourceForm({
    paymentSources,
    inventoriesByBoxId,
    onSubmit,
    onCancel,
    embedded = false,
    selectedDate: selectedDateProp,
    parentInstance,
}: PurchaseMultiSourceFormProps) {
    const [price, setPrice] = useState<number | ''>('');
    const [notes, setNotes] = useState('');
    const [internalDate] = useState(nowStr);
    const selectedDate = selectedDateProp ?? internalDate;
    const [sources, setSources] = useState<SourceEntry[]>([]);
    const [breakdownEditorSourceId, setBreakdownEditorSourceId] = useState<string | null>(null);
    const [breakdownDraft, setBreakdownDraft] = useState<Record<number, number>>({});
    const [changeDestinationBoxId, setChangeDestinationBoxId] = useState<string | null>(null);
    const [changeDestinationTouched, setChangeDestinationTouched] = useState(false);
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});
    const [hasPendingBatch, setHasPendingBatch] = useState(false);
    const [saving, setSaving] = useState(false);
    const scannerRef = useRef<ScannerClientHandle>(null);

    const cashSources = paymentSources.filter(s => s.hasInventory);
    const breakdownEditorSource = breakdownEditorSourceId
        ? paymentSources.find(s => s.id === breakdownEditorSourceId) ?? null
        : null;

    const getSourceEntry = (sourceId: string): SourceEntry =>
        sources.find(s => s.sourceId === sourceId) ?? { sourceId, amount: 0, breakdown: {} };

    const getDisplayAmount = (src: PaymentSourceOption): number => {
        const entry = getSourceEntry(src.id);
        const fromBreakdown = calculateTotal(entry.breakdown);
        if (Object.keys(entry.breakdown).length > 0) return fromBreakdown;
        return src.hasInventory ? fromBreakdown : entry.amount;
    };

    const totalFromSources = paymentSources.reduce((sum, src) => sum + getDisplayAmount(src), 0);
    const priceNum = price === '' ? 0 : price;
    const changeAmount = Math.max(0, totalFromSources - priceNum);
    const changeTotal = calculateTotal(changeBreakdown);
    const changeOk = changeAmount < 0.01 || Math.abs(changeTotal - changeAmount) < 0.01;

    const setSourceBreakdown = (sourceId: string, breakdown: Record<number, number>) => {
        setSources(prev => {
            const idx = prev.findIndex(s => s.sourceId === sourceId);
            if (idx >= 0) return prev.map(s => (s.sourceId === sourceId ? { ...s, breakdown } : s));
            return [...prev, { sourceId, amount: 0, breakdown }];
        });
    };

    const activeCash = cashSources
        .map(s => ({ id: s.id, amount: getDisplayAmount(s) }))
        .filter(s => s.amount >= 0.005);
    const defaultChangeDestination = activeCash.length === 0
        ? null
        : activeCash.length === 1
            ? activeCash[0]!.id
            : activeCash.reduce((best, cur) => (cur.amount > best.amount ? cur : best)).id;
    const effectiveChangeDestinationId = changeDestinationTouched
        ? changeDestinationBoxId
        : (changeDestinationBoxId ?? defaultChangeDestination);

    const canSubmit =
        priceNum > 0 &&
        totalFromSources >= priceNum - 0.01 &&
        (changeAmount < 0.01 || (changeOk && effectiveChangeDestinationId));

    const openBreakdown = (sourceId: string) => {
        setBreakdownDraft({ ...getSourceEntry(sourceId).breakdown });
        setBreakdownEditorSourceId(sourceId);
    };

    const closeBreakdown = () => setBreakdownEditorSourceId(null);

    const saveBreakdown = () => {
        if (!breakdownEditorSourceId) return;
        const clean: Record<number, number> = {};
        Object.entries(breakdownDraft).forEach(([k, v]) => {
            if (v > 0) clean[Number(k)] = v;
        });
        setSourceBreakdown(breakdownEditorSourceId, clean);
        closeBreakdown();
    };

    const buildSourcesForPayload = (): SourceEntry[] =>
        paymentSources
            .map(src => {
                const entry = getSourceEntry(src.id);
                const amount = Object.keys(entry.breakdown).length > 0 ? calculateTotal(entry.breakdown) : entry.amount;
                return { sourceId: src.id, amount, breakdown: entry.breakdown };
            })
            .filter(s => s.amount >= 0.005);

    const handleConfirm = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        try {
            if (hasPendingBatch) {
                const ok = await scannerRef.current?.saveBatch() ?? false;
                if (!ok) return;
            }
            onSubmit({
                price: priceNum,
                notes: notes || 'Compra',
                customDate: selectedDate ? parseDateTimeLocal(selectedDate).toISOString() : undefined,
                sources: buildSourcesForPayload(),
                changeAmount,
                changeDestinationBoxId: changeAmount >= 0.01 ? effectiveChangeDestinationId : null,
                changeBreakdown: changeAmount >= 0.01 ? changeBreakdown : {},
            });
        } finally {
            setSaving(false);
        }
    };

    const changeDestinationLabel = effectiveChangeDestinationId
        ? paymentSources.find(s => s.id === effectiveChangeDestinationId)?.shortLabel ?? 'Caja'
        : null;

    return (
        <div className={cn('relative flex h-full flex-col overflow-hidden bg-transparent', !embedded && 'rounded-2xl')}>
            <QuickCashTools calculator breakdown />

            {breakdownEditorSource ? (
                <Modal
                    open
                    onClose={closeBreakdown}
                    variant="amplify"
                    layer="derived"
                    parentInstance={parentInstance}
                    instance="purchase-source-breakdown"
                    usageId="purchase-source-breakdown"
                    usageLabel={`Desglose ${breakdownEditorSource.shortLabel}`}
                    title={`Desglose · ${breakdownEditorSource.shortLabel}`}
                    footer={
                        <CashCountFooter
                            total={calculateTotal(breakdownDraft)}
                            instancePrefix="purchase-source-breakdown"
                            onCancel={closeBreakdown}
                            onSave={saveBreakdown}
                        />
                    }
                >
                    <DenominationCountGrid
                        counts={breakdownDraft}
                        onAdjust={(denom, delta) => setBreakdownDraft(prev => {
                            const next = { ...prev, [denom]: Math.max(0, (prev[denom] ?? 0) + delta) };
                            if (next[denom] === 0) delete next[denom];
                            return next;
                        })}
                        onChange={(denom, raw) => {
                            const v = parseInt(raw, 10) || 0;
                            setBreakdownDraft(prev => {
                                const next = { ...prev, [denom]: v };
                                if (v === 0) delete next[denom];
                                return next;
                            });
                        }}
                        availableStock={breakdownEditorSource.hasInventory ? inventoriesByBoxId[breakdownEditorSource.id] : undefined}
                        showAvailable={breakdownEditorSource.hasInventory}
                    />
                </Modal>
            ) : null}

            <div className="flex-1 overflow-y-auto pb-4 space-y-5">
                <div className="space-y-4">
                    <PurchaseFieldRow title="Concepto">
                        <input
                            type="text"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Motivo..."
                            className="h-9 w-full rounded-xl border border-white/20 bg-white px-2 text-center text-sm font-black text-zinc-800 outline-none placeholder:font-bold placeholder:text-zinc-400"
                            data-element="purchase-field"
                        />
                    </PurchaseFieldRow>

                    <PurchaseFieldRow title="Precio">
                        <div className="relative h-9 w-full">
                            <input
                                type="number"
                                step="0.01"
                                min="0"
                                data-element="purchase-field"
                                value={price === '' ? '' : price}
                                onChange={e => {
                                    const v = e.target.value;
                                    setPrice(v === '' ? '' : parseFloat(v));
                                }}
                                placeholder="0.00"
                                className="h-full w-full rounded-xl border border-white/20 bg-white px-2 pr-6 text-center text-sm font-black tabular-nums text-zinc-800 outline-none placeholder:font-bold placeholder:text-zinc-400"
                            />
                            {priceNum > 0 ? (
                                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-sm font-black text-zinc-500">€</span>
                            ) : null}
                        </div>
                    </PurchaseFieldRow>
                </div>

                <div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-white/85">Caja</span>
                    <div className="mt-2 grid grid-cols-5 gap-2">
                        {paymentSources.map(src => (
                            <BoxCard
                                key={src.id}
                                source={src}
                                amount={getDisplayAmount(src)}
                                selected={breakdownEditorSourceId === src.id}
                                onClick={() => openBreakdown(src.id)}
                            />
                        ))}
                    </div>
                </div>

                {changeAmount >= 0.01 ? (
                    <div className="space-y-3">
                        <div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-white/85">Destino del cambio</span>
                            <div className="mt-2 grid grid-cols-5 gap-2">
                                {cashSources.map(src => (
                                    <BoxCard
                                        key={src.id}
                                        source={src}
                                        amount={0}
                                        selected={effectiveChangeDestinationId === src.id}
                                        onClick={() => {
                                            setChangeDestinationTouched(true);
                                            setChangeDestinationBoxId(src.id);
                                        }}
                                    />
                                ))}
                            </div>
                            {!effectiveChangeDestinationId ? (
                                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-rose-300">Falta destino</p>
                            ) : null}
                        </div>

                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-white/85">Desglose del cambio</p>
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
                            />
                            {!changeOk ? (
                                <p className="mt-1 text-[9px] font-black uppercase tracking-widest text-rose-300">
                                    El desglose debe sumar {changeAmount.toFixed(2)}€
                                </p>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                <div>
                    <ScannerClient
                        ref={scannerRef}
                        embedded
                        hideBatchActions
                        onBatchChange={setHasPendingBatch}
                    />
                </div>
            </div>

            <div className="shrink-0 border-t border-white/12 pt-3">
                <CashCountFooter
                    total={totalFromSources}
                    instancePrefix="purchase-multi-source"
                    cancelLabel="Cancelar"
                    saveLabel="Guardar"
                    onCancel={onCancel}
                    onSave={() => void handleConfirm()}
                    saveDisabled={!canSubmit || saving}
                    saveLoading={saving}
                    extra={
                        changeAmount >= 0.01 ? (
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-white/55">A devolver</span>
                                <span className="text-sm font-bold tabular-nums text-white/70">{changeAmount.toFixed(2)}€</span>
                                {changeDestinationLabel ? (
                                    <span className="text-[10px] font-black uppercase tracking-widest text-white/55">· {changeDestinationLabel}</span>
                                ) : null}
                            </div>
                        ) : null
                    }
                />
            </div>
        </div>
    );
}
