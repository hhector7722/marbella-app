'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Modal, type ModalLayer } from '@/components/ui/modal';
import { DENOMINATIONS, CURRENCY_IMAGES } from '@/lib/constants';
import { formatCurrencySpanish } from '@/lib/cash-closing-metrics';
import { DenominationCountGrid } from '@/components/cash/DenominationCountGrid';
import { CashCountFooter } from '@/components/cash/CashCountFooter';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';

function parseLocalDateSafe(dateInput?: string | Date | null): Date {
    if (!dateInput) return new Date();
    if (dateInput instanceof Date) return dateInput;
    const clean = dateInput.split('T')[0];
    const parts = clean.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
        return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    const d = new Date(dateInput);
    return isNaN(d.getTime()) ? new Date() : d;
}

export interface CashBreakdownModalProps {
    isOpen: boolean;
    onClose: () => void;
    breakdown?: Record<string, unknown> | null;
    date?: string | Date | null;
    total: number;
    isEditing?: boolean;
    onUpdate?: (den: string, qty: number) => void;
    onSave?: () => void;
    saving?: boolean;
    layer?: ModalLayer;
    instance?: string;
    parentInstance?: string;
}

export function CashBreakdownModal({
    isOpen,
    onClose,
    breakdown,
    date,
    total,
    isEditing = false,
    onUpdate,
    onSave,
    saving = false,
    layer,
    instance,
    parentInstance,
}: CashBreakdownModalProps) {
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    const displayBreakdown = useMemo(() => {
        if (isEditing) {
            return {
                ...DENOMINATIONS.reduce((acc, d) => ({ ...acc, [d.toString()]: 0 }), {} as Record<string, number>),
                ...(breakdown ?? {}),
            };
        }
        return breakdown ?? {};
    }, [isEditing, breakdown]);

    const titleDate = useMemo(() => {
        if (!date) return '';
        const d = parseLocalDateSafe(date);
        return isNaN(d.getTime()) ? 'Fecha Inválida' : format(d, 'eeee d MMM', { locale: es });
    }, [date]);

    const editCounts = useMemo(() => {
        return Object.fromEntries(
            DENOMINATIONS.map((d) => [d, Number(displayBreakdown?.[String(d)] ?? displayBreakdown?.[d] ?? 0)])
        ) as Record<number, number>;
    }, [displayBreakdown]);

    const resolvedLayer: ModalLayer = layer ?? (parentInstance || isEditing ? 'derived' : 'base');
    const resolvedInstance =
        instance ?? (resolvedLayer === 'derived' ? 'history-cash-breakdown' : 'master-last-closing-cash-breakdown');

    return (
        <Modal
            open={isOpen}
            onClose={onClose}
            variant={isEditing ? 'amplify' : 'compact'}
            layer={resolvedLayer}
            instance={resolvedInstance}
            parentInstance={parentInstance}
            title={titleDate}
            subtitle="Arqueo de Efectivo"
            headerTone="petroleum"
            scrollContent={!isEditing}
            footer={
                isEditing ? (
                    <CashCountFooter
                        total={total}
                        instancePrefix={resolvedInstance}
                        onCancel={onClose}
                        onSave={onSave}
                        saveLoading={saving}
                        saveLabel="Guardar"
                    />
                ) : undefined
            }
        >
            {isEditing && (
                <>
                    <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
                    <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                </>
            )}
            {isEditing ? (
                <DenominationCountGrid
                    counts={editCounts}
                    onAdjust={(denom, delta) => {
                        const current = Number(displayBreakdown?.[String(denom)] ?? displayBreakdown?.[denom] ?? 0);
                        onUpdate?.(String(denom), Math.max(0, current + delta));
                    }}
                    onChange={(denom, raw) => onUpdate?.(String(denom), parseInt(raw, 10) || 0)}
                />
            ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar px-3 pt-1 pb-2.5 sm:px-4">
                        <div className="grid grid-cols-5 gap-x-2 gap-y-1.5 p-0.5">
                            {DENOMINATIONS.map((denom) => {
                                const qty = Number(displayBreakdown?.[String(denom)] ?? displayBreakdown?.[denom] ?? 0);
                                return (
                                    <div key={denom} className="flex flex-col items-center gap-0.5">
                                        <div className="flex h-8 min-h-[36px] w-full items-center justify-center rounded-lg sm:h-9">
                                            <Image
                                                src={CURRENCY_IMAGES[denom]}
                                                alt={denom < 1 ? `${(denom * 100).toFixed(0)}c` : `${denom}€`}
                                                width={140}
                                                height={140}
                                                className="pointer-events-none h-full w-auto object-contain drop-shadow-lg"
                                            />
                                        </div>
                                        <div className="w-full text-center">
                                            <span className="mb-0 block text-[7px] font-black uppercase tracking-widest text-gray-500">
                                                {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                            </span>
                                            <div className="mx-auto flex h-8 w-[86%] items-center justify-center rounded-lg border border-zinc-200 bg-white shadow-sm">
                                                <span className="text-[9px] font-black tabular-nums tracking-tighter text-zinc-700">
                                                    {qty > 0 ? qty : ' '}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-2.5 pt-2 border-t border-gray-100 flex justify-between items-center px-2">
                            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Total Contado</span>
                            <span className="text-2xl font-black text-[#36606F]">{formatCurrencySpanish(total)}</span>
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
}
