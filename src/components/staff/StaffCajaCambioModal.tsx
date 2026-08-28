'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { BILLS, COINS } from '@/components/CashClosingModal';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { Modal } from '@/components/ui/modal';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { randomId } from '@/lib/random-id';

const ALL_DENOMS = [...BILLS, ...COINS];

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

    const totalStep1 = totalFromCounts(step1Counts, BILLS);
    const totalStep2 = totalFull(step2Counts);
    const totalsMatch = Math.abs(totalStep1 - totalStep2) < 0.01;

    const availableAfterStep1 = (d: number): number => (stock[d] || 0) + (step1Counts[d] || 0);
    const hasStockIssueStep2 = ALL_DENOMS.some((d) => (step2Counts[d] || 0) > availableAfterStep1(d));
    const stockAfterStep1 = Object.fromEntries(ALL_DENOMS.map((d) => [d, availableAfterStep1(d)]));

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
            const exchangeGroupId = randomId();
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

    const mismatchWarning = didTrySave && ((!totalsMatch && totalStep2 > 0.005) || hasStockIssueStep2);

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
            footer={
                <CashCountFooter
                    total={step === 'importe' ? totalStep1 : totalStep2}
                    instancePrefix="staff-caja-cambio"
                    cancelLabel={step === 'importe' ? 'Cancelar' : 'Atrás'}
                    saveLabel={step === 'importe' ? 'Siguiente' : 'Guardar'}
                    onCancel={step === 'importe' ? onClose : () => setStep('importe')}
                    onSave={step === 'importe' ? handleSiguiente : () => void handleGuardar()}
                    saveDisabled={step === 'importe' ? totalStep1 < 0.005 : saving}
                    saveLoading={step === 'retirado' && saving}
                    extra={
                        step === 'retirado' ? (
                            <div className="flex flex-col items-end gap-0.5">
                                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">A cambiar</span>
                                <span className="text-sm font-bold tabular-nums text-zinc-500">
                                    {totalStep1 > 0.005 ? `${totalStep1.toFixed(2)}€` : ' '}
                                </span>
                                {mismatchWarning ? (
                                    <span className="text-[10px] font-bold text-rose-500">
                                        {!totalsMatch && totalStep2 > 0.005
                                            ? 'Los importes deben coincidir'
                                            : 'Cantidad insuficiente'}
                                    </span>
                                ) : null}
                            </div>
                        ) : null
                    }
                />
            }
        >
            <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
            <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />

            {step === 'importe' ? (
                <DenominationCountGrid
                    counts={step1Counts}
                    onAdjust={adjustStep1}
                    onChange={setStep1Qty}
                    denominations={BILLS}
                />
            ) : (
                <DenominationCountGrid
                    counts={step2Counts}
                    onAdjust={adjustStep2}
                    onChange={setStep2Qty}
                    denominations={ALL_DENOMS}
                    availableStock={stockAfterStep1}
                    showAvailable
                />
            )}
        </Modal>
    );
}
