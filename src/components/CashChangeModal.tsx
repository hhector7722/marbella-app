'use client';

import { useState, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';

import { CURRENCY_IMAGES } from '@/lib/constants';

const BILLS = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
const ALL_DENOMS = [...BILLS, ...COINS];

export type BoxOption = { id: string; name: string; hasInventory: boolean };

interface CashChangeModalProps {
    /** Legacy: una sola caja (arqueo interno). Si se pasa, se usa flujo antiguo SWAP. */
    boxId?: string;
    boxName?: string;
    /** Nuevo flujo: elegir Caja A y Caja B, luego De A→B y De B→A. */
    boxOptions?: BoxOption[];
    onClose: () => void;
    onSuccess?: () => void;
}

function buildBreakdown(counts: Record<number, number>): Record<string, number> {
    const out: Record<string, number> = {};
    ALL_DENOMS.forEach(d => {
        const q = counts[d] || 0;
        if (q > 0) out[String(d)] = q;
    });
    return out;
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
        if (boxA.id === 'tpv1' || boxA.id === 'tpv2') return;
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
        if (boxB.id === 'tpv1' || boxB.id === 'tpv2') return;
        const fetchStock = async () => {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxB.id).gt('quantity', 0);
            const s: Record<number, number> = {};
            data?.forEach((d: any) => s[Number(d.denomination)] = d.quantity);
            setStockB(s);
        };
        fetchStock();
    }, [useTwoBoxFlow, step, boxB?.id, boxB?.hasInventory, supabase]);

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

    const persistTransfer = async (fromBox: BoxOption | null, toBox: BoxOption | null, counts: Record<number, number>, directionLabel: string) => {
        const breakdown = buildBreakdown(counts);
        const amount = ALL_DENOMS.reduce((acc, val) => acc + (val * (counts[val] || 0)), 0);
        if (amount < 0.005) return;

        if (fromBox?.hasInventory && fromBox.id !== 'tpv1' && fromBox.id !== 'tpv2') {
            const { error: errOut } = await supabase.from('treasury_log').insert({
                box_id: fromBox.id,
                type: 'OUT',
                amount,
                breakdown,
                notes: `Cambio: ${directionLabel}`
            });
            if (errOut) {
                console.error('CashChangeModal OUT:', errOut);
                throw new Error(errOut.message);
            }
        }
        if (toBox?.hasInventory && toBox.id !== 'tpv1' && toBox.id !== 'tpv2') {
            const { error: errIn } = await supabase.from('treasury_log').insert({
                box_id: toBox.id,
                type: 'IN',
                amount,
                breakdown,
                notes: `Cambio: ${directionLabel}`
            });
            if (errIn) {
                console.error('CashChangeModal IN:', errIn);
                throw new Error(errIn.message);
            }
        }
    };

    const handleSiguiente = async () => {
        if (!boxA || !boxB || totalStep1 < 0.005 || hasStockIssueStep1) return;
        try {
            await persistTransfer(boxA, boxB, step1Counts, `De ${boxA.name} a ${boxB.name}`);
            setStep('step2');
        } catch (e: any) {
            toast.error(e.message || 'Error al guardar');
        }
    };

    const handleGuardarStep2 = async () => {
        if (!boxA || !boxB || totalStep2 < 0.005 || hasStockIssueStep2) return;
        try {
            await persistTransfer(boxB, boxA, step2Counts, `De ${boxB.name} a ${boxA.name}`);
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

    const TransferControl = ({
        denom,
        count,
        setCounts,
        stock,
        showStockWarning
    }: {
        denom: number;
        count: number;
        setCounts: React.Dispatch<React.SetStateAction<Record<number, number>>>;
        stock: Record<number, number>;
        showStockWarning: boolean;
    }) => (
        <div className="relative flex items-center justify-between w-[84px] h-9 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20 mx-auto">
            <button
                onClick={() => handleAdjustTransfer(denom, {} as any, setCounts, -1)}
                type="button"
                className="w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0 min-h-[44px] hover:bg-rose-50 hover:text-rose-500"
            >
                <Minus size={14} strokeWidth={3} />
            </button>
            <input
                type="number"
                min="0"
                value={count || ''}
                onChange={(e) => handleCountChangeTransfer(denom, e.target.value, setCounts)}
                placeholder="0"
                className={cn(
                    "flex-1 w-0 h-full bg-transparent text-center font-black outline-none p-0 text-[10px] tracking-tighter tabular-nums transition-colors focus:bg-blue-50/20",
                    count > 0 ? "text-zinc-800" : "text-zinc-400"
                )}
            />
            <button
                onClick={() => handleAdjustTransfer(denom, {} as any, setCounts, 1)}
                type="button"
                className="w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0 min-h-[44px] hover:bg-emerald-50 hover:text-emerald-500"
            >
                <Plus size={14} strokeWidth={3} />
            </button>
            {showStockWarning && count > (stock[denom] || 0) && (
                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-sm" aria-hidden />
            )}
        </div>
    );

    // ——— Flujo legacy: una caja (SWAP) ———
    if (!useTwoBoxFlow) {
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
                <div className="bg-[#f8fafb] w-full max-w-[420px] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-[#36606F] shrink-0 shadow-lg z-30 relative">
                        <div className="px-4 py-2.5 pb-3">
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-end gap-2 pr-4">
                                    <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Cambio</h2>
                                    <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.1em] border-l border-white/20 pl-2 leading-none mb-[1px]">Caja {boxName}</p>
                                </div>
                            </div>
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
                    </div>
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
                    <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
                        <div className="flex gap-2 w-full">
                            <button
                                onClick={handleSubmitLegacy}
                                disabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssueLegacy}
                                className={cn(
                                    "flex-[2] h-10 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                                    (isBalanced && (totalIn > 0 || totalOut > 0) && !hasStockIssueLegacy)
                                        ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                        : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                                )}
                            >
                                {hasStockIssueLegacy ? 'STOCK INSUFICIENTE' : 'GUARDAR'}
                            </button>
                            <button
                                onClick={onClose}
                                className="flex-1 h-10 min-h-[48px] bg-rose-500 text-white font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-rose-200 text-[11px]"
                            >
                                <X size={14} strokeWidth={3} />
                                SALIR
                            </button>
                        </div>
                        {hasStockIssueLegacy && (
                            <p className="text-center text-[10px] font-bold text-rose-500 mt-2 uppercase tracking-tight italic">
                                No hay suficiente stock en caja para realizar este cambio
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ——— Flujo dos cajas: selector ———
    if (step === 'select') {
        const canContinue = boxA && boxB && boxA.id !== boxB.id;
        return (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
                <div className="bg-[#f8fafb] w-full max-w-[420px] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                    <div className="bg-[#36606F] shrink-0 px-4 py-3">
                        <div className="flex items-center justify-between">
                            <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Cambio entre cajas</h2>
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[48px] min-w-[48px]">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                        <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest mt-1">Elige caja A y caja B (distintas)</p>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Caja A</span>
                                {boxOptions.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setBoxA(opt)}
                                        className={cn(
                                            "w-full min-h-[48px] rounded-xl border-2 font-black text-[11px] uppercase tracking-wide text-left px-3 transition-all",
                                            boxA?.id === opt.id
                                                ? "border-[#5B8FB9] bg-[#5B8FB9]/10 text-[#36606F]"
                                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                                        )}
                                    >
                                        {opt.name}
                                    </button>
                                ))}
                            </div>
                            <div className="flex flex-col gap-2">
                                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">Caja B</span>
                                {boxOptions.map((opt) => (
                                    <button
                                        key={opt.id}
                                        type="button"
                                        onClick={() => setBoxB(opt)}
                                        className={cn(
                                            "w-full min-h-[48px] rounded-xl border-2 font-black text-[11px] uppercase tracking-wide text-left px-3 transition-all",
                                            boxB?.id === opt.id
                                                ? "border-[#5B8FB9] bg-[#5B8FB9]/10 text-[#36606F]"
                                                : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300"
                                        )}
                                    >
                                        {opt.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {boxA && boxB && boxA.id === boxB.id && (
                            <p className="text-rose-600 text-[10px] font-bold mt-3 text-center">Elige dos cajas distintas</p>
                        )}
                    </div>
                    <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
                        <button
                            onClick={() => canContinue && setStep('step1')}
                            disabled={!canContinue}
                            className={cn(
                                "w-full h-12 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest",
                                canContinue ? "bg-emerald-600 text-white hover:bg-emerald-700" : "bg-zinc-100 text-zinc-400 cursor-not-allowed"
                            )}
                        >
                            Siguiente
                        </button>
                    </div>
                </div>
            </div>
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

    const leftHeaderName = isStep1 ? (boxA?.name ?? '') : (boxB?.name ?? '');
    const rightHeaderName = isStep1 ? (boxB?.name ?? '') : (boxA?.name ?? '');

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#f8fafb] w-full max-w-[420px] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                <div className="bg-[#36606F] shrink-0 shadow-lg z-30 relative">
                    <div className="px-4 py-2.5 pb-3">
                        <div className="flex items-center justify-between mb-2">
                            <h2 className="text-lg font-black text-white uppercase tracking-tighter leading-none">Cambio</h2>
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[48px] min-w-[48px] shrink-0">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                        {/* Cabeceras: Caja A | De A a B | Caja B (nombres reales) */}
                        <div className="grid grid-cols-[1fr_80px_1fr] gap-1 items-center mb-2">
                            <div className="text-center">
                                <span className="text-[9px] font-black text-rose-300/80 uppercase tracking-widest block">Sale</span>
                                <span className="text-[10px] font-bold text-white truncate block" title={leftHeaderName}>{leftHeaderName}</span>
                            </div>
                            <div className="text-center">
                                <span className="text-[8px] font-black text-white/70 uppercase tracking-widest block">Dirección</span>
                                <span className="text-[9px] font-bold text-white">
                                    {isStep1 ? 'De A a B' : 'De B a A'}
                                </span>
                            </div>
                            <div className="text-center">
                                <span className="text-[9px] font-black text-emerald-300/80 uppercase tracking-widest block">Entra</span>
                                <span className="text-[10px] font-bold text-white truncate block" title={rightHeaderName}>{rightHeaderName}</span>
                            </div>
                        </div>
                        <div className="flex items-center justify-center gap-1.5 px-0.5 bg-black/10 rounded-2xl py-2">
                            <span className="text-[8px] font-black text-white/50 uppercase">Total</span>
                            <span className="text-base font-black text-white tabular-nums">{total.toFixed(2)}€</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    <div className="flex flex-col">
                        {ALL_DENOMS.map((denom) => (
                            <div key={denom} className="grid grid-cols-[1fr_80px_1fr] items-stretch border-b border-zinc-50 relative min-h-[72px]">
                                <div className="flex justify-center items-center py-4 bg-rose-500/[0.06] border-r border-zinc-100/50">
                                    <div className="relative">
                                        <TransferControl
                                            denom={denom}
                                            count={counts[denom] || 0}
                                            setCounts={setCounts}
                                            stock={stock}
                                            showStockWarning={!!fromBox?.hasInventory}
                                        />
                                    </div>
                                </div>
                                <div className="flex flex-col items-center justify-center px-2 py-2 bg-white z-10">
                                    <div className="relative h-6 w-9 flex items-center justify-center shrink-0 mb-1">
                                        <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={40} height={32} className="h-full w-auto object-contain drop-shadow-sm select-none" />
                                    </div>
                                    <span className="text-[11px] font-black text-zinc-800 leading-none">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                    {fromBox?.hasInventory && stock[denom] > 0 && <span className="text-[8px] font-bold text-zinc-400 uppercase mt-1">x{stock[denom]}</span>}
                                </div>
                                <div className="flex justify-center items-center py-4 bg-emerald-500/[0.06] border-l border-zinc-100/50">
                                    <div className="text-center font-black text-[11px] tabular-nums text-emerald-700">
                                        {counts[denom] || 0}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-3 bg-white border-t border-zinc-100 shrink-0">
                    <div className="flex gap-2 w-full">
                        {isStep1 ? (
                            <>
                                <button
                                    onClick={handleSiguiente}
                                    disabled={totalStep1 < 0.005 || hasStockIssueStep1}
                                    className={cn(
                                        "flex-[2] h-10 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                                        (totalStep1 >= 0.005 && !hasStockIssueStep1)
                                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                            : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                                    )}
                                >
                                    Siguiente
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 h-10 min-h-[48px] bg-rose-500 text-white font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-rose-200 text-[11px]"
                                >
                                    <X size={14} strokeWidth={3} />
                                    Salir
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={() => setStep('step1')}
                                    className="flex-1 h-10 min-h-[48px] bg-zinc-200 text-zinc-700 font-black uppercase tracking-widest rounded-xl transition-all active:scale-95 flex items-center justify-center gap-1.5 text-[11px] shrink-0"
                                >
                                    Atrás
                                </button>
                                <button
                                    onClick={handleGuardarStep2}
                                    disabled={totalStep2 < 0.005 || hasStockIssueStep2}
                                    className={cn(
                                        "flex-[2] h-10 min-h-[48px] rounded-xl font-black text-[11px] uppercase tracking-widest shadow-md transition-all active:scale-[0.98] flex items-center justify-center gap-2",
                                        (totalStep2 >= 0.005 && !hasStockIssueStep2)
                                            ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                            : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                                    )}
                                >
                                    Guardar
                                </button>
                            </>
                        )}
                    </div>
                    {hasStockIssue && (
                        <p className="text-center text-[10px] font-bold text-rose-500 mt-2 uppercase tracking-tight italic">
                            No hay suficiente stock en la caja de origen
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
