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
    recommended_stock?: number | null;
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
    const [showModal, setShowModal] = useState(false);

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

    const renderCard = (isModal: boolean) => (
        <div className={cn(
            "bg-white transition-all flex flex-col items-stretch overflow-hidden w-full relative",
            isModal ? "rounded-[24px] shadow-2xl h-80 w-64 sm:w-80 sm:h-96" : "rounded-2xl shadow-md aspect-square",
            !isModal && quantity > 0 ? "ring-2 ring-[#5E35B1] shadow-lg" : "",
            !isModal ? "hover:shadow-lg hover:-translate-y-0.5" : ""
        )}>
            {/* Recommended Stock Badge */}
            {(ingredient.recommended_stock !== null && ingredient.recommended_stock !== undefined && ingredient.recommended_stock > 0) && (
                <div className={cn("absolute text-zinc-400 font-black flex items-center gap-0.5 transition-all z-30", isModal ? "top-4 left-4 text-xs" : "top-2 left-2 text-[9px]")} title="Stock Recomendado">
                    <Package size={isModal ? 14 : 10} strokeWidth={2.5} />
                    <span>{ingredient.recommended_stock}</span>
                </div>
            )}

            <div className={cn("flex-1 flex flex-col min-h-0", isModal ? "p-6" : "p-1.5 sm:p-2")}>
                {/* Product Image Area */}
                <div
                    className={cn(
                        "w-full bg-white rounded-lg flex items-center justify-center overflow-hidden relative",
                        isModal ? "h-32 mb-4" : "flex-1 min-h-0 mb-1 cursor-pointer"
                    )}
                    onClick={() => {
                        if (!isModal) setShowModal(true);
                    }}
                >
                    {ingredient.image_url ? (
                        <img src={ingredient.image_url} className="h-full w-full object-contain" alt={ingredient.name} />
                    ) : (
                        <Package className="text-gray-200 w-5 h-5" />
                    )}

                    {isUpdating && (
                        <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-xl z-20">
                            <LoadingSpinner size={isModal ? "md" : "sm"} className="text-[#5E35B1]" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className={cn("flex flex-col px-1 shrink-0", isModal ? "mt-auto gap-1.5 items-center justify-center text-center" : "gap-0 items-start text-left mb-0.5")}>
                    <span className={cn("font-bold text-gray-700 leading-tight truncate w-full", isModal ? "text-sm sm:text-base" : "text-[10px]")} title={ingredient.name}>
                        {ingredient.name}
                    </span>
                    {isModal ? (
                        isCustomUnit ? (
                            <div className="flex items-center justify-center shrink-0 min-w-0 mt-0.5">
                                <input
                                    type="text"
                                    value={customUnit}
                                    onChange={(e) => updateLocal(quantity, unit, isCustomUnit, e.target.value)}
                                    placeholder="?"
                                    className="w-16 sm:w-20 text-[10px] sm:text-xs font-black uppercase bg-gray-100 text-gray-600 rounded px-1 sm:px-2 py-0.5 sm:py-1 outline-none text-center"
                                    autoFocus
                                />
                                <button
                                    onClick={() => updateLocal(quantity, unit, false, customUnit)}
                                    className="text-[10px] sm:text-xs text-gray-400 hover:text-gray-600 font-black ml-1 sm:ml-2 shrink-0 p-0.5"
                                >
                                    ✕
                                </button>
                            </div>
                        ) : (
                            <div className="relative mt-0.5">
                                <select
                                    value={unit}
                                    onChange={(e) => {
                                        if (e.target.value === 'otro...') {
                                            updateLocal(quantity, unit, true, customUnit);
                                        } else {
                                            updateLocal(quantity, e.target.value, false, customUnit);
                                        }
                                    }}
                                    className="w-auto min-w-[60px] text-center text-[10px] sm:text-xs font-black uppercase bg-gray-50 text-gray-500 rounded px-2 py-0.5 outline-none cursor-pointer hover:bg-gray-100 transition-colors shrink-0 appearance-none border border-gray-100"
                                >
                                    {unitOptions.map(opt => (
                                        <option key={opt} value={opt} className="text-zinc-800">{opt}</option>
                                    ))}
                                </select>
                            </div>
                        )
                    ) : (
                        <span className="text-[9px] font-medium text-gray-400 lowercase tracking-widest truncate">
                            {isCustomUnit ? (customUnit || '?') : unit}
                        </span>
                    )}
                </div>
            </div>

            {/* Controls (Bottom Area) */}
            <div className={cn(
                "bg-[#36606F] flex flex-row items-center justify-between shrink-0 shadow-inner w-full mt-auto",
                isModal ? "px-6 py-4" : "px-1.5 py-1 sm:py-1.5"
            )}>
                <button
                    onClick={handleDecrement}
                    disabled={quantity === 0}
                    className={cn(
                        "flex items-center justify-center bg-transparent hover:bg-white/10 text-white rounded-lg active:scale-95 disabled:opacity-30 transition-all shrink-0 p-0",
                        isModal ? "w-10 h-10 sm:w-12 sm:h-12" : "w-6 h-6 sm:w-8 sm:h-8"
                    )}
                >
                    <Minus size={isModal ? 24 : 16} strokeWidth={3} className={cn(!isModal && "w-4 h-4 sm:w-5 sm:h-5")} />
                </button>

                <input
                    type="number"
                    value={quantity === 0 ? "" : quantity}
                    onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        updateLocal(isNaN(val) ? 0 : Math.max(0, val), unit, isCustomUnit, customUnit);
                    }}
                    placeholder=""
                    className={cn(
                        "bg-transparent text-center font-black text-white outline-none shrink-0 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
                        isModal ? "w-16 sm:w-20 text-lg sm:text-2xl" : "w-10 sm:w-14 text-[12px] sm:text-base"
                    )}
                />

                <button
                    onClick={handleIncrement}
                    className={cn(
                        "flex items-center justify-center bg-transparent hover:bg-white/10 text-white rounded-lg active:scale-95 transition-all shrink-0 p-0",
                        isModal ? "w-10 h-10 sm:w-12 sm:h-12" : "w-6 h-6 sm:w-8 sm:h-8"
                    )}
                >
                    <Plus size={isModal ? 24 : 16} strokeWidth={3} className={cn(!isModal && "w-4 h-4 sm:w-5 sm:h-5")} />
                </button>
            </div>

            {quantity > 0 && (
                <button
                    onClick={handleTrash}
                    className={cn(
                        "absolute flex items-center justify-center bg-white/90 backdrop-blur shadow-sm rounded-full text-rose-500 hover:bg-rose-50 transition-all animate-in zoom-in duration-200 z-30",
                        isModal ? "top-3 right-3 w-8 h-8" : "top-1.5 right-1.5 w-6 h-6 sm:w-7 sm:h-7"
                    )}
                >
                    <Trash2 size={isModal ? 16 : 12} className={cn(!isModal && "sm:w-4 sm:h-4")} />
                </button>
            )}
        </div>
    );

    return (
        <div className="relative group overflow-hidden h-full">
            {renderCard(false)}

            {showModal && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4"
                    onClick={() => setShowModal(false)}
                >
                    <div onClick={(e) => e.stopPropagation()} className="animate-in zoom-in-95 duration-200">
                        {renderCard(true)}
                    </div>
                </div>
            )}
        </div>
    );
}
