'use client';

import { Fragment, useState, useEffect, useRef } from 'react';
import { Eye, ChevronLeft, ChevronRight, Wallet, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { cn, firstGivenName } from '@/lib/utils';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { QuickCashTools } from '@/components/ui/QuickCalculatorModal';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';

import { CURRENCY_IMAGES } from '@/lib/constants';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { randomId } from '@/lib/random-id';
import { DenominationCountGrid, DenominationStepper } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { EmptyState } from '@/components/ui/EmptyState';

const BILLS = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
const ALL_DENOMS = [...BILLS, ...COINS];

type PlanPoint = { x: number; y: number };
type PlanView = { zoom: number; x: number; y: number };

function clampPlanView(view: PlanView, width: number, height: number): PlanView {
    const zoom = Math.min(3, Math.max(1, view.zoom));
    return {
        zoom,
        x: Math.min(0, Math.max(width * (1 - zoom), view.x)),
        y: Math.min(0, Math.max(height * (1 - zoom), view.y)),
    };
}

function zoomPlanAt(view: PlanView, zoom: number, point: PlanPoint, width: number, height: number): PlanView {
    const nextZoom = Math.min(3, Math.max(1, zoom));
    const ratio = nextZoom / view.zoom;
    return clampPlanView({
        zoom: nextZoom,
        x: point.x - (point.x - view.x) * ratio,
        y: point.y - (point.y - view.y) * ratio,
    }, width, height);
}

const CASH_CHANGE_PLAN_POSITIONS = {
    // Coordenadas aprobadas sobre el plano limpio 2048 × 1084.
    tpv1: { x: 58.5, y: 36.5 },
    tpv2: { x: 58.5, y: 71.7 },
    cambio1: { x: 10.4, y: 24.1 },
    cambio2: { x: 36, y: 15.4 },
    inicial: { x: 21, y: 15.4 },
} satisfies Record<string, PlanPoint>;

const CASH_CHANGE_PLAN_TOP_LABELS = {
    inicial: { x: 19, y: 24 },
    cambio2: { x: 39, y: 24 },
} satisfies Partial<Record<keyof typeof CASH_CHANGE_PLAN_POSITIONS, PlanPoint>>;

const CASH_CHANGE_PLAN_WIDTHS: Record<keyof typeof CASH_CHANGE_PLAN_POSITIONS, number> = {
    tpv1: 8.8,
    tpv2: 8.8,
    cambio1: 6.5,
    cambio2: 8,
    inicial: 5.8,
};

const CASH_CHANGE_PLAN_ASSET_SIZES: Record<keyof typeof CASH_CHANGE_PLAN_POSITIONS, { width: number; height: number }> = {
    tpv1: { width: 591, height: 600 },
    tpv2: { width: 591, height: 600 },
    cambio1: { width: 550, height: 492 },
    cambio2: { width: 535, height: 550 },
    inicial: { width: 550, height: 529 },
};

function cashChangePlanKey(box: BoxOption): keyof typeof CASH_CHANGE_PLAN_POSITIONS | null {
    const compact = (box.name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');

    if (box.id === 'tpv1' || compact.includes('tpv1')) return 'tpv1';
    if (box.id === 'tpv2' || compact.includes('tpv2')) return 'tpv2';
    if (compact.includes('cambio1')) return 'cambio1';
    if (compact.includes('cambio2')) return 'cambio2';
    if (
        compact.includes('inicial') ||
        compact.includes('cajaoperativa') ||
        compact.includes('operativa') ||
        compact.includes('efectivo') ||
        compact.includes('mycafe')
    ) return 'inicial';
    return null;
}

function resolveCashChangePlanPosition(box: BoxOption): PlanPoint | null {
    const key = cashChangePlanKey(box);
    return key ? CASH_CHANGE_PLAN_POSITIONS[key] : null;
}

function cashChangePlanImage(box: BoxOption): string | null {
    switch (cashChangePlanKey(box)) {
        case 'cambio1': return '/images/cash-change/cambio1.avif';
        case 'cambio2': return '/images/cash-change/cambio2.avif';
        case 'inicial': return '/images/cash-change/inicial.avif';
        case 'tpv1':
        case 'tpv2':
            return '/images/cash-change/tpv.avif';
        default:
            return box.image_url || null;
    }
}

function cashChangePlanDisplayLabel(box: BoxOption): string {
    switch (cashChangePlanKey(box)) {
        case 'cambio1': return 'Cambio 1';
        case 'cambio2': return 'Cambio 2';
        case 'inicial': return 'Inicial';
        case 'tpv1': return 'TPV 1';
        case 'tpv2': return 'TPV 2';
        default: return box.name;
    }
}

function formatExchangeAmount(amount: number): string {
    return amount.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

export type BoxOption = { id: string; name: string; hasInventory: boolean; image_url?: string };

interface CashChangeModalProps {
    /** Legacy: una sola caja (arqueo interno). Si se pasa, se usa flujo antiguo SWAP. */
    boxId?: string;
    boxName?: string;
    /** Nuevo flujo: elegir Caja A y Caja B, luego De A→B y De B→A. */
    boxOptions?: BoxOption[];
    /** @deprecated El histórico solo se muestra a hhector7722@gmail.com (ver isMasterDashboardUser). */
    isManager?: boolean;
    onClose: () => void;
    onSuccess?: () => void;
}

export interface ExchangeHistoryItem {
    exchange_group_id: string;
    created_at: string;
    first_name: string;
    amount: number;
    from_box_name: string;
    to_box_name: string;
    legs: { from_box_name: string; to_box_name: string; breakdown: Record<string, number>; amount: number }[];
}

type TreasuryExchangeRow = {
    id: string;
    exchange_group_id: string | null;
    created_at: string;
    amount: number | string;
    box_id: string;
    to_box_id: string | null;
    breakdown: Record<string, number> | null;
    user_id: string | null;
    type: string;
    notes: string | null;
};

type CashBoxInventoryRow = {
    denomination: number;
    quantity: number;
};

function resolveLegDirection(
    row: TreasuryExchangeRow,
    boxMap: Record<string, string>,
): { from_box_name: string; to_box_name: string } {
    const boxName = boxMap[row.box_id] || '';
    if (row.type === 'EXCHANGE' && row.to_box_id) {
        return { from_box_name: boxName, to_box_name: boxMap[row.to_box_id] || '' };
    }
    const visualMatch = row.notes?.match(/visual\s+(.+)$/i);
    const visual = visualMatch?.[1]?.trim() || '';
    if (row.type === 'OUT') {
        return { from_box_name: boxName, to_box_name: visual || '—' };
    }
    if (row.type === 'IN') {
        return { from_box_name: visual || '—', to_box_name: boxName };
    }
    return { from_box_name: boxName, to_box_name: visual || '—' };
}

function buildBreakdown(counts: Record<number, number>): Record<string, number> {
    const out: Record<string, number> = {};
    ALL_DENOMS.forEach(d => {
        const q = counts[d] || 0;
        if (q > 0) out[String(d)] = q;
    });
    return out;
}

/** TPV: selección visual; no tiene inventario físico en BD. */
export function isTpvCashBox(box: BoxOption | null | undefined): boolean {
    if (!box) return false;
    if (box.id === 'tpv1' || box.id === 'tpv2') return true;
    return /\btpv\b/i.test(box.name);
}

export const CashChangeModal = ({
    boxId,
    boxName,
    boxOptions = [],
    onClose,
    onSuccess
}: CashChangeModalProps) => {
    const supabase = createClient();
    const useTwoBoxFlow = boxOptions.length > 0;

    // —— Flujo legacy (una caja, SWAP) ——
    const [inCounts, setInCounts] = useState<Record<number, number>>({});
    const [outCounts, setOutCounts] = useState<Record<number, number>>({});
    const [availableStock, setAvailableStock] = useState<Record<number, number>>({});
    const [loadingStock, setLoadingStock] = useState(true);

    // —— Flujo dos cajas ——
    const [step, setStep] = useState<'select' | 'step1' | 'step2'>('select');
    const [boxA, setBoxA] = useState<BoxOption | null>(null);
    const [boxB, setBoxB] = useState<BoxOption | null>(null);
    const [step1Counts, setStep1Counts] = useState<Record<number, number>>({});
    const [step2Counts, setStep2Counts] = useState<Record<number, number>>({});
    const [stockA, setStockA] = useState<Record<number, number>>({});
    const [stockB, setStockB] = useState<Record<number, number>>({});
    const [legDraftBeforeEdit, setLegDraftBeforeEdit] = useState<Record<number, number> | null>(null);
    const [savingExchange, setSavingExchange] = useState(false);
    // Histórico de intercambios (solo manager)
    const [showExchangeHistoryModal, setShowExchangeHistoryModal] = useState(false);
    const [exchangeHistoryYearMonth, setExchangeHistoryYearMonth] = useState(() => {
        const d = new Date();
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
    const [exchangeHistoryList, setExchangeHistoryList] = useState<ExchangeHistoryItem[]>([]);
    const [exchangeHistoryLoading, setExchangeHistoryLoading] = useState(false);
    const [selectedExchangeDetail, setSelectedExchangeDetail] = useState<ExchangeHistoryItem | null>(null);
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);
    const [planView, setPlanView] = useState<PlanView>({ zoom: 1, x: 0, y: 0 });
    const [canViewExchangeHistory, setCanViewExchangeHistory] = useState(false);
    const planViewportRef = useRef<HTMLDivElement>(null);
    const planViewRef = useRef(planView);
    const planPointersRef = useRef(new Map<number, PlanPoint>());
    const planPointerStartsRef = useRef(new Map<number, PlanPoint>());
    const planDraggedRef = useRef(false);

    const updatePlanView = (view: PlanView) => {
        planViewRef.current = view;
        setPlanView(view);
    };

    useEffect(() => {
        const viewport = planViewportRef.current;
        if (!viewport) return;
        const onWheel = (event: WheelEvent) => {
            event.preventDefault();
            const rect = viewport.getBoundingClientRect();
            const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
            updatePlanView(zoomPlanAt(
                planViewRef.current,
                planViewRef.current.zoom * Math.exp(-event.deltaY * 0.0015),
                point,
                rect.width,
                rect.height,
            ));
        };
        viewport.addEventListener('wheel', onWheel, { passive: false });
        return () => viewport.removeEventListener('wheel', onWheel);
    }, []);

    const handlePlanPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        planDraggedRef.current = false;
        const point = { x: event.clientX, y: event.clientY };
        planPointersRef.current.set(event.pointerId, point);
        planPointerStartsRef.current.set(event.pointerId, point);
        if (planPointersRef.current.size === 2) {
            event.currentTarget.setPointerCapture(event.pointerId);
        }
    };

    const handlePlanPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const pointers = planPointersRef.current;
        const previous = pointers.get(event.pointerId);
        if (!previous) return;
        const current = { x: event.clientX, y: event.clientY };
        pointers.set(event.pointerId, current);
        const viewport = event.currentTarget;
        const rect = viewport.getBoundingClientRect();

        if (pointers.size === 2) {
            const other = [...pointers.entries()].find(([id]) => id !== event.pointerId)?.[1];
            if (!other) return;
            const oldDistance = Math.hypot(previous.x - other.x, previous.y - other.y);
            const newDistance = Math.hypot(current.x - other.x, current.y - other.y);
            if (oldDistance < 1) return;
            const oldMid = { x: (previous.x + other.x) / 2 - rect.left, y: (previous.y + other.y) / 2 - rect.top };
            const newMid = { x: (current.x + other.x) / 2 - rect.left, y: (current.y + other.y) / 2 - rect.top };
            const view = zoomPlanAt(planViewRef.current, planViewRef.current.zoom * newDistance / oldDistance, oldMid, rect.width, rect.height);
            updatePlanView(clampPlanView({ ...view, x: view.x + newMid.x - oldMid.x, y: view.y + newMid.y - oldMid.y }, rect.width, rect.height));
            planDraggedRef.current = true;
            return;
        }

        if (planViewRef.current.zoom <= 1) return;
        const dx = current.x - previous.x;
        const dy = current.y - previous.y;
        if (dx === 0 && dy === 0) return;
        const start = planPointerStartsRef.current.get(event.pointerId);
        if (!planDraggedRef.current && start && Math.hypot(current.x - start.x, current.y - start.y) < 4) return;
        planDraggedRef.current = true;
        if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
        updatePlanView(clampPlanView({
            ...planViewRef.current,
            x: planViewRef.current.x + dx,
            y: planViewRef.current.y + dy,
        }, rect.width, rect.height));
    };

    const handlePlanPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
        planPointersRef.current.delete(event.pointerId);
        planPointerStartsRef.current.delete(event.pointerId);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            setCanViewExchangeHistory(isMasterDashboardUser(user?.email));
        })();
        return () => { cancelled = true; };
    }, [supabase]);

    if ((useTwoBoxFlow || !boxId) && loadingStock) {
        setLoadingStock(false);
    }

    useEffect(() => {
        if (!useTwoBoxFlow && boxId) {
            const fetchStock = async () => {
                const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxId).gt('quantity', 0);
                const stock: Record<number, number> = {};
                data?.forEach((d: CashBoxInventoryRow) => stock[Number(d.denomination)] = d.quantity);
                setAvailableStock(stock);
                setLoadingStock(false);
            };
            fetchStock();
        }
    }, [useTwoBoxFlow, boxId, supabase]);

    useEffect(() => {
        if (!useTwoBoxFlow || step !== 'step1' || !boxA?.hasInventory || !boxA.id) return;
        if (isTpvCashBox(boxA)) return;
        const fetchStock = async () => {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxA.id).gt('quantity', 0);
            const s: Record<number, number> = {};
            data?.forEach((d: CashBoxInventoryRow) => s[Number(d.denomination)] = d.quantity);
            setStockA(s);
        };
        fetchStock();
    }, [useTwoBoxFlow, step, boxA?.id, boxA?.hasInventory, supabase]);

    useEffect(() => {
        if (!useTwoBoxFlow || step !== 'step2' || !boxB?.hasInventory || !boxB.id) return;
        if (isTpvCashBox(boxB)) return;
        const fetchStock = async () => {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxB.id).gt('quantity', 0);
            const s: Record<number, number> = {};
            data?.forEach((d: CashBoxInventoryRow) => s[Number(d.denomination)] = d.quantity);
            setStockB(s);
        };
        fetchStock();
    }, [useTwoBoxFlow, step, boxB?.id, boxB?.hasInventory, supabase]);

    useEffect(() => {
        if (!showExchangeHistoryModal || !useTwoBoxFlow) return;
        const { year, month } = exchangeHistoryYearMonth;
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);
        (async () => {
            setExchangeHistoryLoading(true);
            const { data: rows, error } = await supabase
                .from('treasury_log')
                .select('id, exchange_group_id, created_at, amount, box_id, to_box_id, breakdown, user_id, type, notes')
                .not('exchange_group_id', 'is', null)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString())
                .order('created_at', { ascending: false });
            if (error) {
                console.error('CashChangeModal exchange history:', error);
                toast.error('No se pudo cargar el histórico de cambios');
                setExchangeHistoryList([]);
                setExchangeHistoryLoading(false);
                return;
            }
            if (!rows?.length) {
                setExchangeHistoryList([]);
                setExchangeHistoryLoading(false);
                return;
            }
            const typedRows = rows as TreasuryExchangeRow[];
            const userIds = [...new Set(typedRows.map((r) => r.user_id).filter(Boolean))] as string[];
            const { data: profiles } = userIds.length
                ? await supabase.from('profiles').select('id, first_name').in('id', userIds)
                : { data: [] };
            const profileMap: Record<string, string> = {};
            (profiles || []).forEach((p: { id: string; first_name: string | null }) => {
                profileMap[p.id] = p.first_name || '';
            });
            const boxIds = [...new Set(typedRows.flatMap((r) => [r.box_id, r.to_box_id]).filter(Boolean))] as string[];
            const { data: boxes } = boxIds.length
                ? await supabase.from('cash_boxes').select('id, name').in('id', boxIds)
                : { data: [] };
            const boxMap: Record<string, string> = {};
            (boxes || []).forEach((b: { id: string; name: string | null }) => {
                boxMap[b.id] = b.name || '';
            });
            const byGroup = new Map<string, TreasuryExchangeRow[]>();
            typedRows.forEach((r) => {
                const g = r.exchange_group_id || r.id;
                if (!byGroup.has(g)) byGroup.set(g, []);
                byGroup.get(g)!.push(r);
            });
            const list: ExchangeHistoryItem[] = [];
            byGroup.forEach((legs, exchange_group_id) => {
                const sortedLegs = [...legs].sort(
                    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
                );
                const summaryLeg =
                    sortedLegs.find((l) => l.type === 'EXCHANGE')
                    || sortedLegs.find((l) => l.type === 'OUT')
                    || sortedLegs[0];
                const summaryDirection = resolveLegDirection(summaryLeg, boxMap);
                const amount = Math.max(...sortedLegs.map((l) => Number(l.amount) || 0));
                const createdAt = sortedLegs.reduce(
                    (latest, leg) => (new Date(leg.created_at) > new Date(latest) ? leg.created_at : latest),
                    sortedLegs[0].created_at,
                );
                const userId = sortedLegs.find((l) => l.user_id)?.user_id || summaryLeg.user_id;
                list.push({
                    exchange_group_id,
                    created_at: createdAt,
                    first_name: userId ? profileMap[userId] || '' : '',
                    amount,
                    from_box_name: summaryDirection.from_box_name,
                    to_box_name: summaryDirection.to_box_name,
                    legs: sortedLegs.map((l) => {
                        const direction = resolveLegDirection(l, boxMap);
                        return {
                            from_box_name: direction.from_box_name,
                            to_box_name: direction.to_box_name,
                            breakdown: (l.breakdown as Record<string, number>) || {},
                            amount: Number(l.amount) || 0,
                        };
                    }),
                });
            });
            list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setExchangeHistoryList(list);
            setExchangeHistoryLoading(false);
        })();
    }, [showExchangeHistoryModal, exchangeHistoryYearMonth, useTwoBoxFlow, supabase]);

    const totalIn = ALL_DENOMS.reduce((acc, val) => acc + (val * (inCounts[val] || 0)), 0);
    const totalOut = ALL_DENOMS.reduce((acc, val) => acc + (val * (outCounts[val] || 0)), 0);
    const diff = totalIn - totalOut;
    const isBalanced = Math.abs(diff) < 0.01;
    const hasStockIssueLegacy = Object.entries(outCounts).some(([d, q]) => q > (availableStock[Number(d)] || 0));

    const totalStep1 = ALL_DENOMS.reduce((acc, val) => acc + (val * (step1Counts[val] || 0)), 0);
    const totalStep2 = ALL_DENOMS.reduce((acc, val) => acc + (val * (step2Counts[val] || 0)), 0);
    const hasStockIssueStep1 = boxA?.hasInventory && Object.entries(step1Counts).some(([d, q]) => q > (stockA[Number(d)] || 0));
    const hasStockIssueStep2 = boxB?.hasInventory && Object.entries(step2Counts).some(([d, q]) => q > (stockB[Number(d)] || 0));

    const handleAdjust = (denom: number, side: 'in' | 'out', delta: number) => {
        if (side === 'in') {
            setInCounts(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
        } else {
            setOutCounts(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
        }
    };

    const handleCountChange = (denom: number, side: 'in' | 'out', val: string) => {
        const numQty = parseInt(val) || 0;
        if (side === 'in') {
            setInCounts(prev => ({ ...prev, [denom]: Math.max(0, numQty) }));
        } else {
            setOutCounts(prev => ({ ...prev, [denom]: Math.max(0, numQty) }));
        }
    };

    const handleAdjustTransfer = (denom: number, counts: Record<number, number>, setCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>, delta: number) => {
        setCounts(prev => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
    };

    const handleCountChangeTransfer = (denom: number, val: string, setCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>) => {
        const numQty = parseInt(val) || 0;
        setCounts(prev => ({ ...prev, [denom]: Math.max(0, numQty) }));
    };

    const handleSubmitLegacy = async () => {
        if (!boxId) {
            toast.error('Caja no seleccionada');
            return;
        }
        const { error } = await supabase.from('treasury_log').insert({
            box_id: boxId,
            type: 'SWAP',
            amount: totalIn,
            breakdown: { in: inCounts, out: outCounts },
            notes: `Cambio: Entra ${totalIn.toFixed(2)}€`
        });
        if (error) {
            console.error('CashChangeModal insert SWAP:', error);
            toast.error(error.message || 'Error al guardar el cambio');
            return;
        }
        toast.success('Cambio realizado correctamente');
        if (onSuccess) onSuccess();
        onClose();
    };

    const handleGuardarStep2 = async () => {
        if (
            !boxA ||
            !boxB ||
            totalStep1 < 0.005 ||
            totalStep2 < 0.005 ||
            hasStockIssueStep1 ||
            hasStockIssueStep2 ||
            savingExchange
        ) return;

        if (Math.abs(totalStep1 - totalStep2) >= 0.01) {
            toast.error('Los dos movimientos deben sumar el mismo importe');
            return;
        }

        if (isTpvCashBox(boxA) && isTpvCashBox(boxB)) {
            toast.error('Selecciona al menos una caja con efectivo físico');
            return;
        }

        setSavingExchange(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const exchangeGroupId = randomId();
            let legsSaved = 0;

            const insertExchange = async (fromBox: BoxOption, toBox: BoxOption, counts: Record<number, number>, directionLabel: string) => {
                const fromTpv = isTpvCashBox(fromBox);
                const toTpv = isTpvCashBox(toBox);
                if (fromTpv && toTpv) return;

                const breakdown = buildBreakdown(counts);
                const amount = ALL_DENOMS.reduce((acc, val) => acc + (val * (counts[val] || 0)), 0);
                if (amount < 0.005) return;

                const userId = user?.id ?? null;
                const groupMeta = { exchange_group_id: exchangeGroupId, user_id: userId };

                // TPV → caja física: solo entra efectivo en la caja real (sin fila en TPV)
                if (fromTpv && toBox.hasInventory) {
                    const { error } = await supabase.from('treasury_log').insert({
                        box_id: toBox.id,
                        type: 'IN',
                        amount,
                        breakdown,
                        notes: `${directionLabel} · visual ${fromBox.name}`,
                        ...groupMeta,
                    });
                    if (error) throw new Error(error.message);
                    legsSaved += 1;
                    return;
                }

                // Caja física → TPV: solo sale efectivo de la caja real (TPV solo visual)
                if (toTpv && fromBox.hasInventory) {
                    const { error } = await supabase.from('treasury_log').insert({
                        box_id: fromBox.id,
                        type: 'OUT',
                        amount,
                        breakdown,
                        notes: `${directionLabel} · visual ${toBox.name}`,
                        ...groupMeta,
                    });
                    if (error) throw new Error(error.message);
                    legsSaved += 1;
                    return;
                }

                if (!fromBox.hasInventory || !toBox.hasInventory) return;

                const { error } = await supabase.from('treasury_log').insert({
                    box_id: fromBox.id,
                    to_box_id: toBox.id,
                    type: 'EXCHANGE',
                    amount,
                    breakdown,
                    notes: directionLabel,
                    ...groupMeta,
                });
                if (error) throw new Error(error.message);
                legsSaved += 1;
            };

            // Paso 1: dinero que sale del origen → hacia destino
            await insertExchange(boxA, boxB, step1Counts, `Intercambio: Sale de ${boxA.name}`);

            // Paso 2: dinero que vuelve del destino → hacia origen
            await insertExchange(boxB, boxA, step2Counts, `Intercambio: Entra en ${boxA.name}`);

            if (legsSaved === 0) {
                toast.error('No hay importe que registrar en cajas físicas');
                return;
            }

            toast.success('Cambio entre cajas guardado');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Error al guardar');
        } finally {
            setSavingExchange(false);
        }
    };

    const DenomControl = ({ denom, count, side }: { denom: number, count: number, side: 'in' | 'out' }) => (
        <div className="relative">
            <DenominationStepper
                value={count}
                onAdjust={(delta) => handleAdjust(denom, side, delta)}
                onChange={(raw) => handleCountChange(denom, side, raw)}
                stockIssue={side === 'out' && count > (availableStock[denom] || 0)}
                ariaMinus={`${side === 'out' ? 'Quitar' : 'Añadir'} ${denom}`}
                ariaPlus={`${side === 'in' ? 'Añadir' : 'Quitar'} ${denom}`}
                minusClassName={side === 'in' ? 'hover:bg-emerald-50 hover:text-emerald-500' : undefined}
                plusClassName={side === 'in' ? 'hover:bg-emerald-50 hover:text-emerald-500' : undefined}
                inputClassName={
                    count > 0
                        ? (side === 'in' ? 'text-emerald-700' : 'text-rose-700')
                        : 'text-zinc-400'
                }
            />
            {side === 'out' && count > (availableStock[denom] || 0) && (
                <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-sm" />
            )}
        </div>
    );

    const resetExchangeLegs = () => {
        setStep('select');
        setStep1Counts({});
        setStep2Counts({});
        setStockA({});
        setStockB({});
        setZoomDenom(null);
        setLegDraftBeforeEdit(null);
    };

    const toggleBoxSelection = (opt: BoxOption) => {
        if (boxA?.id === opt.id) {
            setBoxA(boxB);
            setBoxB(null);
            resetExchangeLegs();
            return;
        }
        if (boxB?.id === opt.id) {
            setBoxB(null);
            resetExchangeLegs();
            return;
        }
        if (!boxA) {
            setBoxA(opt);
            resetExchangeLegs();
            return;
        }

        if (isTpvCashBox(boxA) && isTpvCashBox(opt)) {
            toast.error('Selecciona al menos una caja con efectivo físico');
            return;
        }

        setBoxB(opt);
        resetExchangeLegs();
    };

    const openLegEditor = (nextStep: 'step1' | 'step2') => {
        if (!boxA || !boxB) return;
        setLegDraftBeforeEdit({ ...(nextStep === 'step1' ? step1Counts : step2Counts) });
        setZoomDenom(null);
        setStep(nextStep);
    };

    const cancelLegEditor = () => {
        if (legDraftBeforeEdit) {
            if (step === 'step1') setStep1Counts(legDraftBeforeEdit);
            if (step === 'step2') setStep2Counts(legDraftBeforeEdit);
        }
        setLegDraftBeforeEdit(null);
        setZoomDenom(null);
        setStep('select');
    };

    const confirmLegEditor = () => {
        setLegDraftBeforeEdit(null);
        setZoomDenom(null);
        setStep('select');
    };

    // ——— Flujo legacy: una caja (SWAP) ———
    if (!useTwoBoxFlow) {
        return (
            <Modal
                open
                onClose={onClose}
                variant="standard"
                layer="base"
                instance="cash-change-single"
                usageId="cash-change-single"
                usageLabel="Cambio de caja"
                headerTitleAlign="left"
                title="Cambio"
                subtitle={boxName ? `Caja ${boxName}` : undefined}
                footer={
                    <CashCountFooter
                        total={totalIn}
                        instancePrefix="cash-change-single"
                        cancelLabel="Salir"
                        saveLabel={hasStockIssueLegacy ? 'Stock insuficiente' : 'Guardar'}
                        onCancel={onClose}
                        onSave={handleSubmitLegacy}
                        saveDisabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssueLegacy}
                    />
                }
            >
                    <div className="bg-[#36606F] py-2.5">
                        <div className="flex items-center justify-between gap-1.5 px-0.5">
                            <div className="flex-1 bg-black/10 rounded-2xl py-2 flex flex-col items-center border border-white/5">
                                <span className="text-[8px] font-black text-rose-300/60 uppercase tracking-widest mb-0.5">Sale</span>
                                <span className="text-base md:text-xl font-black text-rose-300 tabular-nums leading-none">{totalOut.toFixed(2)}€</span>
                            </div>
                            <div className="flex-1 bg-white/10 rounded-2xl py-2 flex flex-col items-center border border-white/10 shadow-inner">
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5">Dif:</span>
                                <div className={cn("text-xs md:text-sm font-black px-3 py-0.5 rounded-full", isBalanced ? "text-emerald-400" : "text-rose-400")}>
                                    {isBalanced ? "0.00€" : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}€`}
                                </div>
                            </div>
                            <div className="flex-1 bg-black/10 rounded-2xl py-2 flex flex-col items-center border border-white/5">
                                <span className="text-[8px] font-black text-emerald-300/60 uppercase tracking-widest mb-0.5">Entra</span>
                                <span className="text-base md:text-xl font-black text-emerald-300 tabular-nums leading-none">{totalIn.toFixed(2)}€</span>
                            </div>
                        </div>
                    </div>
                <QuickCashTools calculator breakdown />
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                        <div className="flex flex-col">
                            {ALL_DENOMS.map((denom) => (
                                <div key={denom} className="grid grid-cols-[1fr_80px_1fr] items-stretch border-b border-zinc-50 relative min-h-[72px]">
                                    <div className="flex justify-center items-center py-4 bg-rose-500/[0.06] border-r border-zinc-100/50">
                                        <DenomControl denom={denom} count={outCounts[denom] || 0} side="out" />
                                    </div>
                                    <div className="flex flex-col items-center justify-center px-2 py-2 bg-white z-10">
                                        <div className="relative h-6 w-9 flex items-center justify-center shrink-0 mb-1">
                                            <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={40} height={32} className="h-full w-auto object-contain drop-shadow-sm select-none" />
                                        </div>
                                        <span className="text-[11px] font-black text-zinc-800 leading-none">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                        {availableStock[denom] > 0 && <span className="text-[8px] font-bold text-zinc-400 uppercase mt-1">x{availableStock[denom]}</span>}
                                    </div>
                                    <div className="flex justify-center items-center py-4 bg-emerald-500/[0.06] border-l border-zinc-100/50">
                                        <DenomControl denom={denom} count={inCounts[denom] || 0} side="in" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
            </Modal>
        );
    }

    // ——— Flujo dos cajas: plano persistente + dos movimientos ———
    const positionedOptions = boxOptions
        .map((option) => ({ option, position: resolveCashChangePlanPosition(option) }))
        .filter((item): item is { option: BoxOption; position: PlanPoint } => item.position !== null);

    const isBalancedTransfer = totalStep1 > 0.005 && totalStep2 > 0.005 && Math.abs(totalStep1 - totalStep2) < 0.01;
    const canConfirmExchange = Boolean(
        boxA &&
        boxB &&
        isBalancedTransfer &&
        !hasStockIssueStep1 &&
        !hasStockIssueStep2 &&
        !savingExchange
    );
    const transferDifference = Math.abs(totalStep1 - totalStep2);

    const isEditingStep1 = step === 'step1';
    const activeFromBox = isEditingStep1 ? boxA : boxB;
    const activeToBox = isEditingStep1 ? boxB : boxA;
    const activeCounts = isEditingStep1 ? step1Counts : step2Counts;
    const setActiveCounts = isEditingStep1 ? setStep1Counts : setStep2Counts;
    const activeTotal = isEditingStep1 ? totalStep1 : totalStep2;
    const activeStock = isEditingStep1 ? stockA : stockB;
    const activeStockIssue = isEditingStep1 ? hasStockIssueStep1 : hasStockIssueStep2;
    const oppositeTotal = isEditingStep1 ? totalStep2 : totalStep1;

    return (
        <>
            <Modal
                open
                onClose={onClose}
                variant="work"
                layer="base"
                instance="cash-change-select"
                usageId="cash-change-select"
                usageLabel="Cambio de caja"
                title="Cambio"
                scheme="dark"
                headerTrailing={canViewExchangeHistory ? (
                    <button
                        type="button"
                        onClick={() => {
                            setStep('select');
                            setZoomDenom(null);
                            setShowExchangeHistoryModal(true);
                        }}
                        className="flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-white/70 shadow-none outline-none transition-opacity hover:opacity-100"
                        aria-label="Histórico de intercambios"
                    >
                        <Eye size={20} strokeWidth={2.4} className="stroke-current fill-none" />
                    </button>
                ) : undefined}
                scrollContent={false}
                fullBleedBody
                footer={
                    <>
                        <Button
                            type="button"
                            variant="secondary"
                            instance="cash-change-cancel"
                            onClick={onClose}
                        >
                            Cancelar
                        </Button>
                        <Button
                            type="button"
                            variant="primary"
                            instance="cash-change-save"
                            onClick={() => void handleGuardarStep2()}
                            disabled={!canConfirmExchange}
                            loading={savingExchange}
                        >
                            Guardar
                        </Button>
                    </>
                }
            >
                <div
                    data-design-exception="modal-root-padding:cambio-plano-con-margen-de-8px"
                    className="relative flex h-full min-h-0 w-full flex-col px-ds-2 pb-ds-2"
                >
                    <div
                        data-element="cash-change-summary"
                        className="mx-auto flex h-[8.75rem] w-full max-w-[480px] shrink-0 items-start justify-center gap-2 pb-2 sm:gap-4"
                    >
                        <div className="grid min-w-0 flex-1 grid-rows-[4.75rem_3rem] place-items-center gap-0.5">
                            <div className="flex min-w-0 max-w-full flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-ds-control">
                                    {boxA && cashChangePlanImage(boxA) ? (
                                        <Image
                                            src={cashChangePlanImage(boxA)!}
                                            alt=""
                                            width={64}
                                            height={64}
                                            unoptimized
                                            className="h-full w-full rounded-ds-control object-contain"
                                        />
                                    ) : boxA ? (
                                        <Wallet size={22} className="text-zinc-300" strokeWidth={2} />
                                    ) : null}
                                </div>
                                {boxA ? (
                                    <span className="max-w-full truncate px-1 text-center text-[11px] leading-4 text-white">
                                        {cashChangePlanDisplayLabel(boxA)}
                                    </span>
                                ) : null}
                            </div>
                            <div data-element="cash-change-add-action" className="flex h-12 items-center justify-center">
                                {boxA && boxB ? (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="cash-change-add-first-amount"
                                        aria-label={`Añadir cantidad de ${boxA.name} a ${boxB.name}`}
                                        onClick={() => openLegEditor('step1')}
                                    >
                                        Añadir cantidad
                                    </Button>
                                ) : null}
                            </div>
                        </div>

                        <div
                            data-element="cash-change-arrows"
                            className={cn(
                                'grid w-24 shrink-0 grid-rows-[1.25rem_1.75rem_1.25rem_1.75rem_1.25rem] place-items-center sm:w-32',
                                boxA && boxB ? 'opacity-100' : 'opacity-0',
                            )}
                        >
                            <div data-element="cash-change-forward-amount" className="flex h-5 items-center justify-center">
                                {totalStep1 > 0.005 ? (
                                    <span className="text-[11px] font-bold tabular-nums text-white">
                                        {formatExchangeAmount(totalStep1)}
                                    </span>
                                ) : null}
                            </div>

                            <svg viewBox="0 0 128 28" className="h-7 w-full overflow-visible" aria-hidden>
                                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M8 18 C39 5 88 5 118 16" stroke="#15998c" strokeWidth="4.2" />
                                    <path d="M106 5 L122 16 L107 27" stroke="#15998c" strokeWidth="4.2" />
                                </g>
                            </svg>

                            <div aria-hidden />

                            <svg viewBox="0 0 128 28" className="h-7 w-full overflow-visible" aria-hidden>
                                <g fill="none" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M120 10 C89 23 40 23 10 12" stroke="#e85d75" strokeWidth="4.2" />
                                    <path d="M22 1 L6 12 L21 23" stroke="#e85d75" strokeWidth="4.2" />
                                </g>
                            </svg>

                            <div data-element="cash-change-reverse-amount" className="flex h-5 items-center justify-center">
                                {totalStep2 > 0.005 ? (
                                    <span className="text-[11px] font-bold tabular-nums text-white">
                                        {formatExchangeAmount(totalStep2)}
                                    </span>
                                ) : null}
                            </div>
                        </div>

                        <div className="grid min-w-0 flex-1 grid-rows-[4.75rem_3rem] place-items-center gap-0.5">
                            <div className="flex min-w-0 max-w-full flex-col items-center">
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-ds-control">
                                    {boxB && cashChangePlanImage(boxB) ? (
                                        <Image
                                            src={cashChangePlanImage(boxB)!}
                                            alt=""
                                            width={64}
                                            height={64}
                                            unoptimized
                                            className="h-full w-full rounded-ds-control object-contain"
                                        />
                                    ) : boxB ? (
                                        <Wallet size={22} className="text-zinc-300" strokeWidth={2} />
                                    ) : null}
                                </div>
                                {boxB ? (
                                    <span className="max-w-full truncate px-1 text-center text-[11px] leading-4 text-white">
                                        {cashChangePlanDisplayLabel(boxB)}
                                    </span>
                                ) : null}
                            </div>
                            <div data-element="cash-change-add-action" className="flex h-12 items-center justify-center">
                                {boxA && boxB ? (
                                    <Button
                                        type="button"
                                        variant="primary"
                                        instance="cash-change-add-second-amount"
                                        aria-label={`Añadir cantidad de ${boxB.name} a ${boxA.name}`}
                                        onClick={() => openLegEditor('step2')}
                                    >
                                        Añadir cantidad
                                    </Button>
                                ) : null}
                            </div>
                        </div>
                    </div>

                    <div
                        ref={planViewportRef}
                        data-element="cash-change-plan"
                        data-design-exception="cash-change-plan-radius:igual-al-contorno-del-modal"
                        className="relative mx-auto aspect-[2048/1084] w-full max-w-[1136px] shrink-0 touch-none overflow-hidden rounded-ds-superficie border border-white/70 bg-zinc-100"
                        tabIndex={0}
                        role="region"
                        aria-label="Plano de cajas: usa la rueda o pellizca para ampliar y arrastra para desplazarte"
                        onKeyDown={(event) => {
                            if (event.target !== event.currentTarget) return;
                            const rect = event.currentTarget.getBoundingClientRect();
                            const center = { x: rect.width / 2, y: rect.height / 2 };
                            if (event.key === '+' || event.key === '=') {
                                event.preventDefault();
                                updatePlanView(zoomPlanAt(planViewRef.current, planViewRef.current.zoom * 1.2, center, rect.width, rect.height));
                            } else if (event.key === '-') {
                                event.preventDefault();
                                updatePlanView(zoomPlanAt(planViewRef.current, planViewRef.current.zoom / 1.2, center, rect.width, rect.height));
                            } else if (event.key.startsWith('Arrow') && planViewRef.current.zoom > 1) {
                                event.preventDefault();
                                const delta = 48;
                                updatePlanView(clampPlanView({
                                    ...planViewRef.current,
                                    x: planViewRef.current.x + (event.key === 'ArrowLeft' ? delta : event.key === 'ArrowRight' ? -delta : 0),
                                    y: planViewRef.current.y + (event.key === 'ArrowUp' ? delta : event.key === 'ArrowDown' ? -delta : 0),
                                }, rect.width, rect.height));
                            }
                        }}
                        onPointerDown={handlePlanPointerDown}
                        onPointerMove={handlePlanPointerMove}
                        onPointerUp={handlePlanPointerEnd}
                        onPointerCancel={handlePlanPointerEnd}
                        onClickCapture={(event) => {
                            if (planDraggedRef.current) {
                                event.preventDefault();
                                event.stopPropagation();
                                planDraggedRef.current = false;
                            }
                        }}
                    >
                        <div
                            className="absolute inset-0 origin-top-left"
                            style={{ transform: `translate(${planView.x}px, ${planView.y}px) scale(${planView.zoom})` }}
                        >
                            <Image
                                src="/images/cash-change-plan.avif"
                                alt="Plano de cajas"
                                fill
                                priority
                                unoptimized
                                sizes="(max-width: 1200px) calc(100vw - 1rem), 1136px"
                                className={cn(
                                    'select-none object-cover transition-opacity duration-200',
                                    boxA ? 'opacity-40' : 'opacity-90',
                                )}
                            />

                            {positionedOptions.map(({ option, position }) => {
                                const key = cashChangePlanKey(option);
                                const image = cashChangePlanImage(option);
                                if (!key || !image) return null;
                                const isA = boxA?.id === option.id;
                                const isB = boxB?.id === option.id;
                                const isSelected = isA || isB;
                                const shouldDim = Boolean(boxA && boxB && !isSelected);
                                const size = CASH_CHANGE_PLAN_ASSET_SIZES[key];
                                const topLabel = key === 'inicial' || key === 'cambio2'
                                    ? CASH_CHANGE_PLAN_TOP_LABELS[key]
                                    : null;

                                return (
                                    <Fragment key={`${option.id}-asset`}>
                                        <div
                                            aria-hidden
                                            className={cn(
                                                'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 origin-center transition-[opacity,transform] duration-200',
                                                isSelected ? 'scale-[1.06]' : 'scale-100',
                                                shouldDim ? 'opacity-25' : 'opacity-100',
                                            )}
                                            style={{
                                                left: position.x + '%',
                                                top: position.y + '%',
                                                width: CASH_CHANGE_PLAN_WIDTHS[key] + '%',
                                            }}
                                        >
                                            <Image
                                                src={image}
                                                alt=""
                                                width={size.width}
                                                height={size.height}
                                                unoptimized
                                                className="h-auto w-full select-none object-contain"
                                            />
                                            {!topLabel ? (
                                                <span
                                                    data-element="cash-change-plan-label"
                                                    className="absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm"
                                                >
                                                    {cashChangePlanDisplayLabel(option)}
                                                </span>
                                            ) : null}
                                        </div>
                                        {topLabel ? (
                                            <span
                                                data-element="cash-change-plan-label"
                                                aria-hidden
                                                className={cn(
                                                    'pointer-events-none absolute z-10 -translate-x-1/2 truncate rounded-md bg-red-500 px-0.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white shadow-sm transition-[opacity,transform] duration-200',
                                                    isSelected ? 'scale-[1.06]' : 'scale-100',
                                                    shouldDim ? 'opacity-25' : 'opacity-100',
                                                )}
                                                style={{ left: topLabel.x + '%', top: topLabel.y + '%', maxWidth: 'calc(20% - 4px)' }}
                                            >
                                                {cashChangePlanDisplayLabel(option)}
                                            </span>
                                        ) : null}
                                    </Fragment>
                                );
                            })}

                            {positionedOptions.map(({ option, position }) => {
                                const isA = boxA?.id === option.id;
                                const isB = boxB?.id === option.id;
                                return (
                                    <button
                                        key={option.id}
                                        type="button"
                                        onClick={() => toggleBoxSelection(option)}
                                        aria-label={option.name}
                                        aria-pressed={isA || isB}
                                        data-plan-box={cashChangePlanKey(option) ?? undefined}
                                        className="absolute z-20 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-xl border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-20 sm:w-24"
                                        style={{ left: position.x + '%', top: position.y + '%' }}
                                    />
                                );
                            })}
                        </div>
                    </div>

                    <div className="flex h-6 shrink-0 items-center justify-center pt-1">
                        {boxA && boxB && totalStep1 > 0.005 && totalStep2 > 0.005 && !isBalancedTransfer ? (
                            <span className="rounded-full border border-white/70 bg-[#0b213c]/90 px-2.5 py-1 text-[9px] font-black tabular-nums text-white shadow-lg backdrop-blur-sm sm:text-[10px]">
                                Δ {formatExchangeAmount(transferDifference)}
                            </span>
                        ) : null}
                    </div>
                </div>
            </Modal>

            <Modal
                open={step !== 'select' && Boolean(boxA && boxB)}
                onClose={cancelLegEditor}
                variant="amplify"
                layer="derived"
                instance="cash-change-leg"
                parentInstance="cash-change-select"
                usageId="cash-change-leg"
                usageLabel="Desglose de cambio"
                title="Cambio"
                footer={
                    <CashCountFooter
                        total={activeTotal}
                        instancePrefix="cash-change-leg"
                        cancelLabel="Cancelar"
                        saveLabel="Confirmar"
                        onCancel={cancelLegEditor}
                        onSave={confirmLegEditor}
                        saveDisabled={Boolean(activeStockIssue)}
                        extra={
                            activeStockIssue ? (
                                <span className="text-[10px] font-bold uppercase tracking-tight text-rose-500">
                                    Stock insuficiente
                                </span>
                            ) : null
                        }
                    />
                }
            >
                {activeFromBox && activeToBox ? (
                    <>
                        <QuickCashTools calculator breakdown />

                        <div className="flex min-h-0 flex-1 flex-col bg-white">
                            <div className="flex shrink-0 items-center justify-center gap-3 border-b border-zinc-100 px-3 py-2">
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <div className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 p-0.5">
                                        {cashChangePlanImage(activeFromBox) ? (
                                            <Image src={cashChangePlanImage(activeFromBox)!} alt="" width={32} height={26} className="h-full w-full object-contain" />
                                        ) : (
                                            <Wallet size={15} className="text-[#36606F]" />
                                        )}
                                    </div>
                                    <span className="max-w-20 truncate text-[9px] font-black uppercase text-zinc-700">{activeFromBox.name}</span>
                                </div>

                                <ArrowRight className={cn('h-7 w-7 shrink-0', isEditingStep1 ? 'text-[#23a89a]' : 'text-rose-400')} strokeWidth={2.5} />

                                <div className="flex min-w-0 items-center gap-1.5">
                                    <div className="flex h-8 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 p-0.5">
                                        {cashChangePlanImage(activeToBox) ? (
                                            <Image src={cashChangePlanImage(activeToBox)!} alt="" width={32} height={26} className="h-full w-full object-contain" />
                                        ) : (
                                            <Wallet size={15} className="text-[#36606F]" />
                                        )}
                                    </div>
                                    <span className="max-w-20 truncate text-[9px] font-black uppercase text-zinc-700">{activeToBox.name}</span>
                                </div>

                                {oppositeTotal > 0.005 ? (
                                    <span
                                        className={cn(
                                            'ml-1 rounded-full px-2 py-1 text-[9px] font-black tabular-nums',
                                            Math.abs(activeTotal - oppositeTotal) < 0.01
                                                ? 'bg-emerald-50 text-emerald-600'
                                                : 'bg-zinc-100 text-zinc-500',
                                        )}
                                    >
                                        = {formatExchangeAmount(oppositeTotal)}
                                    </span>
                                ) : null}
                            </div>

                            {zoomDenom !== null ? (
                                <DenominationZoomModal
                                    isOpen
                                    onClose={() => setZoomDenom(null)}
                                    denomination={zoomDenom}
                                    value={activeCounts[zoomDenom] || 0}
                                    onValueChange={(value) => setActiveCounts((prev) => ({ ...prev, [zoomDenom]: value }))}
                                    availableStock={activeFromBox.hasInventory ? (activeStock[zoomDenom] || 0) : undefined}
                                    layer="system"
                                />
                            ) : null}

                            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-2">
                                <DenominationCountGrid
                                    counts={activeCounts}
                                    onAdjust={(denom, delta) => handleAdjustTransfer(denom, activeCounts, setActiveCounts, delta)}
                                    onChange={(denom, raw) => handleCountChangeTransfer(denom, raw, setActiveCounts)}
                                    availableStock={activeFromBox.hasInventory ? activeStock : undefined}
                                    onZoom={setZoomDenom}
                                    showAvailable={Boolean(activeFromBox.hasInventory)}
                                />
                            </div>
                        </div>
                    </>
                ) : null}
            </Modal>

            <Modal
                open={showExchangeHistoryModal && !selectedExchangeDetail}
                onClose={() => { setShowExchangeHistoryModal(false); setSelectedExchangeDetail(null); }}
                variant="standard"
                layer="derived"
                instance="cash-change-history"
                parentInstance="cash-change-select"
                usageId="cash-change-history"
                usageLabel="Histórico de intercambios"
                headerTitleAlign="left"
                title="Histórico de intercambios"
                headerTrailing={
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setExchangeHistoryYearMonth(prev => {
                                const m = prev.month === 1 ? 12 : prev.month - 1;
                                const y = prev.month === 1 ? prev.year - 1 : prev.year;
                                return { year: y, month: m };
                            })}
                            className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                            aria-label="Mes anterior"
                        >
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>
                        <span className="text-zinc-700 font-bold text-sm min-w-[7.5rem] text-center">
                            {new Date(exchangeHistoryYearMonth.year, exchangeHistoryYearMonth.month - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                        </span>
                        <button
                            type="button"
                            onClick={() => setExchangeHistoryYearMonth(prev => {
                                const m = prev.month === 12 ? 1 : prev.month + 1;
                                const y = prev.month === 12 ? prev.year + 1 : prev.year;
                                return { year: y, month: m };
                            })}
                            className="relative flex h-full w-[var(--modal-header-height)] max-h-full min-h-0 shrink-0 items-center justify-center border-0 bg-transparent text-zinc-700 shadow-none outline-none before:absolute before:inset-0 before:-m-[6px] before:min-h-12 before:min-w-12 before:content-['']"
                            aria-label="Mes siguiente"
                        >
                            <ChevronRight size={20} strokeWidth={3} />
                        </button>
                    </div>
                }
            >
                        <div>
                            {exchangeHistoryLoading ? (
                                <p className="text-center text-zinc-500 text-sm">Cargando...</p>
                            ) : exchangeHistoryList.length === 0 ? (
                                <EmptyState
                                    instance="cash-change-history-empty"
                                    variant="none"
                                    title="No hay intercambios en este mes"
                                />
                            ) : (
                                <ul className="space-y-2">
                                    {exchangeHistoryList.map((item) => (
                                        <li
                                            key={item.exchange_group_id}
                                            role="button"
                                            onClick={() => setSelectedExchangeDetail(item)}
                                            className="flex items-center justify-between gap-2 p-3 rounded-xl border border-zinc-200 hover:bg-zinc-50 hover:border-[#5B8FB9]/30 transition-all cursor-pointer"
                                        >
                                            <span className="text-[10px] text-zinc-500">
                                                {new Date(item.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <span className="font-bold text-zinc-800 truncate">{firstGivenName(item.first_name)}</span>
                                            <span className="font-black text-zinc-800 tabular-nums">{item.amount.toFixed(2)}€</span>
                                            <span className="text-[10px] text-zinc-600 truncate">{item.from_box_name} → {item.to_box_name}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
            </Modal>

            <Modal
                open={showExchangeHistoryModal && !!selectedExchangeDetail}
                onClose={() => setSelectedExchangeDetail(null)}
                variant="standard"
                layer="derived"
                instance="cash-change-history-detail"
                usageId="cash-change-history-detail"
                usageLabel="Desglose del intercambio"
                headerTitleAlign="left"
                title="Desglose del intercambio"
            >
                <div>
                    {selectedExchangeDetail ? (
                        <div className="space-y-4">
                            {selectedExchangeDetail.legs.map((leg, idx) => (
                                <div key={idx} className="bg-zinc-50 rounded-xl p-3 border border-zinc-100">
                                    <p className="text-[10px] font-black text-zinc-500 uppercase mb-2">{leg.from_box_name} → {leg.to_box_name} ({leg.amount.toFixed(2)}€)</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Object.entries(leg.breakdown).filter(([, q]) => Number(q) > 0).map(([denom, q]) => (
                                            <span key={denom} className="text-xs font-bold text-zinc-700 bg-white px-2 py-1 rounded">
                                                {Number(denom) >= 1 ? `${denom}€` : `${(Number(denom) * 100).toFixed(0)}c`}: {q}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                </div>
            </Modal>
        </>
    );

};
