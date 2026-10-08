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
import { Button } from '@/components/ui/button';
import { eligiblePurchaseChangeSources, resolvePurchaseChangeDestination } from '@/lib/purchase-change';

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

/** Inicial y Cambio 1 usan los recortes limpios; el resto conserva su imagen configurada. */
function resolveBoxImage(source: PaymentSourceOption): string {
    const label = `${source.name} ${source.shortLabel}`.toLowerCase();
    if (label.includes('cambio 1') || label.includes('cambio1')) return '/icons/cambio-1.png';
    if (label.includes('inicial')) return '/icons/inicial.png';
    if (source.image_url) return source.image_url;
    if (source.kind === 'tpv') return '/icons/tpv.png';
    if (label.includes('cambio 2') || label.includes('cambio2')) return '/icons/cambio-2.png';
    return '/icons/inicial.png';
}

/**
 * Fila de dos columnas del formulario de compra: concepto a la izquierda
 * (tinta blanca sobre el modal) y caja de texto blanca a la derecha.
 */
function PurchaseFieldRow({
    title,
    children,
    compactLabel = false,
}: {
    title?: string;
    children: React.ReactNode;
    compactLabel?: boolean;
}) {
    return (
        <div className={cn(
            'grid items-center',
            compactLabel ? 'grid-cols-[2.5rem_minmax(0,1fr)] gap-x-1' : 'grid-cols-[6rem_minmax(0,1fr)] gap-x-3'
        )}>
            <span aria-hidden={!title} className="text-[10px] font-black uppercase tracking-widest text-white/85">{title}</span>
            <div className="flex min-w-0 items-center justify-center">{children}</div>
        </div>
    );
}

