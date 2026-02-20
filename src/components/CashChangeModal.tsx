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

import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

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
            data?.forEach((d: any) => stock[d.denomination] = d.quantity);
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
        <div className={cn(
            "flex items-center gap-0.5 bg-white/40 rounded-lg p-0.5",
            side === 'in' ? "border-emerald-100" : "border-rose-100"
        )}>
            <button
                onClick={() => handleAdjust(denom, side, -1)}
                className="w-8 h-8 flex items-center justify-center bg-white text-zinc-400 rounded-md active:scale-90 transition-all shadow-sm border border-zinc-200 hover:text-rose-500 hover:border-rose-200 shrink-0"
            >
                <Minus size={14} strokeWidth={3} />
            </button>
            <input
                type="number" min="0"
                value={count || ''}
                readOnly
                placeholder="0"
                className={cn(
                    "w-6 text-center text-[13px] font-black bg-transparent outline-none tabular-nums",
                    count > 0 ? (side === 'in' ? "text-emerald-700" : "text-rose-700") : "text-zinc-300"
                )}
            />
            <button
                onClick={() => handleAdjust(denom, side, 1)}
                className="w-8 h-8 flex items-center justify-center bg-white text-zinc-400 rounded-md active:scale-90 transition-all shadow-sm border border-zinc-200 hover:text-emerald-500 hover:border-emerald-200 shrink-0"
            >
                <Plus size={14} strokeWidth={3} />
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center md:p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#f8fafb] w-full max-w-[400px] md:rounded-3xl shadow-2xl flex flex-col h-full md:h-auto md:max-h-[85vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* STICKY HEADER - MARBELLA STYLE */}
                <div className="bg-[#36606F] shrink-0 shadow-lg z-30 relative pt-safe">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm font-black text-white uppercase tracking-widest leading-none">Cambio</h2>
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-[0.1em] mt-1 truncate">Caja {boxName}</p>
                        </div>

                        <div className="flex flex-col items-center bg-black/20 rounded-2xl px-4 py-2 flex-1 max-w-[180px]">
                            <div className="flex items-center gap-2 mb-1 w-full justify-between">
                                <span className="text-[8px] font-black text-emerald-300 uppercase tracking-wider leading-none">In {totalIn.toFixed(0)}€</span>
                                <span className="text-[8px] font-black text-rose-300 uppercase tracking-wider leading-none">Out {totalOut.toFixed(0)}€</span>
                            </div>
                            <div className={cn(
                                "text-sm font-black text-white px-3 py-0.5 rounded-full transition-colors w-full text-center",
                                isBalanced ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                            )}>
                                {isBalanced ? "ESTADO OK" : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}€`}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90 border border-white/10">
                                <X size={20} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* ROW-BASED CONTENT */}
                <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
                    <div className="divide-y divide-zinc-50">
                        {ALL_DENOMS.map(denom => (
                            <div key={denom} className="flex items-center justify-between p-3 md:p-4 hover:bg-zinc-50/50 transition-colors gap-3">
                                {/* LEFT: DENOM INFO */}
                                <div className="flex items-center gap-2 w-16 shrink-0">
                                    <div className="relative h-6 w-9 flex items-center justify-center shrink-0">
                                        <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={40} height={32} className="h-full w-auto object-contain drop-shadow-sm select-none" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-zinc-800 leading-none">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                        {availableStock[denom] > 0 && (
                                            <span className="text-[8px] font-bold text-rose-500 uppercase mt-0.5">x{availableStock[denom]}</span>
                                        )}
                                    </div>
                                </div>

                                {/* RIGHT: CONTROLS */}
                                <div className="flex items-center gap-1.5 ml-auto">
                                    {/* ENTRA */}
                                    <div className="flex flex-col items-center">
                                        <span className="text-[7px] font-black text-emerald-600 uppercase mb-0.5 tracking-tighter">Entra</span>
                                        <DenomControl denom={denom} count={inCounts[denom] || 0} side="in" />
                                    </div>

                                    <div className="w-[1px] h-8 bg-zinc-100 mx-0.5 self-end mb-1" />

                                    {/* SALE */}
                                    <div className="flex flex-col items-center">
                                        <span className="text-[7px] font-black text-rose-600 uppercase mb-0.5 tracking-tighter">Sale</span>
                                        <div className="relative">
                                            <DenomControl denom={denom} count={outCounts[denom] || 0} side="out" />
                                            {outCounts[denom] > (availableStock[denom] || 0) && (
                                                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full border-2 border-white animate-pulse" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* STICKY FOOTER - MARBELLA STYLE */}
                <div className="p-4 bg-white border-t border-zinc-100 shrink-0 pb-safe">
                    <button
                        onClick={handleSubmit}
                        disabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssue}
                        className={cn(
                            "w-full h-14 rounded-2xl font-black text-sm uppercase tracking-[0.2em] shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3",
                            (isBalanced && (totalIn > 0 || totalOut > 0) && !hasStockIssue)
                                ? "bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-200"
                                : "bg-zinc-100 text-zinc-300 cursor-not-allowed"
                        )}
                    >
                        {hasStockIssue ? 'STOCK INSUFICIENTE' : 'GUARDAR CAMBIO'}
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
