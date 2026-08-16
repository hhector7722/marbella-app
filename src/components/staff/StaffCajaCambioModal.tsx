'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Minus, Plus } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES } from '@/lib/constants';
import { BILLS, COINS } from '@/components/CashClosingModal';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';

const STEP1_BILLS_ROW1 = [100, 50, 20] as const;
const STEP1_BILLS_ROW2 = [10, 5] as const;
const ALL_DENOMS = [...BILLS, ...COINS];
/** Monedas del paso 2 salvo 1c (la fila final lleva 1c + botones). */
const COINS_BEFORE_1C = COINS.slice(0, -1);
const COIN_1C = 0.01;

function buildBreakdown(counts: Record<number, number>): Record<string, number> {
    const out: Record<string, number> = {};
    ALL_DENOMS.forEach((d) => {
        const q = counts[d] || 0;
        if (q > 0) out[String(d)] = q;
    });
    return out;
}

function totalFromCounts(counts: Record<number, number>, denoms: readonly number[]): number {
    return denoms.reduce((acc, d) => acc + d * (counts[d] || 0), 0);
}

function totalFull(counts: Record<number, number>): number {
    return ALL_DENOMS.reduce((acc, d) => acc + d * (counts[d] || 0), 0);
}

export interface StaffCajaCambioModalProps {
    isOpen: boolean;
    /** Primera caja `type = change` ordenada por nombre (Caja cambio 1). */
    changeBox: { id: string; name: string } | null;
    onClose: () => void;
    onSuccess?: () => void;
}