/** Caja sobre el fondo del modal: icono y nombre, sin tarjeta de relleno. */
function BoxCard({
    source,
    amount,
    selected,
    onClick,
    showAmount = true,
    showSelectionRing = false,
}: {
    source: PaymentSourceOption;
    amount: number;
    selected: boolean;
    onClick: () => void;
    showAmount?: boolean;
    showSelectionRing?: boolean;
}) {
    const hasAmount = amount > 0.005;
    return (
        <button
            type="button"
            data-design-exception="native-business-button:seleccion-de-caja-compra"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={`${showAmount ? 'Desglosar' : 'Seleccionar'} ${source.shortLabel}`}
            className="flex min-h-ds-tactil min-w-0 flex-col items-center justify-start gap-0.5 bg-transparent px-0.5 py-1 text-white transition-transform hover:scale-105"
        >
            <span className={cn('flex h-9 w-9 items-center justify-center', showSelectionRing && selected && 'rounded-lg ring-2 ring-white/80')}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={resolveBoxImage(source)}
                    alt=""
                    className="h-full w-full object-contain"
                />
            </span>
            <span className="w-full whitespace-nowrap text-center text-[9px] font-normal normal-case tracking-tight leading-tight text-white sm:text-[10px]">
                {source.shortLabel}
            </span>
            {showAmount && hasAmount ? (
                <span className="w-full truncate text-center text-[10px] font-semibold tabular-nums leading-tight text-emerald-300">
                    {amount.toFixed(2)}€
                </span>
            ) : null}
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
    const [changeBreakdown, setChangeBreakdown] = useState<Record<number, number>>({});
    const [changeEditorOpen, setChangeEditorOpen] = useState(false);
    const [changeBreakdownDraft, setChangeBreakdownDraft] = useState<Record<number, number>>({});
    const [changeDestinationDraftId, setChangeDestinationDraftId] = useState<string | null>(null);
    const [hasPendingBatch, setHasPendingBatch] = useState(false);
    const [saving, setSaving] = useState(false);
    const scannerRef = useRef<ScannerClientHandle>(null);

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
    const changeNeeded = Number.isFinite(priceNum) && priceNum > 0 && changeAmount >= 0.01;
    const changeTotal = calculateTotal(changeBreakdown);
    const changeOk = changeAmount < 0.01 || Math.abs(changeTotal - changeAmount) < 0.01;
    const eligibleChangeSources = eligiblePurchaseChangeSources(
        paymentSources.map(source => ({ ...source, amount: getDisplayAmount(source) }))
    );
    const effectiveChangeDestinationId = resolvePurchaseChangeDestination(eligibleChangeSources, changeDestinationBoxId);
    const draftChangeDestinationId = resolvePurchaseChangeDestination(eligibleChangeSources, changeDestinationDraftId);
    const draftChangeOk = Math.abs(calculateTotal(changeBreakdownDraft) - changeAmount) < 0.01;

    const setSourceBreakdown = (sourceId: string, breakdown: Record<number, number>) => {
        setSources(prev => {
            const idx = prev.findIndex(s => s.sourceId === sourceId);
            if (idx >= 0) return prev.map(s => (s.sourceId === sourceId ? { ...s, breakdown } : s));
            return [...prev, { sourceId, amount: 0, breakdown }];
        });
    };

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

    const openChangeEditor = () => {
        setChangeBreakdownDraft({ ...changeBreakdown });
        setChangeDestinationDraftId(effectiveChangeDestinationId);
        setChangeEditorOpen(true);
    };

    const saveChange = () => {
        if (!draftChangeDestinationId || !draftChangeOk) return;
        const clean: Record<number, number> = {};
        Object.entries(changeBreakdownDraft).forEach(([key, count]) => {
            if (count > 0) clean[Number(key)] = count;
        });
        setChangeBreakdown(clean);
        setChangeDestinationBoxId(draftChangeDestinationId);
        setChangeEditorOpen(false);
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

            {changeEditorOpen ? (
                <Modal
                    open
                    onClose={() => setChangeEditorOpen(false)}
                    variant="amplify"
                    scheme="dark"
                    layer="derived"
                    parentInstance={parentInstance}
                    instance="purchase-change-breakdown"
                    usageId="purchase-change-breakdown"
                    usageLabel="Añadir cambio de compra"
                    title="Añadir cambio"
                    footer={
                        <CashCountFooter
                            total={calculateTotal(changeBreakdownDraft)}
                            instancePrefix="purchase-change-breakdown"
                            onCancel={() => setChangeEditorOpen(false)}
                            onSave={saveChange}
                            saveDisabled={!draftChangeDestinationId || !draftChangeOk}
                        />
                    }
                >
                    <div className="space-y-4">
                        {eligibleChangeSources.length > 1 ? (
                            <div>
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-white/85">Destino del cambio</p>
                                <div className="grid grid-cols-5 gap-1">
                                    {eligibleChangeSources.map(source => (
                                        <BoxCard
                                            key={source.id}
                                            source={source}
                                            amount={source.amount}
                                            selected={draftChangeDestinationId === source.id}
                                            onClick={() => setChangeDestinationDraftId(source.id)}
                                            showAmount={false}
                                            showSelectionRing
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {eligibleChangeSources.length === 0 ? (
                            <p className="text-sm text-rose-200">Para añadir el cambio, debe aportar dinero una caja disponible.</p>
                        ) : null}
                        <p className="text-sm text-white/85">Desglosa {changeAmount.toFixed(2)}€ de cambio.</p>
                        <DenominationCountGrid
                            counts={changeBreakdownDraft}
                            onAdjust={(denom, delta) => setChangeBreakdownDraft(prev => {
                                const next = { ...prev, [denom]: Math.max(0, (prev[denom] ?? 0) + delta) };
                                if (next[denom] === 0) delete next[denom];
                                return next;
                            })}
                            onChange={(denom, raw) => {
                                const count = parseInt(raw, 10) || 0;
                                setChangeBreakdownDraft(prev => {
                                    const next = { ...prev, [denom]: count };
                                    if (count === 0) delete next[denom];
                                    return next;
                                });
                            }}
                        />
                        {!draftChangeOk ? (
                            <p className="text-xs text-rose-200">El desglose debe sumar {changeAmount.toFixed(2)}€.</p>
                        ) : null}
                    </div>
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

                <PurchaseFieldRow title="Caja" compactLabel>
                    <div className="grid w-full grid-cols-5 gap-1">
                        {paymentSources.map(src => (
                            <BoxCard
                                key={src.id}
                                source={src}
                                amount={getDisplayAmount(src)}
                                selected={getDisplayAmount(src) > 0.005}
                                onClick={() => openBreakdown(src.id)}
                            />
                        ))}
                    </div>
                </PurchaseFieldRow>

                <PurchaseFieldRow title="Cambio">
                    <div data-element="purchase-change-action" className="flex w-full flex-col items-center gap-1">
                        <Button
                            type="button"
                            variant="primary"
                            instance="purchase-add-change"
                            layout="hug"
                            onClick={openChangeEditor}
                            disabled={!changeNeeded}
                        >
                            Añadir cambio
                        </Button>
                        {changeNeeded && changeOk && effectiveChangeDestinationId ? (
                            <p className="text-xs text-white/70">{changeAmount.toFixed(2)}€ · {changeDestinationLabel}</p>
                        ) : null}
                    </div>
                </PurchaseFieldRow>

                <PurchaseFieldRow>
                    <div data-element="purchase-scan-action" className="flex w-full flex-col items-center">
                        <ScannerClient
                            ref={scannerRef}
                            embedded
                            compactTrigger
                            triggerLabel="Escanear albarán"
                            hideBatchActions
                            onBatchChange={setHasPendingBatch}
                        />
                    </div>
                </PurchaseFieldRow>
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
                        changeNeeded ? (
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
