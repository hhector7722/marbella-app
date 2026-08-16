'use client';

import { useState, useEffect } from 'react';
import { X, Minus, Plus, ArrowRight, ArrowLeft, Eye, ChevronLeft, ChevronRight, Wallet } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { DenominationZoomModal } from '@/components/ui/DenominationZoomModal';

import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

const BILLS = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
const ALL_DENOMS = [...BILLS, ...COINS];

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
    // Histórico de intercambios (solo manager)
    const [showExchangeHistoryModal, setShowExchangeHistoryModal] = useState(false);
    const [exchangeHistoryYearMonth, setExchangeHistoryYearMonth] = useState(() => {
        const d = new Date();
        return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
    const [exchangeHistoryList, setExchangeHistoryList] = useState<ExchangeHistoryItem[]>([]);
    const [exchangeHistoryLoading, setExchangeHistoryLoading] = useState(false);
    const [selectedExchangeDetail, setSelectedExchangeDetail] = useState<ExchangeHistoryItem | null>(null);
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [zoomDenom, setZoomDenom] = useState<number | null>(null);
    const [canViewExchangeHistory, setCanViewExchangeHistory] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (cancelled) return;
            setCanViewExchangeHistory(isMasterDashboardUser(user?.email));
        })();
        return () => { cancelled = true; };
    }, [supabase]);

    useEffect(() => {
        if (!useTwoBoxFlow && boxId) {
            const fetchStock = async () => {
                const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxId).gt('quantity', 0);
                const stock: Record<number, number> = {};
                data?.forEach((d: any) => stock[Number(d.denomination)] = d.quantity);
                setAvailableStock(stock);
                setLoadingStock(false);
            };
            fetchStock();
        } else {
            setLoadingStock(false);
        }
    }, [useTwoBoxFlow, boxId, supabase]);

    useEffect(() => {
        if (!useTwoBoxFlow || step !== 'step1' || !boxA?.hasInventory || !boxA.id) return;
        if (isTpvCashBox(boxA)) return;
        const fetchStock = async () => {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxA.id).gt('quantity', 0);
            const s: Record<number, number> = {};
            data?.forEach((d: any) => s[Number(d.denomination)] = d.quantity);
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
            data?.forEach((d: any) => s[Number(d.denomination)] = d.quantity);
            setStockB(s);
        };
        fetchStock();
    }, [useTwoBoxFlow, step, boxB?.id, boxB?.hasInventory, supabase]);

    useEffect(() => {
        if (!showExchangeHistoryModal || !useTwoBoxFlow) return;
        const { year, month } = exchangeHistoryYearMonth;
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59, 999);
        setExchangeHistoryLoading(true);
        (async () => {
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

    const handleSiguiente = () => {
        if (!boxA || !boxB || totalStep1 < 0.005 || hasStockIssueStep1) return;
        setStep('step2');
    };

    const handleGuardarStep2 = async () => {
        if (!boxA || !boxB || totalStep2 < 0.005 || hasStockIssueStep2) return;

        if (isTpvCashBox(boxA) && isTpvCashBox(boxB)) {
            toast.error('Selecciona al menos una caja con efectivo físico');
            return;
        }

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const exchangeGroupId = crypto.randomUUID();
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
        } catch (e: any) {
            toast.error(e.message || 'Error al guardar');
        }
    };

    const DenomControl = ({ denom, count, side }: { denom: number, count: number, side: 'in' | 'out' }) => (
        <div className="flex items-center justify-between w-[84px] h-9 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20 mx-auto">
            <button
                onClick={() => handleAdjust(denom, side, -1)}
                type="button"
                className={cn(
                    "w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0 min-h-[44px]",
                    side === 'in' ? "hover:bg-emerald-50 hover:text-emerald-500" : "hover:bg-rose-50 hover:text-rose-500"
                )}
            >
                <Minus size={14} strokeWidth={3} />
            </button>
            <input
                type="number"
                min="0"
                value={count || ''}
                onChange={(e) => handleCountChange(denom, side, e.target.value)}
                placeholder="0"
                className={cn(
                    "flex-1 w-0 h-full bg-transparent text-center font-black outline-none p-0 text-[10px] tracking-tighter tabular-nums transition-colors focus:bg-blue-50/20",
                    count > 0 ? (side === 'in' ? "text-emerald-700" : "text-rose-700") : "text-zinc-400"
                )}
            />
            <button
                onClick={() => handleAdjust(denom, side, 1)}
                type="button"
                className={cn(
                    "w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0 min-h-[44px]",
                    side === 'in' ? "hover:bg-emerald-50 hover:text-emerald-500" : "hover:bg-rose-50 hover:text-rose-500"
                )}
            >
                <Plus size={14} strokeWidth={3} />
            </button>
        </div>
    );

    const toggleBoxSelection = (opt: BoxOption) => {
        if (boxA?.id === opt.id) {
            setBoxA(null);
            return;
        }
        if (boxB?.id === opt.id) {
            setBoxB(null);
            return;
        }
        if (!boxA) {
            setBoxA(opt);
            return;
        }
        if (!boxB && opt.id !== boxA.id) {
            setBoxB(opt);
        }
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
                headerTone="petroleum"
                headerTitleAlign="left"
                title="Cambio"
                subtitle={boxName ? `Caja ${boxName}` : undefined}
                footer={
                    <div className="flex w-full flex-col gap-2">
                        <div className="flex gap-2 w-full">
                            <Button
                                type="button"
                                variant="primary"
                                // fill explícito: acción primaria de canje ocupa 2/3 frente a salir
                                layout="fill"
                                instance="cash-change-single-save"
                                className="flex-[2]"
                                onClick={handleSubmitLegacy}
                                disabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssueLegacy}
                            >
                                {hasStockIssueLegacy ? 'STOCK INSUFICIENTE' : 'GUARDAR'}
                            </Button>
                            <Button
                                type="button"
                                variant="secondary"
                                // fill explícito: pareja proporcional con la acción primaria (1/3)
                                layout="fill"
                                instance="cash-change-single-exit"
                                className="flex-1"
                                icon={<X strokeWidth={3} />}
                                onClick={onClose}
                            >
                                SALIR
                            </Button>
                        </div>
                        {hasStockIssueLegacy && (
                            <p className="text-center text-[10px] font-bold text-rose-500 uppercase tracking-tight italic">
                                No hay suficiente stock en caja para realizar este cambio
                            </p>
                        )}
                    </div>
                }
            >
                    <div className="bg-[#36606F] px-4 py-2.5">
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
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                    <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                    <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                        <div className="flex flex-col">
                            {ALL_DENOMS.map((denom) => (
                                <div key={denom} className="grid grid-cols-[1fr_80px_1fr] items-stretch border-b border-zinc-50 relative min-h-[72px]">
                                    <div className="flex justify-center items-center py-4 bg-rose-500/[0.06] border-r border-zinc-100/50">
                                        <div className="relative">
                                            <DenomControl denom={denom} count={outCounts[denom] || 0} side="out" />
                                            {outCounts[denom] > (availableStock[denom] || 0) && (
                                                <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-sm" />
                                            )}
                                        </div>
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

    // ——— Flujo dos cajas: selector ———
    if (step === 'select') {
        const canContinue = boxA && boxB && boxA.id !== boxB.id;
        
        // Ensure specific order: TPV 1, TPV 2, Inicial, Cambio 1, Cambio 2
        const orderWeight = (name: string) => {
            const lower = name.toLowerCase();
            if (lower.includes('tpv 1')) return 1;
            if (lower.includes('tpv 2')) return 2;
            if (lower.includes('inicial')) return 3;
            if (lower.includes('cambio 1')) return 4;
            if (lower.includes('cambio 2')) return 5;
            return 99;
        };
        const sortedOptions = [...boxOptions].sort((a, b) => orderWeight(a.name) - orderWeight(b.name));

        return (
            <>
            <Modal
                open
                onClose={onClose}
                variant="standard"
                layer="base"
                instance="cash-change-select"
                usageId="cash-change-select"
                usageLabel="Cambio de caja"
                headerTone="petroleum"
                headerTitleAlign="left"
                title="Cambio"
                headerTrailing={canViewExchangeHistory ? (
                    <button
                        type="button"
                        onClick={() => {
                            setCalculatorOpen(false);
                            setZoomDenom(null);
                            setShowExchangeHistoryModal(true);
                        }}
                        className="flex h-full min-w-ds-tactil items-center justify-center border-0 bg-transparent text-white opacity-90 shadow-none outline-none transition-opacity hover:opacity-100"
                        aria-label="Histórico de intercambios"
                    >
                        <Eye size={22} strokeWidth={2.5} className="stroke-current fill-none" />
                    </button>
                ) : undefined}
                footer={
                    <Button
                        type="button"
                        variant="primary"
                        instance="cash-change-select-next"
                        onClick={() => canContinue && setStep('step1')}
                        disabled={!canContinue}
                    >
                        Siguiente
                    </Button>
                }
            >
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                    <div className="flex-1 overflow-y-auto bg-white p-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-3">
                                <h3 className="text-[12px] font-black uppercase text-center text-[#36606F]">Origen</h3>
                                {sortedOptions.map((opt) => {
                                    const isA = boxA?.id === opt.id;
                                    return (
                                        <button
                                            key={`origen-${opt.id}`}
                                            type="button"
                                            onClick={() => setBoxA(isA ? null : opt)}
                                            className={cn(
                                                'flex w-full min-h-[72px] flex-col items-center justify-center gap-1.5 border-0 bg-transparent p-1 text-center font-black text-[10px] uppercase tracking-wide shadow-none transition-all active:scale-95',
                                                isA ? 'text-[#36606F]' : 'text-zinc-500',
                                                boxB?.id === opt.id && !isA ? 'opacity-30' : '',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all',
                                                    isA ? 'bg-[#b5cdd6] ring-2 ring-[#36606F]/25' : 'bg-[#dce8ec]',
                                                )}
                                            >
                                                {opt.image_url ? (
                                                    <Image src={opt.image_url} alt={opt.name} width={44} height={44} className="h-full w-full object-contain" />
                                                ) : (
                                                    <Wallet size={20} className={cn('transition-colors', isA ? 'text-[#36606F]/85' : 'text-[#36606F]/45')} strokeWidth={2.5} />
                                                )}
                                            </div>
                                            <span className="truncate w-full font-black text-[9px] tracking-tight">{opt.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="flex flex-col gap-3">
                                <h3 className="text-[12px] font-black uppercase text-center text-[#36606F]">Destino</h3>
                                {sortedOptions.map((opt) => {
                                    const isB = boxB?.id === opt.id;
                                    return (
                                        <button
                                            key={`destino-${opt.id}`}
                                            type="button"
                                            onClick={() => setBoxB(isB ? null : opt)}
                                            className={cn(
                                                'flex w-full min-h-[72px] flex-col items-center justify-center gap-1.5 border-0 bg-transparent p-1 text-center font-black text-[10px] uppercase tracking-wide shadow-none transition-all active:scale-95',
                                                isB ? 'text-rose-700/90' : 'text-zinc-500',
                                                boxA?.id === opt.id && !isB ? 'opacity-30' : '',
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    'flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full transition-all',
                                                    isB ? 'bg-rose-200 ring-2 ring-rose-300/50' : 'bg-rose-100',
                                                )}
                                            >
                                                {opt.image_url ? (
                                                    <Image src={opt.image_url} alt={opt.name} width={44} height={44} className="h-full w-full object-contain" />
                                                ) : (
                                                    <Wallet size={20} className={cn('transition-colors', isB ? 'text-rose-600/75' : 'text-rose-400/55')} strokeWidth={2.5} />
                                                )}
                                            </div>
                                            <span className="truncate w-full font-black text-[9px] tracking-tight">{opt.name}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                        {boxA && boxB && boxA.id === boxB.id && (
                            <p className="text-rose-600 text-[10px] font-bold mt-4 text-center">Elige dos cajas distintas</p>
                        )}
                    </div>
            </Modal>

            <Modal
                open={showExchangeHistoryModal}
                onClose={() => { setShowExchangeHistoryModal(false); setSelectedExchangeDetail(null); }}
                variant="standard"
                layer="derived"
                instance="cash-change-history"
                usageId="cash-change-history"
                usageLabel={selectedExchangeDetail ? 'Desglose del intercambio' : 'Histórico de intercambios'}
                headerTone="petroleum"
                headerTitleAlign="left"
                title={selectedExchangeDetail ? 'Desglose del intercambio' : 'Histórico de intercambios'}
                onBack={selectedExchangeDetail ? () => setSelectedExchangeDetail(null) : undefined}
                headerTrailing={!selectedExchangeDetail ? (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setExchangeHistoryYearMonth(prev => {
                                const m = prev.month === 1 ? 12 : prev.month - 1;
                                const y = prev.month === 1 ? prev.year - 1 : prev.year;
                                return { year: y, month: m };
                            })}
                            className="flex h-full min-w-ds-tactil items-center justify-center border-0 bg-transparent text-white shadow-none outline-none"
                            aria-label="Mes anterior"
                        >
                            <ChevronLeft size={20} strokeWidth={3} />
                        </button>
                        <span className="text-white font-bold text-sm min-w-[7.5rem] text-center">
                            {new Date(exchangeHistoryYearMonth.year, exchangeHistoryYearMonth.month - 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}
                        </span>
                        <button
                            type="button"
                            onClick={() => setExchangeHistoryYearMonth(prev => {
                                const m = prev.month === 12 ? 1 : prev.month + 1;
                                const y = prev.month === 12 ? prev.year + 1 : prev.year;
                                return { year: y, month: m };
                            })}
                            className="flex h-full min-w-ds-tactil items-center justify-center border-0 bg-transparent text-white shadow-none outline-none"
                            aria-label="Mes siguiente"
                        >
                            <ChevronRight size={20} strokeWidth={3} />
                        </button>
                    </div>
                ) : undefined}
            >
                        <div className="p-4">
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
                            ) : exchangeHistoryLoading ? (
                                <p className="text-center text-zinc-500 text-sm">Cargando...</p>
                            ) : exchangeHistoryList.length === 0 ? (
                                <p className="text-center text-zinc-500 text-sm">No hay intercambios en este mes.</p>
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
                                            <span className="font-bold text-zinc-800 truncate">{item.first_name}</span>
                                            <span className="font-black text-zinc-800 tabular-nums">{item.amount.toFixed(2)}€</span>
                                            <span className="text-[10px] text-zinc-600 truncate">{item.from_box_name} → {item.to_box_name}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
            </Modal>
            </>
        );
    }

    // ——— Flujo dos cajas: paso 1 (De A a B) o paso 2 (De B a A) ———
    const isStep1 = step === 'step1';
    const fromBox = isStep1 ? boxA! : boxB!;
    const toBox = isStep1 ? boxB! : boxA!;
    const directionLabel = isStep1 ? `De ${boxA!.name} a ${boxB!.name}` : `De ${boxB!.name} a ${boxA!.name}`;
    const counts = isStep1 ? step1Counts : step2Counts;
    const setCounts = isStep1 ? setStep1Counts : setStep2Counts;
    const total = isStep1 ? totalStep1 : totalStep2;
    const stock = isStep1 ? stockA : stockB;
    const hasStockIssue = isStep1 ? hasStockIssueStep1 : hasStockIssueStep2;

    const titleText = isStep1 ? `Dinero que sale de ${boxA?.name}` : `Dinero que entra en ${boxA?.name}`;

    return (
        <Modal
            open
            onClose={onClose}
            variant="amplify"
            layer="base"
            instance="cash-change-count"
            usageId="cash-change-count"
            usageLabel="Cambio de caja"
            headerTone="petroleum"
            headerTitleAlign="left"
            title="Cambio"
        >
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-2 flex flex-col">
                    <div className="flex justify-center mb-3 mt-1 relative">
                        <div className={cn("px-4 py-1.5 rounded-xl flex items-center", isStep1 ? "bg-rose-500" : "bg-emerald-500")}>
                            <span className="text-[14px] md:text-base font-black text-white text-center leading-tight tracking-tight drop-shadow-sm">
                                {titleText}
                            </span>
                        </div>
                        {boxA?.image_url && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl overflow-hidden bg-white flex items-center justify-center">
                                <Image src={boxA.image_url} alt={boxA.name} width={40} height={40} className="w-full h-full object-contain" />
                            </div>
                        )}
                    </div>

                    {zoomDenom !== null && (
                        <DenominationZoomModal
                            isOpen={true}
                            onClose={() => setZoomDenom(null)}
                            denomination={zoomDenom}
                            value={counts[zoomDenom] || 0}
                            onValueChange={(v) => setCounts(prev => ({ ...prev, [zoomDenom]: v }))}
                            availableStock={fromBox?.hasInventory ? (stock[zoomDenom] || 0) : undefined}
                        />
                    )}
                    <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                        {DENOMINATIONS.map((denom) => {
                            const count = counts[denom] || 0;
                            const hasStockIssue = !!fromBox?.hasInventory && count > (stock[denom] || 0);
                            return (
                                <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                                    <div
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => setZoomDenom(denom)}
                                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setZoomDenom(denom); }}
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
                                            "flex items-center justify-between w-full h-10 min-h-[44px] bg-white border rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1",
                                            hasStockIssue
                                                ? "border-rose-300 focus-within:border-rose-400 focus-within:ring-rose-200"
                                                : "border-zinc-200 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20"
                                        )}>
                                            <button
                                                type="button"
                                                onClick={() => handleAdjustTransfer(denom, {} as any, setCounts, -1)}
                                                className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0"
                                            >
                                                <Minus size={14} strokeWidth={3} />
                                            </button>
                                            <input
                                                type="number"
                                                min={0}
                                                value={count || ''}
                                                onChange={(e) => handleCountChangeTransfer(denom, e.target.value, setCounts)}
                                                placeholder=""
                                                className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none p-0 text-[10px] tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => handleAdjustTransfer(denom, {} as any, setCounts, 1)}
                                                className="w-6 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0"
                                            >
                                                <Plus size={14} strokeWidth={3} />
                                            </button>
                                        </div>
                                        {fromBox?.hasInventory && (stock[denom] || 0) > 0 && (
                                            <span className="text-[7px] font-bold text-gray-400 uppercase mt-1 block">Disp: {stock[denom]}</span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {/* Botones en la misma fila que 1c (última fila del grid) */}
                        <div className="self-stretch flex flex-col justify-end">
                            <div className="w-full h-10 min-h-[48px] bg-emerald-50 border border-emerald-200 rounded-xl flex flex-col items-center justify-center shadow-sm relative overflow-hidden">
                                <span className="text-[8px] font-black text-emerald-600/70 uppercase tracking-widest leading-none mb-0.5">Total</span>
                                <span className="text-[12px] font-black text-emerald-700 tabular-nums leading-none tracking-tighter">{total.toFixed(2)}€</span>
                            </div>
                        </div>
                        <div className="self-stretch flex flex-col justify-end">
                            {isStep1 ? (
                                <button
                                    onClick={onClose}
                                    className="w-full h-10 min-h-[48px] bg-rose-500 text-white font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-rose-200 text-[11px]"
                                >
                                    <X size={14} strokeWidth={3} />
                                    Salir
                                </button>
                            ) : (
                                <button
                                    onClick={() => setStep('step1')}
                                    className="w-full h-10 min-h-[48px] bg-zinc-200 text-zinc-700 font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-[11px]"
                                >
                                    Atrás
                                </button>
                            )}
                        </div>
                        <div className="self-stretch flex flex-col justify-end">
                            {isStep1 ? (
                                <button
                                    onClick={handleSiguiente}
                                    disabled={totalStep1 < 0.005 || hasStockIssueStep1}
                                    className={cn(
                                        "w-full h-10 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                                        (totalStep1 >= 0.005 && !hasStockIssueStep1)
                                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                            : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                                    )}
                                >
                                    Siguiente
                                </button>
                            ) : (
                                <button
                                    onClick={handleGuardarStep2}
                                    disabled={totalStep2 < 0.005 || hasStockIssueStep2}
                                    className={cn(
                                        "w-full h-10 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                                        (totalStep2 >= 0.005 && !hasStockIssueStep2)
                                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                            : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                                    )}
                                >
                                    Guardar
                                </button>
                            )}
                        </div>
                    </div>
                    {hasStockIssue && (
                        <p className="text-center text-[10px] font-bold text-rose-500 mt-2 uppercase tracking-tight italic">
                            No hay suficiente stock en la caja de origen
                        </p>
                    )}
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
        </Modal>
    );
};
