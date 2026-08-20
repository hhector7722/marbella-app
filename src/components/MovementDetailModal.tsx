'use client';

import { useEffect, useState } from 'react';
import { Calculator, Calendar, Clock, FileText, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { QuickCalculatorModal, FloatingCalculatorFab } from '@/components/ui/QuickCalculatorModal';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { CashDenominationForm } from './CashDenominationForm';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface MovementDetailModalProps {
    movement: any;
    onClose: () => void;
    onAfterMutation?: () => Promise<void> | void;
}

export function MovementDetailModal({ movement, onClose, onAfterMutation }: MovementDetailModalProps) {
    const supabase = createClient();
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [calculatorOpen, setCalculatorOpen] = useState(false);

    useEffect(() => {
        setIsEditing(false);
        setIsDeleting(false);
        setCalculatorOpen(false);
    }, [movement?.id]);

    if (!movement) return null;

    const originalType = movement.original_type ?? movement.type;
    const movementDate = new Date(movement.created_at);
    const hasValidMovementDate = !Number.isNaN(movementDate.getTime());
    const amountNum = Number(movement.amount ?? 0);

    const isIncome = originalType === 'IN' || originalType === 'CLOSE_ENTRY' || movement.type === 'income';
    const isAdjustment = originalType === 'ADJUSTMENT' || movement.type === 'adjustment';
    const isSwap = originalType === 'SWAP' || movement.type === 'SWAP';
    const canEdit = !isSwap;

    const breakdown = movement.breakdown || {};
    const hasBreakdown = Object.keys(breakdown).length > 0;

    const handleDelete = async () => {
        try {
            const { error } = await supabase.from('treasury_log').delete().eq('id', movement.id);
            if (error) throw error;
            toast.success('Movimiento eliminado correctamente');
            onClose();
            await onAfterMutation?.();
        } catch (error) {
            console.error(error);
            const msg = (error as any)?.message || 'Error desconocido';
            toast.error(`Error al eliminar movimiento: ${msg}`);
        }
    };

    const handleUpdate = async (total: number, newBreakdown: any, newNotes: string, newDate?: string) => {
        try {
            const updatePayload: any = {
                amount: total,
                breakdown: newBreakdown,
                notes: newNotes
            };
            if (newDate) updatePayload.created_at = newDate;

            const { error } = await supabase.from('treasury_log').update(updatePayload).eq('id', movement.id);
            if (error) throw error;
            toast.success('Movimiento actualizado');
            onClose();
            await onAfterMutation?.();
        } catch (error) {
            console.error(error);
            const msg = (error as any)?.message || 'Error desconocido';
            toast.error(`Error al actualizar movimiento: ${msg}`);
        }
    };

    const detailTitle = isSwap ? 'Intercambio de Caja' : isAdjustment ? 'Arqueo de Caja' : isIncome ? 'Entrada de Efectivo' : 'Salida de Efectivo';

    if (isEditing) {
        if (!canEdit) {
            return (
                <Modal
                    open
                    onClose={onClose}
                    variant="amplify"
                    layer="base"
                    instance="treasury-movement-edit"
                    usageId="treasury-movement-edit"
                    usageLabel="Edición no disponible"
                    headerTone="petroleum"
                    headerTitleAlign="left"
                    title="Edición no disponible"
                    subtitle="Los intercambios (SWAP) requieren editor in/out específico."
                    footer={
                        <Button
                            type="button"
                            variant="secondary"
                            instance="treasury-movement-edit-back"
                            onClick={() => setIsEditing(false)}
                        >
                            Volver
                        </Button>
                    }
                >
                    <div />
                </Modal>
            );
        }

        return (
            <Modal
                open
                onClose={() => setIsEditing(false)}
                variant="amplify"
                layer="base"
                instance="treasury-movement-edit"
                usageId="treasury-movement-edit"
                usageLabel="Editar movimiento"
                headerTone="petroleum"
                title="Editar movimiento"
                ariaLabel="Editar movimiento"
            >
                    <CashDenominationForm
                        variant="embedded"
                        type={isAdjustment ? 'audit' : (isIncome ? 'in' : 'out')}
                        boxName="Editando Movimiento"
                        initialCounts={breakdown}
                        initialNotes={movement.notes}
                        initialDate={movement.created_at}
                        submitLabel="Guardar Cambios"
                        onSubmit={handleUpdate}
                        onCancel={() => setIsEditing(false)}
                        isEditing={true}
                        availableStock={{}}
                    />
            </Modal>
        );
    }

    const renderDenomGrid = (counts: Record<string, number>, title?: string, colorClass?: string) => {
        const activeDenoms = DENOMINATIONS.filter(d => (counts[d.toString()] || counts[d]) > 0);

        if (activeDenoms.length === 0) return null;

        return (
            <div className="space-y-3">
                {title && (
                    <h4 className={cn("text-[10px] font-black uppercase tracking-[0.2em]", colorClass || "text-zinc-400")}>
                        {title}
                    </h4>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {activeDenoms.map(denom => {
                        const count = counts[denom.toString()] || counts[denom];
                        return (
                            <div key={denom} className="flex items-center gap-3 p-2 bg-zinc-50 rounded-xl border border-zinc-100/50">
                                <div className="relative w-8 h-5 flex items-center justify-center shrink-0">
                                    <Image
                                        src={CURRENCY_IMAGES[denom]}
                                        alt={`${denom}€`}
                                        width={40}
                                        height={30}
                                        className="h-full w-auto object-contain drop-shadow-sm"
                                    />
                                </div>
                                <div className="flex flex-col leading-none">
                                    <span className="text-[10px] font-black text-zinc-900">
                                        {count} x {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                    </span>
                                    <span className="text-[9px] font-bold text-zinc-400">
                                        {(count * denom) > 0.005 ? `${(count * denom).toFixed(2)}€` : " "}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    return (
        <Modal
            open
            onClose={onClose}
            variant="standard"
            layer="base"
            instance="treasury-movement-detail"
            usageId="treasury-movement-detail"
            usageLabel={detailTitle}
            headerTone="petroleum"
            headerTitleAlign="left"
            title={detailTitle}
            subtitle="Detalle de movimiento"
            footer={
                isDeleting ? (
                    <div className="flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-100 bg-rose-50 p-3">
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-rose-500" size={20} />
                            <div>
                                <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider">¿Eliminar movimiento?</p>
                                <p className="text-[9px] text-rose-400 font-bold">Esta acción es irreversible</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                type="button"
                                variant="secondary"
                                layout="hug"
                                instance="treasury-movement-delete-cancel"
                                onClick={() => setIsDeleting(false)}
                            >
                                Cancelar
                            </Button>
                            <Button
                                type="button"
                                variant="destructive"
                                layout="hug"
                                instance="treasury-movement-delete-confirm"
                                onClick={handleDelete}
                            >
                                Confirmar
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="flex w-full justify-end gap-3">
                        <Button
                            type="button"
                            variant="destructive"
                            instance="treasury-movement-delete"
                            onClick={() => setIsDeleting(true)}
                        >
                            Eliminar
                        </Button>
                        {canEdit && (
                            <Button
                                type="button"
                                variant="tertiary"
                                instance="treasury-movement-edit"
                                onClick={() => setIsEditing(true)}
                            >
                                Editar
                            </Button>
                        )}
                    </div>
                )
            }
        >
                <div className={cn(
                    "text-white",
                    isIncome ? "bg-emerald-600" : isAdjustment ? "bg-orange-500" : "bg-rose-600"
                )}>
                    <div className="flex flex-col items-center justify-center py-2">
                        <span className="text-4xl font-black italic tracking-tight">
                            {isSwap ? '' : isAdjustment ? '' : (isIncome ? '+' : '-')}{Math.abs(amountNum) > 0.005 ? `${Math.abs(amountNum).toFixed(2)}€` : " "}
                        </span>
                        {isAdjustment && (
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] mt-1 opacity-80">
                                {amountNum >= 0 ? 'Sobrante' : 'Faltante'}
                            </span>
                        )}
                    </div>
                </div>

                <div className="p-6 space-y-8">
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-3 bg-blue-500 p-3 rounded-2xl border border-white/10 shadow-sm transition-all">
                            <Calendar size={16} className="text-white/60" />
                            <span className="text-[11px] font-black text-white uppercase tracking-widest truncate">
                                {hasValidMovementDate ? format(movementDate, 'd MMM yyyy', { locale: es }) : '--'}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-100 shadow-sm transition-all">
                            <Clock size={16} className="text-zinc-400" />
                            <span className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                                {hasValidMovementDate ? format(movementDate, 'HH:mm') : '--:--'}
                            </span>
                        </div>
                    </div>

                    {movement.notes && (
                        <div className="flex gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                            <FileText size={18} className="text-zinc-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Concepto / Notas</span>
                                <p className="text-[13px] font-bold text-zinc-700 italic leading-snug">{movement.notes}</p>
                            </div>
                        </div>
                    )}

                    {hasBreakdown ? (
                        <div className="space-y-6 pt-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Calculator size={14} className="text-zinc-400" />
                                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.2em]">Desglose de efectivo</span>
                            </div>

                            {isSwap ? (
                                <div className="space-y-6">
                                    {renderDenomGrid(breakdown.in || {}, "Entra", "text-emerald-500")}
                                    <div className="border-t border-zinc-100 my-4" />
                                    {renderDenomGrid(breakdown.out || {}, "Sale", "text-rose-500")}
                                </div>
                            ) : (
                                renderDenomGrid(breakdown)
                            )}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-10 opacity-20 select-none">
                            <Calculator size={40} strokeWidth={1} />
                            <p className="text-[10px] font-black uppercase tracking-widest mt-4">Sin desglose disponible</p>
                        </div>
                    )}
                </div>
                <FloatingCalculatorFab isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
        </Modal>
    );
}