export function StaffCajaCambioModal({ isOpen, changeBox, onClose, onSuccess }: StaffCajaCambioModalProps) {
    const supabase = createClient();
    const [step, setStep] = useState<'importe' | 'retirado'>('importe');
    const [step1Counts, setStep1Counts] = useState<Record<number, number>>({});
    const [step2Counts, setStep2Counts] = useState<Record<number, number>>({});
    const [stock, setStock] = useState<Record<number, number>>({});
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [didTrySave, setDidTrySave] = useState(false);

    const reset = useCallback(() => {
        setStep('importe');
        setStep1Counts({});
        setStep2Counts({});
        setDidTrySave(false);
    }, []);

    useEffect(() => {
        if (!isOpen) {
            reset();
            return;
        }
        if (!changeBox?.id) return;
        (async () => {
            const { data, error } = await supabase.from('cash_box_inventory').select('denomination, quantity').eq('box_id', changeBox.id);
            if (error) {
                toast.error(error.message || 'No se pudo cargar el arqueo de la caja');
                return;
            }
            const m: Record<number, number> = {};
            data?.forEach((row: { denomination: string | number; quantity: number }) => {
                m[Number(row.denomination)] = row.quantity;
            });
            setStock(m);
        })();
    }, [isOpen, changeBox?.id, supabase, reset]);

    const totalStep1 = totalFromCounts(step1Counts, [...STEP1_BILLS_ROW1, ...STEP1_BILLS_ROW2]);
    const totalStep2 = totalFull(step2Counts);
    const totalsMatch = Math.abs(totalStep1 - totalStep2) < 0.01;

    const availableAfterStep1 = (d: number): number => (stock[d] || 0) + (step1Counts[d] || 0);
    const hasStockIssueStep2 = ALL_DENOMS.some((d) => (step2Counts[d] || 0) > availableAfterStep1(d));

    const adjustStep1 = (denom: number, delta: number) => {
        setStep1Counts((prev) => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
    };

    const setStep1Qty = (denom: number, val: string) => {
        const n = parseInt(val, 10) || 0;
        setStep1Counts((prev) => ({ ...prev, [denom]: Math.max(0, n) }));
    };

    const adjustStep2 = (denom: number, delta: number) => {
        setStep2Counts((prev) => ({ ...prev, [denom]: Math.max(0, (prev[denom] || 0) + delta) }));
    };

    const setStep2Qty = (denom: number, val: string) => {
        const n = parseInt(val, 10) || 0;
        setStep2Counts((prev) => ({ ...prev, [denom]: Math.max(0, n) }));
    };

    const handleSiguiente = () => {
        if (totalStep1 < 0.005) {
            toast.error('Indica un importe a cambiar');
            return;
        }
        setStep('retirado');
    };

    const handleGuardar = async () => {
        if (!changeBox?.id) return;
        setDidTrySave(true);
        if (totalStep1 < 0.005 || totalStep2 < 0.005) {
            toast.error('Completa ambos desgloses');
            return;
        }
        if (!totalsMatch) {
            toast.error('Los importes deben coincidir.');
            return;
        }
        if (hasStockIssueStep2) {
            toast.error('Cantidad insuficiente...');
            return;
        }

        setSaving(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const exchangeGroupId = crypto.randomUUID();
            const breakdownIn = buildBreakdown(step1Counts);
            const breakdownOut = buildBreakdown(step2Counts);

            const { error: errIn } = await supabase.from('treasury_log').insert({
                box_id: changeBox.id,
                type: 'IN',
                amount: totalStep1,
                breakdown: breakdownIn,
                notes: 'Cambio staff: importe a cambiar',
                user_id: user?.id ?? null,
                exchange_group_id: exchangeGroupId,
            });
            if (errIn) throw new Error(errIn.message);

            const { error: errOut } = await supabase.from('treasury_log').insert({
                box_id: changeBox.id,
                type: 'OUT',
                amount: totalStep2,
                breakdown: breakdownOut,
                notes: 'Cambio staff: cambio retirado',
                user_id: user?.id ?? null,
                exchange_group_id: exchangeGroupId,
            });
            if (errOut) throw new Error(errOut.message);

            toast.success('Cambio registrado');
            onSuccess?.();
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Error al guardar';
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const denomCell = (
        denom: number,
        count: number,
        onDelta: (d: number, delta: number) => void,
        onInput: (d: number, val: string) => void
    ) => (
        <div key={denom} className="flex flex-col items-center gap-1.5">
            <div className="flex h-11 w-full items-center justify-center sm:h-14">
                <Image
                    src={CURRENCY_IMAGES[denom]}
                    alt={`${denom}€`}
                    width={140}
                    height={140}
                    className="h-full w-auto object-contain drop-shadow-lg"
                />
            </div>
            <div className="w-full text-center">
                <span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-gray-500">{denom}€</span>
                <div className="flex h-10 w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20 focus-within:ring-offset-1">
                    <button
                        type="button"
                        onClick={() => onDelta(denom, -1)}
                        className="flex h-full min-h-[44px] w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
                    >
                        <Minus size={14} strokeWidth={3} />
                    </button>
                    <input
                        type="number"
                        min={0}
                        placeholder=""
                        className="h-full w-0 flex-1 bg-transparent p-0 text-center text-[10px] font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20"
                        value={count || ''}
                        onChange={(e) => onInput(denom, e.target.value)}
                    />
                    <button
                        type="button"
                        onClick={() => onDelta(denom, 1)}
                        className="flex h-full min-h-[44px] w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
                    >
                        <Plus size={14} strokeWidth={3} />
                    </button>
                </div>
            </div>
        </div>
    );

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            variant="amplify"
            layer="base"
            instance="staff-cash-change"
            usageId="staff-caja-cambio"
            usageLabel="Caja cambio staff"
            headerTone="petroleum"
            headerTitleAlign="left"
            title="Cambio"
        >
            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />

                {step === 'importe' && (
                    <>
                        <div className="shrink-0 border-b border-gray-100 bg-gray-50 px-4 py-4 sm:p-6">
                            <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Importe a cambiar</h3>
                            <span className="text-3xl font-black text-[#5B8FB9]">{totalStep1 > 0.005 ? `${totalStep1.toFixed(2)}€` : ' '}</span>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f8fafb] p-4 sm:p-6">
                            <div className="grid grid-cols-3 gap-3 sm:gap-4">
                                {STEP1_BILLS_ROW1.map((d) => denomCell(d, step1Counts[d] || 0, adjustStep1, setStep1Qty))}
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3 sm:gap-4">
                                {STEP1_BILLS_ROW2.map((d) => denomCell(d, step1Counts[d] || 0, adjustStep1, setStep1Qty))}
                                <div className="flex flex-col justify-end">
                                    <span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-transparent">.</span>
                                    <button
                                        type="button"
                                        onClick={handleSiguiente}
                                        disabled={totalStep1 < 0.005}
                                        className={cn(
                                            'flex min-h-[48px] w-full items-center justify-center rounded-xl font-black uppercase tracking-widest text-white shadow-md transition-all active:scale-[0.98]',
                                            totalStep1 >= 0.005 ? 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700' : 'cursor-not-allowed bg-zinc-300'
                                        )}
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {step === 'retirado' && (
                    <>
                        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                            {/* Misma cabecera + layout de rejilla que el paso «Arqueo en Caja» de CashClosingModal */}
                            <div className="flex shrink-0 items-center justify-between border-b bg-gray-50 p-4 sm:p-6">
                                <div>
                                    <h3 className="text-xs font-black uppercase tracking-widest text-gray-400">Desglose del cambio retirado</h3>
                                    <span className="text-3xl font-black text-[#5B8FB9]">{totalStep2 > 0.005 ? `${totalStep2.toFixed(2)}€` : ' '}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] font-black uppercase text-gray-400">Importe a cambiar</span>
                                    <div className="text-lg font-bold text-gray-500">{totalStep1 > 0.005 ? `${totalStep1.toFixed(2)}€` : ' '}</div>
                                </div>
                            </div>
                            {didTrySave && ((!totalsMatch && totalStep2 > 0.005) || hasStockIssueStep2) ? (
                                <div className="shrink-0 border-b border-rose-100 bg-rose-50/90 px-4 py-2 sm:px-6">
                                    {!totalsMatch && totalStep2 > 0.005 ? (
                                        <p className="text-xs font-bold text-rose-600">Los importes deben coincidir.</p>
                                    ) : null}
                                    {hasStockIssueStep2 ? (
                                        <p className="text-xs font-bold text-rose-600">Cantidad insuficiente...</p>
                                    ) : null}
                                </div>
                            ) : null}
                            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-3 sm:p-4">
                                <div className="grid grid-cols-4 gap-y-5 gap-x-3 sm:grid-cols-6 sm:gap-y-6 sm:gap-x-4 lg:grid-cols-8">
                                    {BILLS.map((bill) => (
                                        <div key={bill} className="group flex flex-col items-center gap-1.5 transition-all">
                                            <div className="flex h-11 w-full items-center justify-center transition-transform group-hover:scale-110 sm:h-14">
                                                <Image
                                                    src={CURRENCY_IMAGES[bill]}
                                                    alt={`${bill}€`}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-lg"
                                                />
                                            </div>
                                            <div className="w-full text-center">
                                                <span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-gray-500">{bill}€</span>
                                                <div className="flex h-10 w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20 focus-within:ring-offset-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustStep2(bill, -1)}
                                                        className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        placeholder=""
                                                        className="h-full w-0 flex-1 bg-transparent p-0 text-center text-[10px] font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20"
                                                        value={step2Counts[bill] || ''}
                                                        onChange={(e) => setStep2Qty(bill, e.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustStep2(bill, 1)}
                                                        className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {COINS_BEFORE_1C.map((coin) => (
                                        <div key={coin} className="group flex flex-col items-center gap-1.5 transition-all">
                                            <div className="flex h-11 w-full items-center justify-center transition-transform group-hover:scale-110 sm:h-14">
                                                <Image
                                                    src={CURRENCY_IMAGES[coin]}
                                                    alt={`${coin}€`}
                                                    width={140}
                                                    height={140}
                                                    className="h-full w-auto object-contain drop-shadow-md"
                                                />
                                            </div>
                                            <div className="w-full text-center">
                                                <span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-gray-500">
                                                    {coin < 1 ? `${(coin * 100).toFixed(0)}c` : `${coin}€`}
                                                </span>
                                                <div className="flex h-10 w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20 focus-within:ring-offset-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustStep2(coin, -1)}
                                                        className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
                                                    >
                                                        <Minus size={14} strokeWidth={3} />
                                                    </button>
                                                    <input
                                                        type="number"
                                                        placeholder=""
                                                        className="h-full w-0 flex-1 bg-transparent p-0 text-center text-[10px] font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20"
                                                        value={step2Counts[coin] || ''}
                                                        onChange={(e) => setStep2Qty(coin, e.target.value)}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => adjustStep2(coin, 1)}
                                                        className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
                                                    >
                                                        <Plus size={14} strokeWidth={3} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {/* Misma fila: moneda 1c + Atrás + Guardar (ancho compacto) */}
                                <div className="grid grid-cols-4 items-end gap-x-3 gap-y-5 sm:grid-cols-6 sm:gap-y-6 sm:gap-x-4 lg:grid-cols-8">
                                    <div className="group flex flex-col items-center gap-1.5 transition-all">
                                        <div className="flex h-11 w-full items-center justify-center transition-transform group-hover:scale-110 sm:h-14">
                                            <Image
                                                src={CURRENCY_IMAGES[COIN_1C]}
                                                alt="1c"
                                                width={140}
                                                height={140}
                                                className="h-full w-auto object-contain drop-shadow-md"
                                            />
                                        </div>
                                        <div className="w-full text-center">
                                            <span className="mb-0.5 block text-[9px] font-black uppercase tracking-widest text-gray-500">1c</span>
                                            <div className="flex h-10 w-full items-center justify-between overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all focus-within:border-[#5B8FB9]/40 focus-within:ring-2 focus-within:ring-[#5B8FB9]/20 focus-within:ring-offset-1">
                                                <button
                                                    type="button"
                                                    onClick={() => adjustStep2(COIN_1C, -1)}
                                                    className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100"
                                                >
                                                    <Minus size={14} strokeWidth={3} />
                                                </button>
                                                <input
                                                    type="number"
                                                    placeholder=""
                                                    className="h-full w-0 flex-1 bg-transparent p-0 text-center text-[10px] font-black tabular-nums tracking-tighter text-zinc-700 outline-none transition-colors focus:bg-blue-50/20"
                                                    value={step2Counts[COIN_1C] || ''}
                                                    onChange={(e) => setStep2Qty(COIN_1C, e.target.value)}
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => adjustStep2(COIN_1C, 1)}
                                                    className="flex h-full w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100"
                                                >
                                                    <Plus size={14} strokeWidth={3} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="col-span-3 flex min-h-[48px] items-end justify-end gap-2 pb-0.5 sm:col-span-5 lg:col-span-7">
                                        <button
                                            type="button"
                                            onClick={() => setStep('importe')}
                                            className="min-h-[48px] shrink-0 rounded-xl px-4 font-black uppercase tracking-widest text-xs text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 active:bg-gray-200"
                                        >
                                            Atrás
                                        </button>
                                        <button
                                            type="button"
                                            onClick={handleGuardar}
                                            disabled={saving}
                                            className={cn(
                                                'min-h-[48px] shrink-0 rounded-2xl px-5 font-black uppercase tracking-widest text-white shadow-lg transition-all active:scale-[0.98] sm:px-6',
                                                saving
                                                    ? 'cursor-not-allowed bg-zinc-300 shadow-none'
                                                    : 'bg-emerald-600 shadow-emerald-200 hover:bg-emerald-700'
                                            )}
                                        >
                                            {saving ? 'Guardando…' : 'Guardar'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </>
                )}
        </Modal>
    );
}
