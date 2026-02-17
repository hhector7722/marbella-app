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
        <div className="flex items-center justify-center gap-1 h-11 w-full px-1">
            <button
                onClick={() => handleAdjust(denom, side, -1)}
                className="w-8 h-8 flex items-center justify-center bg-white/80 text-zinc-400 rounded-lg active:scale-90 transition-all shadow-sm border border-zinc-200 hover:text-rose-500 hover:border-rose-200"
            >
                <Minus size={14} strokeWidth={3} />
            </button>
            <input
                type="number" min="0"
                value={count || ''}
                onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    if (side === 'in') setInCounts(p => ({ ...p, [denom]: val }));
                    else setOutCounts(p => ({ ...p, [denom]: val }));
                }}
                placeholder="0"
                className={cn(
                    "flex-1 text-center text-base font-black bg-white/60 rounded-lg h-8 outline-none transition-colors border border-transparent focus:border-zinc-300",
                    count > 0 ? (side === 'in' ? "text-emerald-700 bg-emerald-50" : "text-rose-700 bg-rose-50") : "text-zinc-300"
                )}
            />
            <button
                onClick={() => handleAdjust(denom, side, 1)}
                className="w-8 h-8 flex items-center justify-center bg-white/80 text-zinc-400 rounded-lg active:scale-90 transition-all shadow-sm border border-zinc-200 hover:text-emerald-500 hover:border-emerald-200"
            >
                <Plus size={14} strokeWidth={3} />
            </button>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-2 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                {/* COMPACT STICKY HEADER */}
                <div className="bg-[#36606F] shrink-0 shadow-lg z-20 relative">
                    <div className="px-3 py-2 flex items-center justify-between gap-4">
                        {/* LEFT: TITLE & BOX */}
                        <div className="flex flex-col min-w-0">
                            <h2 className="text-sm font-black text-white uppercase tracking-wider leading-none">Cambio Efectivo</h2>
                            <p className="text-white/60 text-[9px] font-bold uppercase tracking-[0.2em] leading-tight truncate">Caja {boxName}</p>
                        </div>

                        {/* CENTER: TOTALS */}
                        <div className="flex-1 flex items-center justify-center gap-2 md:gap-6 bg-black/20 rounded-xl px-2 py-1 mx-2">
                            <div className="flex flex-col items-center">
                                <span className="text-[7px] font-black text-emerald-300 uppercase tracking-wider leading-none mb-0.5">Entra</span>
                                <span className="text-lg font-black text-white leading-none tabular-nums tracking-tight">{totalIn.toFixed(2)}€</span>
                            </div>

                            {/* SEPARATOR / DIFF */}
                            <div className="flex flex-col items-center px-2">
                                <span className={cn(
                                    "text-[8px] font-black px-1.5 py-0.5 rounded-full leading-none mb-0.5 max-w-[80px] truncate",
                                    isBalanced ? "bg-emerald-500 text-white" : "bg-rose-500 text-white"
                                )}>
                                    {isBalanced ? "OK" : `${diff > 0 ? '+' : ''}${diff.toFixed(2)}€`}
                                </span>
                            </div>

                            <div className="flex flex-col items-center">
                                <span className="text-[7px] font-black text-rose-300 uppercase tracking-wider leading-none mb-0.5">Sale</span>
                                <span className="text-lg font-black text-white leading-none tabular-nums tracking-tight">{totalOut.toFixed(2)}€</span>
                            </div>
                        </div>


                        {/* RIGHT: ACTION & CLOSE */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSubmit}
                                disabled={!isBalanced || (totalIn === 0 && totalOut === 0) || hasStockIssue}
                                className={cn(
                                    "h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95 flex items-center justify-center",
                                    (isBalanced && (totalIn > 0 || totalOut > 0) && !hasStockIssue)
                                        ? "bg-emerald-500 text-white hover:bg-emerald-400 ring-2 ring-emerald-500/50"
                                        : "bg-white/10 text-white/20 cursor-not-allowed"
                                )}
                            >
                                {hasStockIssue ? 'STOCK!' : 'CONFIRMAR'}
                            </button>
                            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* 3-COLUMN LAYOUT CONTENT */}
                <div className="flex-1 overflow-y-auto custom-scrollbar flex bg-white relative">
                    {/* COLUMN LEFT: ENTRA */}
                    <div className="flex-1 bg-emerald-100 flex flex-col py-3 border-r border-emerald-200">
                        <div className="text-center mb-2 sticky top-0 bg-emerald-100/90 backdrop-blur-sm z-10 py-1">
                            <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded-full">Entra</span>
                        </div>
                        <div className="space-y-1 px-1">
                            {ALL_DENOMS.map(denom => (
                                <DenomControl key={`in-${denom}`} denom={denom} count={inCounts[denom] || 0} side="in" />
                            ))}
                        </div>
                    </div>

                    {/* COLUMN CENTER: DENOMINATIONS */}
                    <div className="w-16 md:w-20 bg-white flex flex-col py-3 shadow-xl z-20 shrink-0">
                        <div className="text-center mb-2 sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-1">
                            <span className="text-[8px] font-black text-zinc-300 uppercase tracking-widest">Valor</span>
                        </div>
                        <div className="space-y-1">
                            {ALL_DENOMS.map(denom => (
                                <div key={`img-${denom}`} className="h-11 flex flex-col items-center justify-center shrink-0">
                                    <div className="relative h-6 w-10 flex items-center justify-center">
                                        <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={48} height={40} className="h-full w-auto object-contain drop-shadow-sm select-none" />
                                    </div>
                                    <span className="text-[8px] font-black text-zinc-400 uppercase mt-0.5 leading-none">{denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* COLUMN RIGHT: SALE */}
                    <div className="flex-1 bg-rose-100 flex flex-col py-3 border-l border-rose-200">
                        <div className="text-center mb-2 sticky top-0 bg-rose-100/90 backdrop-blur-sm z-10 py-1">
                            <span className="text-[9px] font-black text-rose-700 uppercase tracking-widest bg-white/50 px-2 py-0.5 rounded-full">Sale</span>
                        </div>
                        <div className="space-y-1 px-1">
                            {ALL_DENOMS.map(denom => (
                                <div key={`out-row-${denom}`} className="relative">
                                    <DenomControl denom={denom} count={outCounts[denom] || 0} side="out" />
                                    {availableStock[denom] > 0 && (
                                        <span className="absolute top-1/2 -translate-y-1/2 right-1 text-[7px] font-bold text-rose-500 bg-white/70 px-1 rounded-sm shadow-sm pointer-events-none opacity-60">
                                            x{availableStock[denom]}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
