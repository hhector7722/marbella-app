'use client';

import { useState, useEffect } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';

interface CashChangeModalProps {
    boxId: string;
    boxName: string;
    onClose: () => void;
    onSuccess?: () => void;
}

import { CURRENCY_IMAGES } from '@/lib/constants';

const BILLS = [100, 50, 20, 10, 5];
const COINS = [2, 1, 0.50, 0.20, 0.10, 0.05, 0.02, 0.01];
const ALL_DENOMS = [...BILLS, ...COINS];

export const CashChangeModal = ({ boxId, boxName, onClose, onSuccess }: CashChangeModalProps) => {
    const supabase = createClient();
    const [inCounts, setInCounts] = useState<Record<number, number>>({});
    const [outCounts, setOutCounts] = useState<Record<number, number>>({});
    const [availableStock, setAvailableStock] = useState<Record<number, number>>({});
    const [loadingStock, setLoadingStock] = useState(true);

    useEffect(() => {
        const fetchStock = async () => {
            const { data } = await supabase.from('cash_box_inventory').select('*').eq('box_id', boxId).gt('quantity', 0);
            const stock: Record<number, number> = {};
            data?.forEach((d: any) => stock[Number(d.denomination)] = d.quantity);
            setAvailableStock(stock);
            setLoadingStock(false);
        };
        fetchStock();
    }, [boxId, supabase]);

    const totalIn = ALL_DENOMS.reduce((acc, val) => acc + (val * (inCounts[val] || 0)), 0);
    const totalOut = ALL_DENOMS.reduce((acc, val) => acc + (val * (outCounts[val] || 0)), 0);
    const diff = totalIn - totalOut;
    const isBalanced = Math.abs(diff) < 0.01;
    const hasStockIssue = Object.entries(outCounts).some(([d, q]) => q > (availableStock[Number(d)] || 0));

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

    const handleSubmit = async () => {
        try {
            await supabase.from('treasury_log').insert({
                box_id: boxId,
                type: 'SWAP',
                amount: totalIn,
                breakdown: { in: inCounts, out: outCounts },
                notes: `Cambio: Entra ${totalIn.toFixed(2)}€`
            });
            toast.success('Cambio realizado correctamente');
            if (onSuccess) onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            toast.error('Error al realizar cambio');
        }
    };

    const DenomControl = ({ denom, count, side }: { denom: number, count: number, side: 'in' | 'out' }) => (
        <div className="flex items-center justify-between w-[84px] h-9 bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm transition-all focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20 mx-auto">
            <button
                onClick={() => handleAdjust(denom, side, -1)}
                className={cn(
                    "w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0",
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
                className={cn(
                    "w-6 h-full flex items-center justify-center text-zinc-400 active:bg-zinc-100 transition-colors shrink-0",
                    side === 'in' ? "hover:bg-emerald-50 hover:text-emerald-500" : "hover:bg-rose-50 hover:text-rose-500"
                )}
            >
                <Plus size={14} strokeWidth={3} />
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#f8fafb] w-full max-w-[420px] rounded-3xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* STICKY HEADER - MATCHING REFERENCE */}
                <div className="bg-[#36606F] shrink-0 shadow-lg z-30 relative pt-safe">
                    <div className="px-4 py-3 pb-4">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex flex-col min-w-0">
                                <h2 className="text-xl font-black text-white uppercase tracking-tighter leading-none">Cambio Efectivo</h2>
                                <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.1em] mt-1 truncate">Caja {boxName}</p>
                            </div>
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 border border-white/10">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>

                        <div className="flex items-center justify-between gap-1.5 px-0.5">
                            {/* SALE KPI */}
                            <div className="flex-1 bg-black/10 rounded-2xl py-2 flex flex-col items-center border border-white/5 transition-all">
                                <span className="text-[8px] font-black text-rose-300/60 uppercase tracking-widest mb-0.5">Sale</span>
                                <span className="text-base md:text-xl font-black text-rose-300 tabular-nums leading-none">{totalOut.toFixed(2)}€</span>
                            </div>

                            {/* DIF KPI */}
                            <div className="flex-1 bg-white/10 rounded-2xl py-2 flex flex-col items-center border border-white/10 shadow-inner">
                                <span className="text-[8px] font-black text-white/40 uppercase tracking-widest mb-0.5 font-sans">Dif:</span>
                                <div className={cn(
                                    "text-xs md:text-sm font-black px-3 py-0.5 rounded-full transition-colors",
                                    isBalanced ? "text-emerald-400" : "text-rose-400"
                                )}>
                                    {isBalanced ? "0.00€" : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}€`}
                                </div>
                            </div>

                            {/* ENTRA KPI */}
                            <div className="flex-1 bg-black/10 rounded-2xl py-2 flex flex-col items-center border border-white/5 transition-all">
                                <span className="text-[8px] font-black text-emerald-300/60 uppercase tracking-widest mb-0.5">Entra</span>
                                <span className="text-base md:text-xl font-black text-emerald-300 tabular-nums leading-none">{totalIn.toFixed(2)}€</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CONTENT: 3-COLUMN GRID */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    <div className="flex flex-col">
                        {ALL_DENOMS.map((denom, idx) => (
                            <div key={denom} className="grid grid-cols-[1fr_80px_1fr] items-stretch border-b border-zinc-50 relative min-h-[72px]">
                                {/* LEFT: SALE (INTENSIFIED RED) */}
                                <div className="flex justify-center items-center py-4 bg-rose-500/[0.06] border-r border-zinc-100/50">
                                    <div className="relative">
                                        <DenomControl denom={denom} count={outCounts[denom] || 0} side="out" />
                                        {outCounts[denom] > (availableStock[denom] || 0) && (
                                            <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-600 rounded-full border-2 border-white animate-pulse shadow-sm" />
                                        )}
                                    </div>
                                </div>

                                {/* CENTER: DENOM INFO */}
                                <div className="flex flex-col items-center justify-center px-2 py-2 bg-white z-10">
                                    <div className="relative h-6 w-9 flex items-center justify-center shrink-0 mb-1">
                                        <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={40} height={32} className="h-full w-auto object-contain drop-shadow-sm select-none" />
                                    </div>
                                    <span className="text-[11px] font-black text-zinc-800 leading-none">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                    {availableStock[denom] > 0 && (
                                        <span className="text-[8px] font-bold text-zinc-400 uppercase mt-1">x{availableStock[denom]}</span>
                                    )}
                                </div>

                                {/* RIGHT: ENTRA (INTENSIFIED GREEN) */}
                                <div className="flex justify-center items-center py-4 bg-emerald-500/[0.06] border-l border-zinc-100/50">
                                    <DenomControl denom={denom} count={inCounts[denom] || 0} side="in" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* STICKY FOOTER */}
                <div className="p-4 bg-white border-t border-zinc-100 shrink-0 pb-safe">
                    <button
                        onClick={handleSubmit}
                        disabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssue}
                        className={cn(
                            "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3",
                            (isBalanced && (totalIn > 0 || totalOut > 0) && !hasStockIssue)
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                : "bg-zinc-100 text-zinc-300 cursor-not-allowed border border-zinc-200"
                        )}
                    >
                        {hasStockIssue ? 'STOCK INSUFICIENTE' : 'CONFIRMAR CAMBIO'}
                    </button>
                    {hasStockIssue && (
                        <p className="text-center text-[10px] font-bold text-rose-500 mt-2 uppercase tracking-tight italic">
                            No hay suficiente stock en caja para realizar este cambio
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
