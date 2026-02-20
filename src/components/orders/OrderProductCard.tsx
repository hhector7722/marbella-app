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
                "bg-white rounded-2xl shadow-md transition-all flex flex-col h-full overflow-hidden",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-xl" : "hover:shadow-lg hover:-translate-y-0.5"
            )}>
                <div className="p-3 flex-1 flex flex-col">
                    {/* Product Image */}
                    <div className="h-24 w-full flex items-center justify-center mb-3 relative grayscale-[0.2] group-hover:grayscale-0 transition-all">
                        {ingredient.image_url ? (
                            <img src={ingredient.image_url} className="w-full h-full object-contain p-2" alt={ingredient.name} />
                        ) : (
                            <Package className="text-gray-200 w-10 h-10" />
                        )}
                        {isUpdating && (
                            <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-2xl">
                                <LoadingSpinner size="sm" className="text-[#5E35B1]" />
                            </div>
                        )}
                    </div>

                    {/* Product Info */}
                    <div className="flex flex-col px-1 mb-2 mt-auto">
                        <span className="font-black text-gray-800 text-[11px] leading-tight" title={ingredient.name}>
                            {ingredient.name}
                        </span>
                    </div>
                </div>

                {/* Controls & Unit (Bottom Area) */}
                <div className="bg-[#36606F] p-2 flex flex-row items-center justify-between gap-1 shrink-0 shadow-inner w-full">
                    <button
                        onClick={handleDecrement}
                        disabled={quantity === 0}
                        className="w-8 h-8 flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg active:scale-95 disabled:opacity-30 transition-all shrink-0"
                    >
                        <Minus size={16} strokeWidth={3} />
                    </button>

                    <input
                        type="number"
                        value={quantity === 0 ? "" : quantity}
                        onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setQuantity(isNaN(val) ? 0 : Math.max(0, val));
                        }}
                        placeholder="0"
                        className="w-10 bg-transparent text-center font-black text-sm text-white outline-none shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {isCustomUnit ? (
                        <div className="flex items-center shrink-0">
                            <input
                                type="text"
                                value={customUnit}
                                onChange={(e) => setCustomUnit(e.target.value)}
                                placeholder="?"
                                className="w-12 text-[10px] font-bold uppercase bg-white/10 text-white rounded px-1 py-1 outline-none text-center"
                                autoFocus
                            />
                            <button
                                onClick={() => setIsCustomUnit(false)}
                                className="text-[10px] text-white/50 hover:text-white font-bold ml-1 shrink-0 p-1"
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
                            className="w-auto text-center text-[10px] sm:text-[11px] font-bold uppercase bg-transparent text-white/90 outline-none appearance-none cursor-pointer hover:text-white transition-colors shrink-0 overflow-visible"
                        >
                            {unitOptions.map(opt => (
                                <option key={opt} value={opt} className="text-zinc-800">{opt}</option>
                            ))}
                        </select>
                    )}

                    <button
                        onClick={handleIncrement}
                        className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 text-white rounded-lg active:scale-95 transition-all shrink-0"
                    >
                        <Plus size={16} strokeWidth={3} />
                    </button>
                </div>

                {quantity > 0 && (
                    <button
                        onClick={handleTrash}
                        className="absolute top-2 right-2 w-8 h-8 flex items-center justify-center bg-white/90 backdrop-blur shadow-sm rounded-full text-rose-500 hover:bg-rose-50 transition-all animate-in zoom-in duration-200"
                    >
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}
