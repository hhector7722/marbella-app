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
    const unitOptions = ['pack', 'caja', 'unidad', 'kg', 'pieza', 'lt', 'otro...'];

    // Initial validation to ensure custom units from DB show correctly
    const startUnit = initialUnit || ingredient.order_unit || 'unidad';
    const isStartCustom = !unitOptions.includes(startUnit) && startUnit !== '';

    const [quantity, setQuantity] = useState(initialQuantity);
    const [unit, setUnit] = useState(isStartCustom ? 'unidad' : startUnit);
    const [isCustomUnit, setIsCustomUnit] = useState(isStartCustom);
    const [customUnit, setCustomUnit] = useState(isStartCustom ? startUnit : '');
    const [isUpdating, setIsUpdating] = useState(false);

    // This ref tells us if the user is currently interacting and hasn't saved yet
    const isDirtyRef = useRef(false);

    // 1. Sync from Props (External changes, e.g. from Realtime AI voice or initial load)
    useEffect(() => {
        if (!isDirtyRef.current) {
            setQuantity(initialQuantity);

            const propUnit = initialUnit || ingredient.order_unit || 'unidad';
            const isPropCustom = !unitOptions.includes(propUnit) && propUnit !== '';

            if (isPropCustom) {
                setIsCustomUnit(true);
                setCustomUnit(propUnit);
            } else {
                setIsCustomUnit(false);
                setUnit(propUnit);
            }
        }
    }, [initialQuantity, initialUnit, ingredient.order_unit]);

    // 2. Helper to apply local changes INSTANTLY to parent UI
    const updateLocal = (newQ: number, newU: string, isCust: boolean, custU: string) => {
        isDirtyRef.current = true;
        setQuantity(newQ);
        setUnit(newU);
        setIsCustomUnit(isCust);
        setCustomUnit(custU);

        const fUnit = isCust ? (custU || 'unidad') : (newU || 'unidad');
        onQuantityChange?.(ingredient.id, newQ, fUnit);
    };

    // 3. DB Syncer (Debounced for Server writes)
    useEffect(() => {
        if (!isDirtyRef.current) return;

        const timer = setTimeout(async () => {
            setIsUpdating(true);
            try {
                const finalUnit = isCustomUnit ? (customUnit || 'unidad') : (unit || 'unidad');

                if (quantity > 0) {
                    await supabase.from('order_drafts').upsert({
                        user_id: userId,
                        ingredient_id: ingredient.id,
                        quantity: quantity,
                        unit: finalUnit,
                        updated_at: new Date().toISOString()
                    });

                    // Also update preferred unit in ingredients
                    await supabase.from('ingredients').update({ order_unit: finalUnit }).eq('id', ingredient.id);
                } else {
                    await supabase.from('order_drafts').delete()
                        .eq('user_id', userId)
                        .eq('ingredient_id', ingredient.id);
                }

                // Mark clean after DB sync is initiated
                isDirtyRef.current = false;
            } catch (error) {
                console.error('Error updating draft:', error);
            } finally {
                setIsUpdating(false);
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [quantity, unit, isCustomUnit, customUnit, userId, ingredient.id, supabase]);

    const handleIncrement = () => updateLocal(quantity + 1, unit, isCustomUnit, customUnit);
    const handleDecrement = () => updateLocal(Math.max(0, quantity - 1), unit, isCustomUnit, customUnit);
    const handleTrash = () => updateLocal(0, unit, isCustomUnit, customUnit);

    return (
        <div className="relative group overflow-hidden h-full">
            <div className={cn(
                "bg-white rounded-2xl shadow-md transition-all flex flex-col h-full overflow-hidden",
                quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-lg" : "hover:shadow-lg hover:-translate-y-0.5 active:scale-95 cursor-pointer"
            )}>
                <div className="p-2.5 sm:p-4 flex-1 flex flex-col min-h-0">
                    {/* Product Image Area (Compact Gallery Style) - Centered vertically */}
                    <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                        {ingredient.image_url ? (
                            <img src={ingredient.image_url} className="h-full w-full object-contain" alt={ingredient.name} />
                        ) : (
                            <Package className="text-gray-200 w-5 h-5" />
                        )}
                        {isUpdating && (
                            <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-xl">
                                <LoadingSpinner size="sm" className="text-[#5E35B1]" />
                            </div>
                        )}
                    </div>

                    {/* Product Info - Positioned just above Footer */}
                    <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                        <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={ingredient.name}>
                            {ingredient.name}
                        </span>
                    </div>
                </div>

                {/* Controls & Unit (Bottom Area) - Flush bottom and centered vertically */}
                <div className="bg-[#36606F] px-2 sm:px-3 py-1.5 flex flex-row items-center justify-center gap-0.5 sm:gap-1 shrink-0 shadow-inner w-full mt-auto">
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
                            updateLocal(isNaN(val) ? 0 : Math.max(0, val), unit, isCustomUnit, customUnit);
                        }}
                        placeholder="0"
                        className="w-4 sm:w-10 bg-transparent text-center font-black text-[10px] sm:text-sm text-white outline-none shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {isCustomUnit ? (
                        <div className="flex items-center shrink-0 min-w-0">
                            <input
                                type="text"
                                value={customUnit}
                                onChange={(e) => updateLocal(quantity, unit, isCustomUnit, e.target.value)}
                                placeholder="?"
                                className="w-7 sm:w-12 text-[7px] sm:text-[10px] font-black uppercase bg-white/10 text-white rounded px-0.5 sm:px-1 py-0.5 sm:py-1 outline-none text-center"
                                autoFocus
                            />
                            <button
                                onClick={() => updateLocal(quantity, unit, false, customUnit)}
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
                                    updateLocal(quantity, unit, true, customUnit);
                                } else {
                                    updateLocal(quantity, e.target.value, false, customUnit);
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
                        className="absolute top-1.5 right-1.5 w-5 h-5 sm:w-7 sm:h-7 flex items-center justify-center bg-white/90 backdrop-blur shadow-sm rounded-full text-rose-500 hover:bg-rose-50 transition-all animate-in zoom-in duration-200"
                    >
                        <Trash2 size={10} className="sm:w-4 sm:h-4" />
                    </button>
                )}
            </div>
        </div>
    );
}
