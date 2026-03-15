'use client';

import { useState } from 'react';
import { X, Trash2, CheckCircle2, ArrowRight } from 'lucide-react';
import { cn } from "@/lib/utils";
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { QuickCalculatorModal, CalculatorHeaderButton } from '@/components/ui/QuickCalculatorModal';

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
    const [calculatorOpen, setCalculatorOpen] = useState(false);
    if (!isOpen) return null;

    const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh] animate-in zoom-in duration-300">
                {/* Header */}
                <div className="bg-[#36606F] py-2 px-4 sm:py-4 sm:px-8 flex justify-between items-center shrink-0">
                    <h2 className="text-sm sm:text-xl font-black text-white uppercase tracking-widest">Pedido</h2>
                    <div className="flex items-center gap-1 shrink-0">
                        <CalculatorHeaderButton isOpen={calculatorOpen} onToggle={() => setCalculatorOpen(true)} />
                        <button onClick={onClose} className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center">
                            <X className="text-white w-5 h-5 sm:w-6 sm:h-6" />
                        </button>
                    </div>
                </div>
                <QuickCalculatorModal isOpen={calculatorOpen} onClose={() => setCalculatorOpen(false)} />

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto px-1 sm:px-6 py-2 sm:py-6">
                    <table className="w-full text-left border-separate border-spacing-y-1 sm:border-spacing-y-2 table-fixed">
                        <thead>
                            <tr className="text-[8px] sm:text-[10px] font-black text-gray-400 uppercase tracking-widest border-b border-zinc-100">
                                <th className="px-2 sm:px-4 py-2 sm:py-4 w-[55%]">Producto</th>
                                <th className="px-2 sm:px-4 py-2 sm:py-4 text-center w-[20%]">Cant.</th>
                                <th className="px-2 sm:px-4 py-2 sm:py-4 text-right w-[25%]">U.</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item) => (
                                <tr key={item.id} className="border-b border-zinc-50 group hover:bg-zinc-50/50 transition-colors">
                                    <td className="px-2 sm:px-4 py-1 sm:py-4">
                                        <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
                                            <div className="w-8 h-8 sm:w-14 sm:h-14 bg-white rounded-lg sm:rounded-xl flex items-center justify-center overflow-hidden border border-zinc-100 shrink-0">
                                                {item.image_url ? (
                                                    <img src={item.image_url} className="w-full h-full object-contain p-0.5 sm:p-1" alt={item.name} />
                                                ) : (
                                                    <div className="w-4 h-4 sm:w-6 sm:h-6 bg-zinc-100 rounded-full" />
                                                )}
                                            </div>
                                            <span className="font-bold text-gray-700 text-[10px] sm:text-base truncate">{item.name}</span>
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-4 py-1 sm:py-4 text-center">
                                        <span className="font-black text-[#36606F] text-sm sm:text-xl">{item.quantity}</span>
                                    </td>
                                    <td className="px-2 sm:px-4 py-1 sm:py-4 text-right">
                                        <span className="text-[7px] sm:text-xs text-gray-400 font-bold uppercase py-0.5 sm:py-1 px-1.5 sm:px-3 bg-zinc-100 rounded-full tracking-wider whitespace-nowrap">
                                            {item.unit}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Footer / Totals */}
                <div className="p-3 sm:p-8 bg-zinc-50/50 border-t border-zinc-100 flex flex-col sm:flex-row items-center justify-end gap-6 shrink-0">

                    <button
                        onClick={onConfirm}
                        disabled={isProcessing}
                        className={cn(
                            "w-full sm:w-auto px-6 sm:px-10 py-3 sm:py-5 bg-[#5E35B1] text-white rounded-xl sm:rounded-2xl font-black text-xs sm:text-sm uppercase tracking-widest shadow-lg sm:shadow-xl shadow-purple-100 flex items-center justify-center gap-2 sm:gap-3 transition-all active:scale-95 disabled:opacity-50",
                            isProcessing && "animate-pulse"
                        )}
                    >
                        {isProcessing ? (
                            <>
                                <LoadingSpinner size="sm" className="text-white" />
                                <span>Procesando...</span>
                            </>
                        ) : (
                            <>
                                <ArrowRight size={18} />
                                <span>Continuar</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
