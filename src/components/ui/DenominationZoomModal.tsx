'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Minus, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CURRENCY_IMAGES } from '@/lib/constants';

/** Modal tipo "zoom" para editar un único valor de denominación (mismo patrón que OrderProductCard en /orders/new). */
export interface DenominationZoomModalProps {
    isOpen: boolean;
    onClose: () => void;
    denomination: number;
    value: number;
    onValueChange: (newValue: number) => void;
    /** Opcional: mostrar aviso de stock disponible (ej. "Disp: 5") */
    availableStock?: number;
    /** Clase extra para el contenedor del modal */
    className?: string;
}

export function DenominationZoomModal({
    isOpen,
    onClose,
    denomination,
    value,
    onValueChange,
    availableStock,
    className,
}: DenominationZoomModalProps) {
    const [inputVal, setInputVal] = useState(String(value));

    useEffect(() => {
        if (isOpen) setInputVal(value === 0 ? '' : String(value));
    }, [isOpen, value]);

    if (!isOpen) return null;

    const handleInputChange = (raw: string) => {
        setInputVal(raw);
        const n = raw === '' ? 0 : Math.max(0, parseInt(raw, 10) || 0);
        onValueChange(n);
    };

    const handleAdjust = (delta: number) => {
        const next = Math.max(0, value + delta);
        setInputVal(next === 0 ? '' : String(next));
        onValueChange(next);
    };

    return (
        <div
            className="fixed inset-0 z-[400] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-3 sm:p-4"
            onClick={onClose}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'bg-white rounded-2xl shadow-2xl overflow-hidden w-full max-w-[280px] animate-in zoom-in-95 duration-200 flex flex-col max-h-[calc(100dvh-2rem)]',
                    className
                )}
            >
                <div className="bg-[#36606F] px-4 py-3 flex items-center justify-between text-white shrink-0">
                    <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                        {denomination >= 1 ? `${denomination}€` : `${(denomination * 100).toFixed(0)} céntimos`}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-white/10 text-white min-h-[48px] min-w-[48px] shrink-0"
                        aria-label="Cerrar"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-4 sm:p-6 flex-1 min-h-0 overflow-y-auto flex flex-col items-center gap-4">
                    <div className="w-full h-28 flex items-center justify-center bg-gray-50 rounded-xl border border-zinc-100">
                        <Image
                            src={CURRENCY_IMAGES[denomination]}
                            alt={`${denomination}€`}
                            width={200}
                            height={200}
                            className="h-full w-auto object-contain drop-shadow-lg"
                        />
                    </div>
                    <div className="text-center w-full">
                        <div className="flex items-center justify-between w-full h-12 min-h-[48px] bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm focus-within:ring-2 focus-within:ring-offset-1 focus-within:border-[#5B8FB9]/40 focus-within:ring-[#5B8FB9]/20">
                            <button
                                type="button"
                                onClick={() => handleAdjust(-1)}
                                className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-rose-50 hover:text-rose-500 active:bg-rose-100 transition-colors shrink-0 min-h-[48px]"
                            >
                                <Minus size={20} strokeWidth={3} />
                            </button>
                            <input
                                type="number"
                                min={0}
                                value={inputVal}
                                onChange={(e) => handleInputChange(e.target.value)}
                                placeholder=""
                                className="flex-1 w-0 h-full bg-transparent text-center font-black text-zinc-700 outline-none px-2 text-lg tracking-tighter tabular-nums focus:bg-blue-50/20 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <button
                                type="button"
                                onClick={() => handleAdjust(1)}
                                className="w-12 h-full flex items-center justify-center text-zinc-400 hover:bg-emerald-50 hover:text-emerald-500 active:bg-emerald-100 transition-colors shrink-0 min-h-[48px]"
                            >
                                <Plus size={20} strokeWidth={3} />
                            </button>
                        </div>
                        {availableStock !== undefined && availableStock > 0 && (
                            <span className="text-[8px] font-bold text-gray-400 uppercase mt-1.5 block">Disp: {availableStock}</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
