'use client';

import { X, Trash2, CheckCircle2 } from 'lucide-react';
import { cn } from "@/lib/utils";

interface Ingredient {
    id: string;
    name: string;
    image_url: string | null;
    unit: string;
}

interface OrderSummaryModalProps {
    isOpen: boolean;
    onClose: () => void;
    items: (Ingredient & { quantity: number })[];
    onConfirm: () => void;
    isProcessing: boolean;
}

export function OrderSummaryModal({ isOpen, onClose, items, onConfirm, isProcessing }: OrderSummaryModalProps) {
    if (!isOpen) return null;

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in duration-300">
                {/* Header */}
                <div className="bg-[#36606F] py-4 px-8 flex justify-between items-center shrink-0">
                    <h2 className="text-xl font-black text-white uppercase tracking-widest">Resumen del Pedido</h2>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                        <X className="text-white" size={24} />
                    </button>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    <table className="w-full text-left border-separate border-spacing-y-2">
                        <thead>
                            <tr className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                                <th className="px-4 py-2">Producto</th>
                                <th className="px-4 py-2 text-right">Cantidad / Unidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id} className="bg-zinc-50 rounded-xl overflow-hidden group">
                                    <td className="px-4 py-3 first:rounded-l-xl">
                                        <div className="flex items-center gap-3">
                                            <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center overflow-hidden border border-zinc-100 shrink-0">
                                                {item.image_url ? (
                                                    <img src={item.image_url} className="w-full h-full object-contain p-1" alt={item.name} />
                                                ) : (
                                                    <div className="w-6 h-6 bg-zinc-100 rounded-full" />
                                                )}
                                            </div>
                                            <span className="font-bold text-gray-700 text-sm">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right last:rounded-r-xl">
                                        <div className="flex flex-col items-end">
                                            <span className="font-black text-[#5E35B1] text-lg">{item.quantity}</span>
                                            <span className="text-[10px] text-gray-400 font-bold uppercase">{item.unit}</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Totals */}
                <div className="p-8 bg-zinc-50/50 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-between gap-6 shrink-0">
                    <div className="flex flex-col items-center sm:items-start">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Total de Líneas</span>
                        <span className="text-3xl font-black text-[#36606F]">{items.length}</span>
                    </div>

                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={cn(
                            "w-full sm:w-auto px-10 py-5 bg-[#5E35B1] text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-purple-100 flex items-center justify-center gap-3 transition-all active:scale-95 disabled:opacity-50",
                            isProcessing && "animate-pulse"
                        )}
                    >
                        {isProcessing ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                <span>Procesando...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={20} />
                                <span>Finalizar y Generar PDF</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
