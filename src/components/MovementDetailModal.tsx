'use client';

import { useState } from 'react';
import { X, ArrowDown, ArrowUp, RefreshCw, Calculator, Calendar, Clock, FileText, Trash2, Edit2, AlertTriangle, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import Image from 'next/image';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';
import { createClient } from "@/utils/supabase/client";
import { toast } from 'sonner';
import { CashDenominationForm } from './CashDenominationForm';

interface MovementDetailModalProps {
    movement: any;
    onClose: () => void;
}

export function MovementDetailModal({ movement, onClose }: MovementDetailModalProps) {
    const supabase = createClient();
    const [isEditing, setIsEditing] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    if (!movement) return null;

    const isIncome = movement.type === 'income' || movement.type === 'IN' || movement.type === 'CLOSE_ENTRY';
    const isAdjustment = movement.type === 'ADJUSTMENT';
    const isSwap = movement.type === 'SWAP';

    // Normalize breakdown
    const breakdown = movement.breakdown || {};
    const hasBreakdown = Object.keys(breakdown).length > 0;

    const handleDelete = async () => {
        try {
            const { error } = await supabase.from('treasury_log').delete().eq('id', movement.id);
            if (error) throw error;
            toast.success('Movimiento eliminado correctamente');
            // Recargar página para actualizar datos (simple y efectivo dado el trigger)
            window.location.reload();
        } catch (error) {
            console.error(error);
            toast.error('Error al eliminar mvoimiento');
        }
    };

    // Persistencia solo al pulsar "Guardar Cambios" en el formulario (nunca en onChange/blur/cerrar).
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
            window.location.reload();
        } catch (error) {
            console.error(error);
            toast.error('Error al actualizar movimiento');
        }
    };

    if (isEditing) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                <div
                    className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 h-[85vh] flex flex-col"
                    onClick={e => e.stopPropagation()}
                >
                    <CashDenominationForm
                        type={isAdjustment ? 'audit' : (isIncome ? 'in' : 'out')}
                        boxName="Editando Movimiento"
                        initialCounts={breakdown}
                        initialNotes={movement.notes}
                        initialDate={movement.created_at}
                        submitLabel="Guardar Cambios"
                        onSubmit={handleUpdate}
                        onCancel={() => setIsEditing(false)}
                        isEditing={true}
                        // En edición no validamos stock estricto porque estamos modificando historia
                        availableStock={{}}
                    />
                </div>
            </div>
        );
    }

    const renderDenomGrid = (counts: Record<string, number>, title?: string, colorClass?: string) => {
        // Only show denoms with count > 0
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose}>
            <div
                className="bg-white rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* HEADER */}
                <div className={cn(
                    "p-6 text-white relative shrink-0",
                    isIncome ? "bg-emerald-600" : isAdjustment ? "bg-orange-500" : "bg-rose-600"
                )}>
                    {/* TYPE ICON & TITLE */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                                {isIncome ? <ArrowDown size={20} /> : isAdjustment ? <RefreshCw size={20} /> : <ArrowUp size={20} />}
                            </div>
                            <div>
                                <h3 className="text-sm font-black uppercase tracking-widest leading-none">
                                    {isAdjustment ? 'Arqueo de Caja' : isIncome ? 'Entrada de Efectivo' : 'Salida de Efectivo'}
                                </h3>
                                <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mt-1">Detalle de movimiento</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center bg-white/20 rounded-full hover:bg-white/30 transition-all active:scale-95">
                            <X size={20} strokeWidth={3} />
                        </button>
                    </div>

                    {/* MAIN AMOUNT */}
                    <div className="flex flex-col items-center justify-center py-2">
                        <span className="text-4xl font-black italic tracking-tight">
                            {isAdjustment ? '' : (isIncome ? '+' : '-')}{Math.abs(movement.amount) > 0.005 ? `${Math.abs(movement.amount).toFixed(2)}€` : " "}
                        </span>
                        {isAdjustment && (
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] mt-1 opacity-80">
                                {movement.amount >= 0 ? 'Sobrante' : 'Faltante'}
                            </span>
                        )}
                    </div>
                </div>

                {/* CONTENT */}
                <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                    {/* TIME & ID */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex items-center gap-3 bg-blue-500 p-3 rounded-2xl border border-white/10 shadow-sm transition-all">
                            <Calendar size={16} className="text-white/60" />
                            <span className="text-[11px] font-black text-white uppercase tracking-widest truncate">
                                {format(new Date(movement.created_at), 'd MMM yyyy', { locale: es })}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 bg-zinc-50 p-3 rounded-2xl border border-zinc-100 shadow-sm transition-all">
                            <Clock size={16} className="text-zinc-400" />
                            <span className="text-[11px] font-black text-zinc-600 uppercase tracking-widest">
                                {format(new Date(movement.created_at), 'HH:mm')}
                            </span>
                        </div>
                    </div>

                    {/* NOTES */}
                    {movement.notes && (
                        <div className="flex gap-3 p-4 bg-zinc-50 rounded-2xl border border-zinc-100">
                            <FileText size={18} className="text-zinc-400 shrink-0 mt-0.5" />
                            <div className="flex flex-col">
                                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-1">Concepto / Notas</span>
                                <p className="text-[13px] font-bold text-zinc-700 italic leading-snug">{movement.notes}</p>
                            </div>
                        </div>
                    )}

                    {/* BREAKDOWN */}
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

                {/* FOOTER ACTIONS */}
                <div className="p-6 pt-0 shrink-0 grid grid-cols-2 gap-3">
                    {isDeleting ? (
                        <div className="col-span-2 bg-rose-50 p-4 rounded-2xl border border-rose-100 flex items-center justify-between animate-in fade-in zoom-in-95 duration-200">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="text-rose-500" size={20} />
                                <div>
                                    <p className="text-[10px] font-black text-rose-600 uppercase tracking-wider">¿Eliminar movimiento?</p>
                                    <p className="text-[9px] text-rose-400 font-bold">Esta acción es irreversible</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setIsDeleting(false)}
                                    className="px-3 py-2 bg-white text-zinc-500 text-[9px] font-black uppercase rounded-lg hover:bg-zinc-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="px-3 py-2 bg-rose-500 text-white text-[9px] font-black uppercase rounded-lg hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <button
                                onClick={() => setIsDeleting(true)}
                                className="h-12 border border-zinc-200 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-zinc-400 font-black uppercase tracking-widest text-[9px] rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Trash2 size={16} strokeWidth={2.5} />
                                Eliminar
                            </button>

                            <button
                                onClick={() => setIsEditing(true)}
                                className="h-12 border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 hover:text-zinc-600 text-zinc-400 font-black uppercase tracking-widest text-[9px] rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Edit2 size={16} strokeWidth={2.5} />
                                Editar
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
