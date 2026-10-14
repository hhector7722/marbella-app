'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
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
    onSubmit: (payload: PurchaseMultiSourcePayload) => Promise<void>;
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
    if (label.includes('cambio 1') || label.includes('cambio1')) return '/images/cash-change/cambio1.avif';
    if (label.includes('inicial')) return '/images/cash-change/inicial.avif';
    if (label.includes('cambio 2') || label.includes('cambio2')) return '/images/cash-change/cambio2.avif';
    if (source.kind === 'tpv') return '/images/cash-change/tpv.avif';
    return source.image_url || '/images/cash-change/inicial.avif';
}


type PurchasePlanKey = 'tpv1' | 'tpv2' | 'cambio1' | 'cambio2' | 'inicial';
type PurchasePlanPoint = { x: number; y: number };
type PurchasePlanView = PurchasePlanPoint & { zoom: number };

/** El mismo plano, posiciones, imágenes y rótulos del modal Cambio. */
const PURCHASE_BOX_PLAN: Record<PurchasePlanKey, {
    x: number; y: number; width: number; image: string; imageWidth: number; imageHeight: number; label: string;
}> = {
    tpv1: { x: 58.5, y: 36.5, width: 8.8, image: '/images/cash-change/tpv.avif', imageWidth: 591, imageHeight: 600, label: 'TPV 1' },
    tpv2: { x: 58.5, y: 71.7, width: 8.8, image: '/images/cash-change/tpv.avif', imageWidth: 591, imageHeight: 600, label: 'TPV 2' },
    cambio1: { x: 10.4, y: 24.1, width: 6.5, image: '/images/cash-change/cambio1.avif', imageWidth: 550, imageHeight: 492, label: 'Cambio 1' },
    cambio2: { x: 33, y: 15.4, width: 8, image: '/images/cash-change/cambio2.avif', imageWidth: 535, imageHeight: 550, label: 'Cambio 2' },
    inicial: { x: 21, y: 15.4, width: 5.8, image: '/images/cash-change/inicial.avif', imageWidth: 550, imageHeight: 529, label: 'Inicial' },
};

function purchasePlanKey(source: PaymentSourceOption): PurchasePlanKey | null {
    const name = (source.name + source.shortLabel).toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (source.id === 'tpv1' || name.includes('tpv1')) return 'tpv1';
    if (source.id === 'tpv2' || name.includes('tpv2')) return 'tpv2';
    if (name.includes('cambio1')) return 'cambio1';
    if (name.includes('cambio2')) return 'cambio2';
    if (name.includes('inicial') || name.includes('cajaoperativa') || name.includes('operativa')) return 'inicial';
    return null;
}

function clampPurchasePlanView(view: PurchasePlanView, width: number, height: number): PurchasePlanView {
    const zoom = Math.min(3, Math.max(1, view.zoom));
    return {
        zoom,
        x: Math.min(0, Math.max(width * (1 - zoom), view.x)),
        y: Math.min(0, Math.max(height * (1 - zoom), view.y)),
    };
}

function zoomPurchasePlanAt(view: PurchasePlanView, zoom: number, point: PurchasePlanPoint, width: number, height: number): PurchasePlanView {
    const nextZoom = Math.min(3, Math.max(1, zoom));
    const ratio = nextZoom / view.zoom;
    return clampPurchasePlanView({
        zoom: nextZoom,
        x: point.x - (point.x - view.x) * ratio,
        y: point.y - (point.y - view.y) * ratio,
    }, width, height);
}

