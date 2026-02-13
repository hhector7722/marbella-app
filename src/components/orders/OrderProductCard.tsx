'use client';

import { useState, useEffect, useCallback } from 'react';
import { Minus, Plus, Trash2, Package } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    current_price: number;
    purchase_unit: string;
    image_url: string | null;
}

interface OrderProductCardProps {
    ingredient: Ingredient;
    initialQuantity?: number;
    userId: string;
    onQuantityChange?: (ingredientId: string, quantity: number) => void;
}

export function OrderProductCard({ ingredient, initialQuantity = 0, userId, onQuantityChange }: OrderProductCardProps) {
    const supabase = createClient();
    const [quantity, setQuantity] = useState(initialQuantity);
    const [isUpdating, setIsUpdating] = useState(false);

    // Debounced draft update
    useEffect(() => {
        if (quantity === initialQuantity) return;

        const timer = setTimeout(async () => {
            setIsUpdating(true);
            try {
                if (quantity > 0) {
                    await supabase.from('order_drafts').upsert({
                        user_id: userId,
                        ingredient_id: ingredient.id,
                        quantity: quantity,
                        updated_at: new Date().toISOString()
                    });
                } else {
                    await supabase.from('order_drafts').delete()
                        .eq('user_id', userId)
                        .eq('ingredient_id', ingredient.id);
                }
                onQuantityChange?.(ingredient.id, quantity);
            } catch (error) {
                console.error('Error updating draft:', error);
            } finally {
                setIsUpdating(false);
            }
        }, 500);

        return () => clearTimeout(timer);
    }, [quantity, userId, ingredient.id, supabase, onQuantityChange, initialQuantity]);

    const handleIncrement = () => setQuantity(prev => prev + 1);
    const handleDecrement = () => setQuantity(prev => Math.max(0, prev - 1));
    const handleTrash = () => setQuantity(0);

    return (
        <div className="relative group overflow-hidden h-full">
            <div className={cn(
                "bg-white rounded-xl p-1.5 shadow-md transition-all flex flex-col h-full",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-lg" : "hover:shadow-lg hover:-translate-y-0.5"
            )}>
                {/* Product Image */}
                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative grayscale-[0.5] group-hover:grayscale-0 transition-all">
                    {ingredient.image_url ? (
                        <img src={ingredient.image_url} className="w-full h-full object-contain" alt={ingredient.name} />
                    ) : (
                        <Package className="text-gray-200 w-6 h-6" />
                    )}
                    {isUpdating && (
                        <div className="absolute inset-0 bg-white/40 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-[#5E35B1] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className="flex flex-col px-0.5 mb-2">
                    <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={ingredient.name}>
                        {ingredient.name}
                    </span>
                    <span className="text-[8px] text-gray-400 font-bold uppercase truncate">
                        {ingredient.purchase_unit}
                    </span>
                </div>

                {/* Controls (Persistent at bottom) */}
                <div className="mt-auto flex items-center gap-1 bg-zinc-50 rounded-lg p-1">
                    <button
                        onClick={handleDecrement}
                        disabled={quantity === 0}
                        className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm active:scale-95 disabled:opacity-50 transition-all"
                    >
                        <Minus size={12} className="text-zinc-600" />
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
                            className="w-full bg-transparent text-center font-black text-xs text-[#5E35B1] outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        />
                    </div>

                    <button
                        onClick={handleIncrement}
                        className="w-7 h-7 flex items-center justify-center bg-white rounded-md shadow-sm active:scale-95 transition-all"
                    >
                        <Plus size={12} className="text-zinc-600" />
                    </button>

                    <button
                        onClick={handleTrash}
                        disabled={quantity === 0}
                        className="ml-0.5 w-7 h-7 flex items-center justify-center bg-zinc-100 rounded-md hover:bg-rose-50 hover:text-rose-500 disabled:opacity-0 transition-all"
                    >
                        <Trash2 size={12} />
                    </button>
                </div>
            </div>
        </div>
    );
}
