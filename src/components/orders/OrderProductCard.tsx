'use client';

import { useState, useEffect, useCallback } from 'react';
import { Minus, Plus, Trash2, Package } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    current_price: number;
    purchase_unit: string;
    image_url: string | null;
    order_unit?: string | null;
}

interface OrderProductCardProps {
    ingredient: Ingredient;
    initialQuantity?: number;
    initialUnit?: string | null;
    userId: string;
    onQuantityChange?: (ingredientId: string, quantity: number, unit: string) => void;
}

export function OrderProductCard({ ingredient, initialQuantity = 0, initialUnit, userId, onQuantityChange }: OrderProductCardProps) {
    const supabase = createClient();
    const [quantity, setQuantity] = useState(initialQuantity);
    const [unit, setUnit] = useState(initialUnit || ingredient.order_unit || 'unidad');
    const [isUpdating, setIsUpdating] = useState(false);
    const [isCustomUnit, setIsCustomUnit] = useState(false);
    const [customUnit, setCustomUnit] = useState('');

    const unitOptions = ['pack', 'caja', 'unidad', 'kg', 'pieza', 'lt', 'otro...'];

    // Debounced draft update
    useEffect(() => {
        if (quantity === initialQuantity && unit === (initialUnit || ingredient.order_unit || 'unidad')) return;

        const timer = setTimeout(async () => {
            setIsUpdating(true);
            try {
                const finalUnit = isCustomUnit ? customUnit : unit;
                if (quantity > 0) {
                    await supabase.from('order_drafts').upsert({
                        user_id: userId,
                        ingredient_id: ingredient.id,
                        quantity: quantity,
                        unit: finalUnit,
                        updated_at: new Date().toISOString()
                    });

                    // Also update the ingredient's default order unit for next time
                    await supabase.from('ingredients').update({
                        order_unit: finalUnit
                    }).eq('id', ingredient.id);

                } else {
                    await supabase.from('order_drafts').delete()
                        .eq('user_id', userId)
                        .eq('ingredient_id', ingredient.id);
                }
                onQuantityChange?.(ingredient.id, quantity, finalUnit);
            } catch (error) {
                console.error('Error updating draft:', error);
            } finally {
                setIsUpdating(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [quantity, unit, isCustomUnit, customUnit, userId, ingredient.id, supabase, onQuantityChange, initialQuantity, initialUnit, ingredient.order_unit]);

    const handleIncrement = () => setQuantity(prev => prev + 1);
    const handleDecrement = () => setQuantity(prev => Math.max(0, prev - 1));
    const handleTrash = () => setQuantity(0);

    return (
        <div className="relative group overflow-hidden h-full">
            <div className={cn(
                "bg-white rounded-xl shadow-sm transition-all flex flex-col h-full overflow-hidden",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-md" : "hover:shadow-md hover:-translate-y-0.5"
            )}>
                <div className="p-1.5 sm:p-3 flex-1 flex flex-col">
                    {/* Product Image Area (Square Gallery Style) */}
                    <div className="aspect-square w-full flex items-center justify-center mb-1.5 sm:mb-3 relative grayscale-[0.1] group-hover:grayscale-0 transition-all overflow-hidden">
                        {ingredient.image_url ? (
                            <img src={ingredient.image_url} className="w-full h-full object-contain p-1 sm:p-2" alt={ingredient.name} />
                        ) : (
                            <Package className="text-gray-200 w-8 h-8 sm:w-10 sm:h-10" />
                        )}
                        {isUpdating && (
                            <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
                                <LoadingSpinner size="sm" className="text-[#5E35B1]" />
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-col px-0.5 mb-1 sm:mb-2 mt-auto">
                        <span className="font-bold text-gray-800 text-[9px] sm:text-[11px] leading-[1.1] line-clamp-2 min-h-[1.1rem] sm:min-h-[2.2rem]" title={ingredient.name}>
                            {ingredient.name}
                        </span>
                    </div>
                </div>

                {/* Controls & Unit (Bottom Area) */}
                <div className="bg-[#36606F] p-1.5 sm:p-2 flex flex-row items-center justify-between gap-0.5 shrink-0 shadow-inner w-full">
                    <button
                        onClick={handleDecrement}
                        disabled={quantity === 0}
                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg active:scale-95 disabled:opacity-30 transition-all shrink-0 p-0"
                    >
                        <Minus size={14} strokeWidth={3} className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>

                    <input
                        type="number"
                        value={quantity === 0 ? "" : quantity}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setQuantity(isNaN(val) ? 0 : Math.max(0, val));
                        }}
                        placeholder="0"
                        className="w-6 sm:w-10 bg-transparent text-center font-black text-xs sm:text-sm text-white outline-none shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {isCustomUnit ? (
                        <div className="flex items-center shrink-0 min-w-0">
                            <input
                                type="text"
                                value={customUnit}
                                onChange={(e) => setCustomUnit(e.target.value)}
                                placeholder="?"
                                className="w-8 sm:w-12 text-[7px] sm:text-[10px] font-bold uppercase bg-white/10 text-white rounded px-0.5 sm:px-1 py-0.5 sm:py-1 outline-none text-center"
                                autoFocus
                            />
                            <button
                                onClick={() => setIsCustomUnit(false)}
                                className="text-[7px] sm:text-[10px] text-white/50 hover:text-white font-bold ml-0.5 sm:ml-1 shrink-0 p-0.5"
                            >
                                ✕
                            </button>
                        </div>
                    ) : (
                        <select
                            value={unit}
                            onChange={(e) => {
                                if (e.target.value === 'otro...') {
                                    setIsCustomUnit(true);
                                } else {
                                    setUnit(e.target.value);
                                }
                            }}
                            className="w-auto text-center text-[7px] sm:text-[10px] font-black uppercase bg-transparent text-white/90 outline-none appearance-none cursor-pointer hover:text-white transition-colors shrink-0 overflow-visible"
                        >
                            {unitOptions.map(opt => (
                                <option key={opt} value={opt} className="text-zinc-800">{opt}</option>
                            ))}
                        </select>
                    )}

                    <button
                        onClick={handleIncrement}
                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg active:scale-95 transition-all shrink-0 p-0"
                    >
                        <Plus size={14} strokeWidth={3} className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                </div>

                {quantity > 0 && (
                    <button
                        onClick={handleTrash}
                        className="absolute top-1 right-1 w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center bg-white/90 backdrop-blur shadow-sm rounded-full text-rose-500 hover:bg-rose-50 transition-all animate-in zoom-in duration-200"
                    >
                        <Trash2 size={12} className="sm:w-4 sm:h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
