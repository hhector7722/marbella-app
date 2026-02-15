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
                "bg-white rounded-2xl p-3 shadow-md transition-all flex flex-col h-full",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-xl" : "hover:shadow-lg hover:-translate-y-0.5"
            )}>
                {/* Product Image */}
                <div className="h-24 w-full bg-white rounded-2xl flex items-center justify-center mb-3 overflow-hidden relative grayscale-[0.2] group-hover:grayscale-0 transition-all border border-zinc-100">
                    {ingredient.image_url ? (
                        <img src={ingredient.image_url} className="w-full h-full object-contain p-2" alt={ingredient.name} />
                    ) : (
                        <Package className="text-gray-200 w-10 h-10" />
                    )}
                    {isUpdating && (
                        <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px]">
                            <LoadingSpinner size="sm" className="text-[#5E35B1]" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="flex flex-col px-1 mb-4">
                    <span className="font-black text-gray-800 text-xs leading-tight mb-1" title={ingredient.name}>
                        {ingredient.name}
                    </span>

                    {/* Unit Selector */}
                    <div className="mt-1">
                        {isCustomUnit ? (
                            <div className="flex gap-1 items-center">
                                <input
                                    type="text"
                                    value={customUnit}
                                    onChange={(e) => setCustomUnit(e.target.value)}
                                    placeholder="¿Qué medida?"
                                    className="w-full text-[10px] font-bold uppercase bg-zinc-100 rounded-lg px-2 py-1 outline-none text-[#5E35B1]"
                                    autoFocus
                                />
                                <button
                                    onClick={() => setIsCustomUnit(false)}
                                    className="text-[10px] text-gray-400 hover:text-gray-600 font-bold"
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
                                className="w-full text-[10px] font-bold uppercase bg-zinc-100 text-gray-500 rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer hover:bg-zinc-200 transition-colors"
                            >
                                {unitOptions.map(opt => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {/* Controls (Touch-First Design) */}
                <div className="mt-auto flex items-center justify-between gap-2 p-1">
                    <button
                        onClick={handleDecrement}
                        disabled={quantity === 0}
                        className="w-8 h-8 flex items-center justify-center bg-rose-500 text-white rounded-full shadow-lg active:scale-95 disabled:opacity-20 transition-all shrink-0"
                    >
                        <Minus size={16} strokeWidth={3} />
                    </button>

                    <div className="flex-1 flex items-center justify-center">
                        <input
                            type="number"
                            value={quantity === 0 ? "" : quantity}
                            onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setQuantity(isNaN(val) ? 0 : Math.max(0, val));
                            }}
                            placeholder="0"
                            className="w-full bg-transparent text-center font-black text-lg text-[#36606F] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    </div>

                    <button
                        onClick={handleIncrement}
                        className="w-8 h-8 flex items-center justify-center bg-emerald-500 text-white rounded-full shadow-lg active:scale-95 transition-all shrink-0"
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
