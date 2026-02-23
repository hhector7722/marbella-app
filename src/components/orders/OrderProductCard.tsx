'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
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

    // Keep track of the last synced values to avoid circular updates or redundant saves
    const lastSynced = useRef({ quantity: initialQuantity, unit: initialUnit || ingredient.order_unit || 'unidad' });

    // 1. Sync local STATE with PROPS (Initial load or Realtime updates from parent)
    useEffect(() => {
        if (initialQuantity !== lastSynced.current.quantity) {
            setQuantity(initialQuantity);
            lastSynced.current.quantity = initialQuantity;
        }
        const propUnit = initialUnit || ingredient.order_unit || 'unidad';
        if (propUnit !== lastSynced.current.unit) {
            setUnit(propUnit);
            lastSynced.current.unit = propUnit;
        }
    }, [initialQuantity, initialUnit, ingredient.order_unit]);

    // 2. Separate Effect for Unit Persistence (immediately save even if quantity is 0)
    useEffect(() => {
        const finalUnit = isCustomUnit ? customUnit : unit;
        // ONLY save if it's different from what we already have in DB/lastSynced
        if (finalUnit === lastSynced.current.unit) return;

        const saveUnit = async () => {
            try {
                lastSynced.current.unit = finalUnit;
                // Update ingredient default unit
                await supabase.from('ingredients').update({ order_unit: finalUnit }).eq('id', ingredient.id);

                // If there's an active draft, update its unit too
                if (quantity > 0) {
                    await supabase.from('order_drafts').update({ unit: finalUnit })
                        .eq('user_id', userId)
                        .eq('ingredient_id', ingredient.id);
                }

                onQuantityChange?.(ingredient.id, quantity, finalUnit);
            } catch (error) {
                console.error('Error saving persistent unit:', error);
            }
        };

        const timer = setTimeout(saveUnit, 300); // Small debounce for typing custom unit
        return () => clearTimeout(timer);
    }, [unit, isCustomUnit, customUnit]);

    // 3. Debounced draft update for QUANTITY changes
    useEffect(() => {
        // ONLY save if user actually changed the quantity compared to last known DB state
        if (quantity === lastSynced.current.quantity) return;

        const timer = setTimeout(async () => {
            setIsUpdating(true);
            try {
                lastSynced.current.quantity = quantity;
                const finalUnit = isCustomUnit ? customUnit : unit;
                if (quantity > 0) {
                    await supabase.from('order_drafts').upsert({
                        user_id: userId,
                        ingredient_id: ingredient.id,
                        quantity: quantity,
                        unit: finalUnit,
                        updated_at: new Date().toISOString()
                    });
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
        }, 600);

        return () => clearTimeout(timer);
    }, [quantity, userId, ingredient.id, supabase]);

    const handleIncrement = () => setQuantity(prev => prev + 1);
    const handleDecrement = () => setQuantity(prev => Math.max(0, prev - 1));
    const handleTrash = () => setQuantity(0);

    return (
        <div className="relative group overflow-hidden h-full">
            <div className={cn(
                "bg-white rounded-xl shadow-sm transition-all flex flex-col h-full overflow-hidden",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-md" : "hover:shadow-md hover:-translate-y-0.5"
            )}>
                <div className="p-1 sm:p-3 flex-1 flex flex-col min-h-0">
                    {/* Product Image Area (Compact Gallery Style) - Centered vertically */}
                    <div className="flex-1 w-full flex items-center justify-center min-h-0 relative grayscale-[0.1] group-hover:grayscale-0 transition-all overflow-hidden mb-1 sm:mb-2">
                        {ingredient.image_url ? (
                            <img src={ingredient.image_url} className="w-full h-full object-contain p-0.5 sm:p-1" alt={ingredient.name} />
                        ) : (
                            <Package className="text-gray-200 w-6 h-6 sm:w-10 sm:h-10" />
                        )}
                        {isUpdating && (
                            <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
                                <LoadingSpinner size="sm" className="text-[#5E35B1]" />
                            </div>
                        )}
                    </div>

                    {/* Product Info - Positioned just above Footer */}
                    <div className="px-0.5 mb-0 sm:mb-1 shrink-0">
                        <span className="font-bold text-gray-800 text-[8px] sm:text-[11px] leading-[1.1] line-clamp-2" title={ingredient.name}>
                            {ingredient.name}
                        </span>
                    </div>
                </div>

                {/* Controls & Unit (Bottom Area) - Thinner and centered vertically */}
                <div className="bg-[#36606F] px-1 sm:px-3 py-1.5 sm:py-2 flex flex-row items-center justify-center gap-0.5 sm:gap-1 shrink-0 shadow-inner w-full">
                    <button
                        onClick={handleDecrement}
                        disabled={quantity === 0}
                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center bg-transparent hover:bg-white/10 text-white rounded-lg active:scale-95 disabled:opacity-30 transition-all shrink-0 p-0"
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
                        className="w-5 sm:w-10 bg-transparent text-center font-black text-[11px] sm:text-sm text-white outline-none shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {isCustomUnit ? (
                        <div className="flex items-center shrink-0 min-w-0">
                            <input
                                type="text"
                                value={customUnit}
                                onChange={(e) => setCustomUnit(e.target.value)}
                                placeholder="?"
                                className="w-8 sm:w-12 text-[7px] sm:text-[10px] font-black uppercase bg-white/10 text-white rounded px-0.5 sm:px-1 py-0.5 sm:py-1 outline-none text-center"
                                autoFocus
                            />
                            <button
                                onClick={() => setIsCustomUnit(false)}
                                className="text-[7px] sm:text-[10px] text-white/50 hover:text-white font-black ml-0.5 sm:ml-1 shrink-0 p-0.5"
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
                        className="w-6 h-6 sm:w-8 sm:h-8 flex items-center justify-center bg-transparent hover:bg-white/10 text-white rounded-lg active:scale-95 transition-all shrink-0 p-0"
                    >
                        <Plus size={14} strokeWidth={3} className="w-3 h-3 sm:w-4 sm:h-4" />
                    </button>
                </div>

                {quantity > 0 && (
                    <button
                        onClick={handleTrash}
                        className="absolute top-0.5 right-0.5 w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center bg-white/90 backdrop-blur shadow-sm rounded-full text-rose-500 hover:bg-rose-50 transition-all animate-in zoom-in duration-200"
                    >
                        <Trash2 size={10} className="sm:w-4 sm:h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