function PurchaseBoxPlanPicker({
    paymentSources,
    selectedBoxIds,
    replacingSourceId,
    onSelect,
}: {
    paymentSources: PaymentSourceOption[];
    selectedBoxIds: string[];
    replacingSourceId: string | null;
    onSelect: (sourceId: string) => void;
}) {
    const [view, setView] = useState<PurchasePlanView>({ zoom: 1, x: 0, y: 0 });
    const viewportRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef(view);
    const pointersRef = useRef(new Map<number, PurchasePlanPoint>());
    const startsRef = useRef(new Map<number, PurchasePlanPoint>());
    const draggedRef = useRef(false);
    const setPlanView = (next: PurchasePlanView) => { viewRef.current = next; setView(next); };

    useEffect(() => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = viewport.getBoundingClientRect();
            setPlanView(zoomPurchasePlanAt(viewRef.current, viewRef.current.zoom * Math.exp(-event.deltaY * 0.0015),
                { x: event.clientX - rect.left, y: event.clientY - rect.top }, rect.width, rect.height));
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, []);

    const positioned = paymentSources
        .map(source => ({ source, key: purchasePlanKey(source) }))
        .filter((item): item is { source: PaymentSourceOption; key: PurchasePlanKey } => item.key !== null);

    return (
        <div
            ref={viewportRef}
            data-element="purchase-box-plan"
            className="relative mx-auto aspect-[2048/1084] w-full max-w-[1136px] touch-none overflow-hidden rounded-ds-superficie border border-white/70 bg-zinc-100"
            role="region"
            tabIndex={0}
            aria-label="Selecciona una caja en el plano. Pellizca o usa la rueda para ampliar."
            onKeyDown={event => {
                if (event.target !== event.currentTarget) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const center = { x: rect.width / 2, y: rect.height / 2 };
                if (event.key === '+' || event.key === '=') {
                    event.preventDefault();
                    setPlanView(zoomPurchasePlanAt(viewRef.current, viewRef.current.zoom * 1.2, center, rect.width, rect.height));
                } else if (event.key === '-') {
                    event.preventDefault();
                    setPlanView(zoomPurchasePlanAt(viewRef.current, viewRef.current.zoom / 1.2, center, rect.width, rect.height));
                } else if (event.key.startsWith('Arrow') && viewRef.current.zoom > 1) {
                    event.preventDefault();
                    const delta = 48;
                    setPlanView(clampPurchasePlanView({
                        ...viewRef.current,
                        x: viewRef.current.x + (event.key === 'ArrowLeft' ? delta : event.key === 'ArrowRight' ? -delta : 0),
                        y: viewRef.current.y + (event.key === 'ArrowUp' ? delta : event.key === 'ArrowDown' ? -delta : 0),
                    }, rect.width, rect.height));
                }
            }}
            onPointerDown={event => {
                draggedRef.current = false;
                const point = { x: event.clientX, y: event.clientY };
                pointersRef.current.set(event.pointerId, point);
                startsRef.current.set(event.pointerId, point);
                if (pointersRef.current.size === 2) event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event => {
                const pointers = pointersRef.current;
                const previous = pointers.get(event.pointerId);
                if (!previous) return;
                const current = { x: event.clientX, y: event.clientY };
                pointers.set(event.pointerId, current);
                const rect = event.currentTarget.getBoundingClientRect();
                if (pointers.size === 2) {
                    const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
                    if (!other) return;
                    const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
                    if (oldDistance < 1) return;
                    const newDistance = Math.hypot(current.x - other.x, current.y - other.y);
                    const oldMid = { x: (previous.x + other.x) / 2 - rect.left, y: (previous.y + other.y) / 2 - rect.top };
                    const newMid = { x: (current.x + other.x) / 2 - rect.left, y: (current.y + other.y) / 2 - rect.top };
                    const next = zoomPurchasePlanAt(viewRef.current, viewRef.current.zoom * newDistance / oldDistance, oldMid, rect.width, rect.height);
                    setPlanView(clampPurchasePlanView({ ...next, x: next.x + newMid.x - oldMid.x, y: next.y + newMid.y - oldMid.y }, rect.width, rect.height));
                    draggedRef.current = true;
                    return;
                }
                if (viewRef.current.zoom <= 1) return;
                const start = startsRef.current.get(event.pointerId);
                if (!draggedRef.current && start && Math.hypot(current.x - start.x, current.y - start.y) < 4) return;
                draggedRef.current = true;
                if (!event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.setPointerCapture(event.pointerId);
                setPlanView(clampPurchasePlanView({
                    ...viewRef.current,
                    x: viewRef.current.x + current.x - previous.x,
                    y: viewRef.current.y + current.y - previous.y,
                }, rect.width, rect.height));
            }}
            onPointerUp={event => {
                pointersRef.current.delete(event.pointerId);
                startsRef.current.delete(event.pointerId);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={event => {
                pointersRef.current.delete(event.pointerId);
                startsRef.current.delete(event.pointerId);
                if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onClickCapture={event => {
                if (draggedRef.current) {
                    event.preventDefault();
                    event.stopPropagation();
                    draggedRef.current = false;
                }
            }}
        >
            <div className="absolute inset-0 origin-top-left" style={{
                transform: 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.zoom + ')',
            }}>
                <Image src="/images/cash-change-plan.avif" alt="Plano de cajas" fill priority unoptimized
                    sizes="(max-width: 1200px) calc(100vw - 1rem), 1136px"
                    className="select-none object-cover opacity-90"
                />
                {positioned.map(({ source, key }) => {
                    const item = PURCHASE_BOX_PLAN[key];
                    const isSelected = selectedBoxIds.includes(source.id);
                    const isAlreadyUsed = isSelected && source.id !== replacingSourceId;
                    return (
                        <div key={source.id + '-asset'}
                            aria-hidden
                            className={cn(
                                'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 transition-opacity duration-200',
                                isAlreadyUsed && replacingSourceId ? 'opacity-25' : 'opacity-100',
                            )}
                            style={{ left: item.x + '%', top: item.y + '%', width: item.width + '%' }}
                        >
                            <Image src={item.image} alt="" width={item.imageWidth} height={item.imageHeight}
                                unoptimized className="h-auto w-full select-none object-contain" />
                            <span data-element="purchase-box-plan-label"
                                className={cn(
                                    'absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-500 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white shadow-sm',
                                    key === 'inicial' ? 'bottom-full mb-1' : 'top-full mt-1',
                                )}
                            >{item.label}</span>
                        </div>
                    );
                })}
                {positioned.map(({ source, key }) => {
                    const item = PURCHASE_BOX_PLAN[key];
                    const isAlreadyUsed = selectedBoxIds.includes(source.id) && source.id !== replacingSourceId;
                    return (
                        <button key={source.id} type="button" data-plan-box={key}
                            aria-label={isAlreadyUsed ? source.shortLabel + ' ya añadida' : 'Seleccionar ' + source.shortLabel}
                            aria-pressed={selectedBoxIds.includes(source.id)}
                            disabled={isAlreadyUsed}
                            onClick={() => onSelect(source.id)}
                            className="absolute z-20 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-xl border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed sm:h-20 sm:w-24"
                            style={{ left: item.x + '%', top: item.y + '%' }}
                        />
                    );
                })}
            </div>
        </div>
    );
}

/**
 * Fila de dos columnas del formulario de compra: concepto a la izquierda
 * (tinta blanca sobre el modal) y caja de texto blanca a la derecha.
 */
function PurchaseFieldRow({
    title,
    children,
}: {
    title?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="grid grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-3">
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
    tone = 'dark',
    actionLabel,
}: {
    source: PaymentSourceOption;
    amount: number;
    selected: boolean;
    onClick: () => void;
    showAmount?: boolean;
    showSelectionRing?: boolean;
    tone?: 'dark' | 'light';
    actionLabel?: string;
}) {
    const hasAmount = amount > 0.005;
    const isInitial = `${source.name} ${source.shortLabel}`.toLowerCase().includes('inicial');
    return (
        <button
            type="button"
            data-design-exception="native-business-button:seleccion-de-caja-compra"
            onClick={onClick}
            aria-pressed={selected}
            aria-label={actionLabel ?? `${showAmount ? 'Desglosar' : 'Seleccionar'} ${source.shortLabel}`}
            className={cn(
                'flex min-h-ds-tactil min-w-0 flex-col items-center justify-start gap-0.5 bg-transparent px-0.5 py-1 transition-transform hover:scale-105',
                tone === 'light' ? 'text-ds-texto-fuerte' : 'text-white'
            )}
        >
            <span className={cn(
                'flex h-9 w-9 items-center justify-center',
                showSelectionRing && selected && 'rounded-lg ring-2 ring-white/80',
                tone === 'light' && showSelectionRing && selected && 'ring-ds-marca'
            )}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src={resolveBoxImage(source)}
                    alt=""
                    className={cn(
                        'object-contain',
                        isInitial ? 'h-[88%] w-[88%]' : 'h-full w-full',
                        tone === 'light' && 'drop-shadow-md'
                    )}
                />
            </span>
            <span className="w-full whitespace-nowrap text-center text-[9px] font-normal normal-case tracking-tight leading-tight sm:text-[10px]">
                {source.shortLabel}
            </span>
            {showAmount && hasAmount ? (
                <span className={cn(
                    'w-full truncate text-center text-[10px] font-semibold tabular-nums leading-tight',
                    tone === 'light' ? 'text-ds-marca' : 'text-emerald-300'
                )}>
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
    const [selectedBoxIds, setSelectedBoxIds] = useState<string[]>([]);
    const [boxPickerOpen, setBoxPickerOpen] = useState(false);
    const [boxPickerReplaceId, setBoxPickerReplaceId] = useState<string | null>(null);
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
        paymentSources.filter(src => selectedBoxIds.includes(src.id))
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
            await onSubmit({
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

    const openBoxPicker = (replacingSourceId: string | null = null) => {
        setBoxPickerReplaceId(replacingSourceId);
        setBoxPickerOpen(true);
    };

    const chooseBox = (chosenId: string) => {
        const isAlreadyUsedElsewhere = selectedBoxIds.includes(chosenId) && chosenId !== boxPickerReplaceId;
        if (isAlreadyUsedElsewhere) return;
        if (boxPickerReplaceId && chosenId !== boxPickerReplaceId) {
            setSelectedBoxIds(prev => prev.map(id => id === boxPickerReplaceId ? chosenId : id));
            // Los billetes de una caja no se asignan silenciosamente a otra.
            setSources(prev => prev.filter(entry => entry.sourceId !== boxPickerReplaceId));
            setChangeBreakdown({});
            setChangeDestinationBoxId(null);
        } else if (!boxPickerReplaceId) {
            setSelectedBoxIds(prev => prev.includes(chosenId) ? prev : [...prev, chosenId]);
        }
        setBoxPickerOpen(false);
        setBoxPickerReplaceId(null);
        // Seleccionar una caja lleva directamente al desglose, sin acción intermedia.
        openBreakdown(chosenId);
    };

    const changeDestinationLabel = effectiveChangeDestinationId
        ? paymentSources.find(s => s.id === effectiveChangeDestinationId)?.shortLabel ?? 'Caja'
        : null;

    return (
        <div className={cn('relative flex h-full flex-col overflow-hidden bg-transparent', !embedded && 'rounded-2xl')}>
            <QuickCashTools calculator breakdown />

            {boxPickerOpen ? (
                <Modal
                    open
                    onClose={() => setBoxPickerOpen(false)}
                    variant="work"
                    layer="derived"
                    parentInstance={parentInstance}
                    instance="purchase-box-picker"
                    usageId="purchase-box-picker"
                    usageLabel="Selección de caja para compra"
                    title="Seleccionar caja"
                    scheme="dark"
                    scrollContent={false}
                    fullBleedBody
                >
                    <div className="flex h-full min-h-0 w-full flex-col justify-center gap-2 px-ds-2 pb-ds-2">
                        <PurchaseBoxPlanPicker
                            paymentSources={paymentSources}
                            selectedBoxIds={selectedBoxIds}
                            replacingSourceId={boxPickerReplaceId}
                            onSelect={chooseBox}
                        />
                        <p className="m-0 text-center text-[10px] leading-[14px] text-zinc-400">
                            Toca una caja para seleccionarla. Puedes ampliar el plano con dos dedos.
                        </p>
                    </div>
                </Modal>
            ) : null}

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
                    layer="derived"
                    parentInstance={parentInstance}
                    instance="purchase-change-breakdown"
                    usageId="purchase-change-breakdown"
                    usageLabel="Desglose del cambio de compra"
                    title="Desglose · Cambio"
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
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-ds-texto-fuerte">Destino del cambio</p>
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
                                            tone="light"
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        {eligibleChangeSources.length === 0 ? (
                            <p className="text-sm text-ds-negativo">Para añadir el cambio, debe aportar dinero una caja disponible.</p>
                        ) : null}
                        <p className="text-sm text-ds-texto-fuerte">Desglosa {changeAmount.toFixed(2)}€ de cambio.</p>
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
                            <p className="text-xs text-ds-negativo">El desglose debe sumar {changeAmount.toFixed(2)}€.</p>
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

                <PurchaseFieldRow title="Caja">
                    <div data-element="purchase-box-action" className="flex w-full flex-col items-center gap-2">
                        {selectedBoxIds.length > 0 ? (
                            <div className="flex w-full flex-wrap items-start justify-center gap-x-4 gap-y-2">
                                {selectedBoxIds.map(sourceId => {
                                    const source = paymentSources.find(src => src.id === sourceId);
                                    if (!source) return null;
                                    const amount = getDisplayAmount(source);
                                    return (
                                        <div key={source.id} className="flex flex-col items-center">
                                            <BoxCard
                                                source={source}
                                                amount={amount}
                                                selected={true}
                                                onClick={() => openBoxPicker(source.id)}
                                                actionLabel={'Cambiar ' + source.shortLabel}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        <Button
                            type="button"
                            variant="secondary"
                            instance="purchase-add-box"
                            onClick={() => openBoxPicker()}
                        >
                            Añadir caja
                        </Button>
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
