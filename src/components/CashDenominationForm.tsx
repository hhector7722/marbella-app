'use client';

import { useState } from 'react';
import { X, Save, Calendar } from 'lucide-react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES, DENOMINATIONS } from '@/lib/constants';

interface CashDenominationFormProps {
    type: 'in' | 'out' | 'audit';
    boxName: string;
    onSubmit: (total: number, breakdown: any, notes: string, date?: string) => void; // Updated signature
    onCancel: () => void;
    initialCounts?: any;
    availableStock?: Record<number, number>;
    initialNotes?: string;
    initialDate?: string; // New prop
    submitLabel?: string;
    isEditing?: boolean; // New prop
}

export const CashDenominationForm = ({
    type,
    boxName,
    onSubmit,
    onCancel,
    initialCounts = {},
    availableStock = {},
    initialNotes = '',
    initialDate,
    submitLabel,
    isEditing = false
}: CashDenominationFormProps) => {
    const [counts, setCounts] = useState<Record<number, number>>(initialCounts);
    const [notes, setNotes] = useState(initialNotes);
    // Initialize date state. If initialDate is provided, use it, otherwise default to now (though usually for new movements we rely on DB default, but here we can be explicit if needed, or just leave undefined for new).
    // For editing, initialDate will be present.
    // datetime-local input expects YYYY-MM-DDThh:mm
    const formatForInput = (dateStr?: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    };

    // If strict editing is required, we manage state. 
    // Default to NOW if no initialDate provided
    const nowStr = new Date(new Date().getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    const [selectedDate, setSelectedDate] = useState(initialDate ? formatForInput(initialDate) : nowStr);

    const calculateTotal = () => DENOMINATIONS.reduce((acc, val) => acc + (val * (counts[val] || 0)), 0);
    const handleCountChange = (val: number, qty: string) => setCounts(prev => ({ ...prev, [val]: parseInt(qty) || 0 }));
    const total = calculateTotal();
    const isAudit = type === 'audit';
    const bgClass = isAudit ? 'bg-orange-400' : (type === 'in' ? 'bg-emerald-400' : 'bg-rose-400');

    return (
        <div className="flex flex-col h-full overflow-hidden bg-white rounded-2xl">
            <div className="bg-[#36606F] px-6 py-2.5 flex justify-between items-center text-white shrink-0">
                <div>
                    <h3 className="text-lg font-black uppercase tracking-wider">
                        {isAudit ? 'Arqueo' : (type === 'in' ? 'Entrada' : 'Salida')}
                    </h3>
                    <p className="text-white/50 text-[10px] font-black uppercase tracking-[0.2em]">{boxName}</p>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <span className="block text-[8px] uppercase tracking-widest opacity-50 font-black">Total Acumulado</span>
                        <span className="text-xl font-black">{total.toFixed(2)}€</span>
                    </div>
                </div>
                <button onClick={onCancel} className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                    <X size={20} strokeWidth={3} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 space-y-4">
                {/* DATE & NOTES ROW */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-2">
                    <div className="flex flex-col justify-end bg-white/50 p-2 rounded-xl border border-zinc-200/50 shadow-sm">
                        <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1 ml-1 flex items-center gap-1">
                            <Calendar size={8} />
                            Fecha y Hora
                        </label>
                        <input
                            type="datetime-local"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="w-full bg-transparent border-none p-0 text-zinc-600 text-[11px] font-black uppercase tracking-widest outline-none focus:ring-0 cursor-pointer hover:text-[#5B8FB9] transition-colors"
                        />
                    </div>
                    {!isAudit && (
                        <div className="flex flex-col">
                            <label className="block text-[8px] font-black text-gray-400 uppercase tracking-widest mb-0.5 ml-1">Concepto / Motivo</label>
                            <input
                                type="text"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ej. Cambio banco, Pago proveedor..."
                                className="w-full p-2.5 rounded-xl border-2 border-transparent focus:border-[#5B8FB9]/20 bg-white shadow-sm outline-none transition-all font-bold placeholder:text-gray-300 text-xs"
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-4 sm:grid-cols-5 gap-y-2 gap-x-1.5 p-0.5">
                    {DENOMINATIONS.map(denom => (
                        <div key={denom} className="flex flex-col items-center gap-1 group transition-all">
                            <div className={cn("w-full flex items-center justify-center transition-transform group-hover:scale-110", denom >= 5 ? "h-14" : "h-10")}>
                                <Image src={CURRENCY_IMAGES[denom]} alt={`${denom}€`} width={140} height={140} className="h-full w-auto object-contain drop-shadow-lg" />
                            </div>
                            <div className="text-center w-full">
                                <span className="font-black text-gray-500 text-[9px] uppercase tracking-widest block mb-0.5">
                                    {denom >= 1 ? `${denom}€` : `${(denom * 100).toFixed(0)}c`}
                                </span>
                                <input
                                    type="number"
                                    min="0"
                                    value={counts[denom] || ''}
                                    onChange={(e) => handleCountChange(denom, e.target.value)}
                                    placeholder="0"
                                    className={cn(
                                        "w-full bg-white border-2 rounded-xl p-1.5 text-center font-black outline-none text-xs focus:ring-4 transition-all shadow-sm",
                                        type === 'out' && (counts[denom] || 0) > (availableStock[denom] || 0) ? "border-rose-400 text-rose-600 focus:ring-rose-100" : "border-transparent focus:border-[#5B8FB9]/20 text-[#5B8FB9] focus:ring-[#5B8FB9]/5"
                                    )}
                                />
                                {type === 'out' && (availableStock[denom] || 0) > 0 && (
                                    <span className="text-[7px] font-bold text-gray-400 uppercase">Disp: {availableStock[denom]}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            <div className="p-3 bg-white border-t flex gap-2 shrink-0">
                <button
                    onClick={onCancel}
                    className="flex-1 py-3 text-gray-500 font-black uppercase tracking-widest text-[9px] hover:bg-gray-100 rounded-xl transition-all active:scale-95"
                >
                    Cancelar
                </button>
                <button
                    onClick={() => onSubmit(total, counts, notes, selectedDate ? new Date(selectedDate).toISOString() : undefined)}
                    disabled={!isEditing && type === 'out' && Object.entries(counts).some(([denom, qty]) => qty > (availableStock[Number(denom)] || 0))}
                    className={cn(
                        "flex-1 py-3 text-white font-black uppercase tracking-widest text-[9px] rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all active:scale-95",
                        (!isEditing && type === 'out' && Object.entries(counts).some(([denom, qty]) => qty > (availableStock[Number(denom)] || 0)))
                            ? "bg-gray-300 opacity-50 cursor-not-allowed shadow-none"
                            : bgClass + " hover:brightness-110 shadow-emerald-200"
                    )}
                >
                    <Save size={18} strokeWidth={3} />
                    {submitLabel || (isAudit ? 'Ajustar Arqueo' : 'Confirmar Operación')}
                </button>
            </div>
        </div>
    );
};
