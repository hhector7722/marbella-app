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
    supplier_2?: string | null;
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
    /** When set, draft is persisted per supplier (shared for all users). When null, only local state. */
    supplierId?: string | number | null;
    onQuantityChange?: (ingredientId: string, quantity: number, unit: string) => void;
}

export function OrderProductCard({ ingredient, initialQuantity = 0, initialUnit, supplierId, onQuantityChange }: OrderProductCardProps) {
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
    /** Mientras el usuario escribe, guardamos el texto del input; al blur/Enter se parsea y aplica. */
    const [editingQty, setEditingQty] = useState<string | null>(null);

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

    // 3. DB Syncer (Debounced). Only persist when supplierId is set (drafts are per supplier).
    useEffect(() => {
        if (!isDirtyRef.current || supplierId == null) return;

        const timer = setTimeout(async () => {
            setIsUpdating(true);
            try {
                const finalUnit = isCustomUnit ? (customUnit || 'unidad') : (unit || 'unidad');

                if (quantity > 0) {
                    await supabase.from('order_drafts').upsert({
                        supplier_id: supplierId,
                        ingredient_id: ingredient.id,
                        quantity: quantity,
                        unit: finalUnit,
                        updated_at: new Date().toISOString()
                    });

                    await supabase.from('ingredients').update({ order_unit: finalUnit }).eq('id', ingredient.id);
                } else {
                    await supabase.from('order_drafts').delete()
                        .eq('supplier_id', supplierId)
                        .eq('ingredient_id', ingredient.id);
                }

                isDirtyRef.current = false;
            } catch (error) {
                console.error('Error updating draft:', error);
            } finally {
                setIsUpdating(false);
            }
        }, 600);

        return () => clearTimeout(timer);
    }, [quantity, unit, isCustomUnit, customUnit, supplierId, ingredient.id, supabase]);

    const handleIncrement = () => updateLocal(quantity + 1, unit, isCustomUnit, customUnit);
    const handleDecrement = () => updateLocal(Math.max(0, quantity - 1), unit, isCustomUnit, customUnit);
    const handleTrash = () => updateLocal(0, unit, isCustomUnit, customUnit);

    const commitQtyInput = () => {
        if (editingQty === null) return;
        const n = parseFloat(editingQty.replace(',', '.'));
        const final = (!Number.isNaN(n) && n >= 0) ? n : 0;
        updateLocal(final, unit, isCustomUnit, customUnit);
        setEditingQty(null);
    };

    const displayQty = editingQty !== null ? editingQty : (quantity === 0 ? '' : String(quantity));

    const renderCard = (isModal: boolean) => (
        <div className={cn(
            "flex flex-col bg-white transition-all overflow-hidden relative",
            isModal ? "rounded-[24px] shadow-2xl h-80 w-64 sm:w-80 sm:h-96" : "h-full rounded-2xl shadow-md",
            !isModal && quantity > 0 ? "" : "",
            !isModal ? "hover:shadow-lg hover:-translate-y-0.5" : ""
        )}>
            {/* Recommended Stock Badge */}
            {(ingredient.recommended_stock !== null && ingredient.recommended_stock !== undefined && ingredient.recommended_stock > 0) && (
                <div className={cn("absolute text-zinc-400 font-black flex items-center gap-0.5 transition-all z-30", isModal ? "top-4 left-4 text-xs" : "top-2 left-2 text-[9px]")} title="Stock Recomendado">
                    <Package size={isModal ? 14 : 10} strokeWidth={2.5} />
                    <span>{ingredient.recommended_stock}</span>
                </div>
            )}

            {/* ZONA SUPERIOR BLANCA (Elástica) */}
            <div className={cn(
                "flex-1 flex flex-col items-center justify-start",
                isModal ? "p-6" : "p-1.5 min-h-[90px]"
            )}>
                {/* Contenedor de Imagen Rígido */}
                <div
                    className={cn(
                        "w-full bg-white flex items-center justify-center overflow-hidden relative shrink-0",
                        isModal ? "h-32 mb-4 rounded-lg" : "h-12 mb-1"
                    )}
                    onClick={() => {
                        if (!isModal) setShowModal(true);
                    }}
                >
                    {ingredient.image_url ? (
                        <img src={ingredient.image_url} className="h-full w-full object-contain" alt={ingredient.name} />
                    ) : (
                        <Package className="text-zinc-200 w-5 h-5" />
                    )}

                    {isUpdating && (
                        <div className="absolute inset-0 bg-white/40 flex items-center justify-center backdrop-blur-[1px] rounded-xl z-20">
                            <LoadingSpinner size={isModal ? "md" : "sm"} className="text-[#5E35B1]" />
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div className={cn("flex flex-col w-full px-1", isModal ? "mt-auto gap-1.5 items-center text-center" : "items-start text-left justify-start")}>
                    <span className={cn("font-black text-zinc-800 leading-tight w-full truncate", isModal ? "text-sm sm:text-base px-1" : "text-[9px] min-[380px]:text-[10px]")} title={ingredient.name}>
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
                        <span className="text-[7.5px] font-bold text-zinc-400 uppercase tracking-widest text-left mt-auto pt-1 w-full truncate">
                            {isCustomUnit ? (customUnit || '?') : unit}
                        </span>
                    )}
                </div>
            </div>

            {/* ZONA INFERIOR OSCURA (Rígida e inamovible) */}
            <div className={cn(
                "bg-[#36606F] flex flex-row items-center justify-between shrink-0 w-full",
                isModal ? "px-6 py-4" : "p-1.5"
            )}>
                <button
                    onClick={handleDecrement}
                    disabled={quantity === 0}
                    className={cn(
                        "flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-md active:scale-95 disabled:opacity-30 transition-all shrink-0 p-0",
                        isModal ? "w-10 h-10 sm:w-12 sm:h-12" : "w-6 h-6 md:w-7 md:h-7"
                    )}
                >
                    <Minus size={isModal ? 24 : 14} strokeWidth={3} />
                </button>

                <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Cantidad"
                    value={displayQty}
                    onChange={(e) => {
                        const v = e.target.value;
                        if (v === '' || /^\d*[,.]?\d*$/.test(v)) setEditingQty(v);
                    }}
                    onFocus={() => setEditingQty(quantity === 0 ? '' : String(quantity))}
                    onBlur={commitQtyInput}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                    }}
                    className={cn(
                        "font-black text-white tabular-nums text-center bg-transparent border-none outline-none w-10 min-w-0 rounded focus:ring-1 focus:ring-white/30",
                        isModal ? "text-lg sm:text-2xl px-1" : "text-[11px] md:text-xs px-0.5"
                    )}
                />

                <button
                    onClick={handleIncrement}
                    className={cn(
                        "flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-md active:scale-95 transition-all shrink-0 p-0",
                        isModal ? "w-10 h-10 sm:w-12 sm:h-12" : "w-6 h-6 md:w-7 md:h-7"
                    )}
                >
                    <Plus size={isModal ? 24 : 14} strokeWidth={3} />
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
                    <Trash2 size={isModal ? 16 : 14} />
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
