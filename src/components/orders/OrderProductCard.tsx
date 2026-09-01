'use client';

import { useState, useEffect, useRef } from 'react';
import { Trash2, Package, Minus, Plus } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Modal } from '@/components/ui/modal';
import { QuantityStepper } from '@/components/ui/QuantityStepper';

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
    const [quantityRaw, setQuantityRaw] = useState(() => (initialQuantity > 0 ? String(initialQuantity) : ''));
    const [quantityInputFocused, setQuantityInputFocused] = useState(false);
    const quantityInputRef = useRef<HTMLInputElement>(null);

    // This ref tells us if the user is currently interacting and hasn't saved yet
    const isDirtyRef = useRef(false);

    // 1. Sync from Props
    useEffect(() => {
        if (!isDirtyRef.current) {
            setQuantity(initialQuantity);
            if (!quantityInputFocused) {
                setQuantityRaw(initialQuantity > 0 ? String(initialQuantity) : '');
            }

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
    }, [initialQuantity, initialUnit, ingredient.order_unit, quantityInputFocused]);

    // 2. Helper to apply local changes INSTANTLY to parent UI
    const updateLocal = (newQ: number, newU: string, isCust: boolean, custU: string) => {
        isDirtyRef.current = true;
        setQuantity(newQ);
        setQuantityRaw(newQ > 0 ? String(newQ) : '');
        setUnit(newU);
        setIsCustomUnit(isCust);
        setCustomUnit(custU);

        const fUnit = isCust ? (custU || 'unidad') : (newU || 'unidad');
        onQuantityChange?.(ingredient.id, newQ, fUnit);
    };

    const commitQuantityRaw = (raw: string) => {
        const t = raw.replace(',', '.').trim();
        if (t === '' || t === '0') {
            updateLocal(0, unit, isCustomUnit, customUnit);
            return;
        }
        const n = parseFloat(t);
        if (!Number.isFinite(n) || n < 0) {
            setQuantityRaw(quantity > 0 ? String(quantity) : '');
            return;
        }
        updateLocal(Math.max(0, n), unit, isCustomUnit, customUnit);
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

    const handleTrash = () => updateLocal(0, unit, isCustomUnit, customUnit);

    const adjustQuantity = (delta: number) => {
        const next = Math.max(0, quantity + delta);
        updateLocal(next, unit, isCustomUnit, customUnit);
    };

    const renderCard = (isModal: boolean) => (
        <div
            data-element="order-product-card"
            data-view={isModal ? 'modal' : 'grid'}
            className={cn(
                "flex flex-col bg-white transition-all overflow-hidden relative",
                isModal ? "rounded-[24px] shadow-2xl h-80 w-64 sm:w-80 sm:h-96" : "rounded-2xl shadow-md",
                !isModal ? "hover:shadow-lg hover:-translate-y-0.5" : ""
            )}
        >
            {/* Recommended Stock Badge */}
            {(ingredient.recommended_stock !== null && ingredient.recommended_stock !== undefined && ingredient.recommended_stock > 0) && (
                <div className={cn("absolute text-zinc-400 font-black flex items-center gap-0.5 transition-all z-30", isModal ? "top-4 left-4 text-xs" : "top-2 left-2 text-[9px]")} title="Stock Recomendado">
                    <Package size={isModal ? 14 : 10} strokeWidth={2.5} />
                    <span>{ingredient.recommended_stock}</span>
                </div>
            )}

            {/* ZONA SUPERIOR BLANCA */}
            <div className={cn(
                "flex shrink-0 flex-col items-center justify-start bg-white",
                isModal ? "flex-1 p-6" : "px-1.5 pt-1.5 pb-1"
            )}>
                <div
                    className={cn(
                        "flex items-center justify-center overflow-hidden relative shrink-0 bg-white",
                        isModal
                            ? "mb-4 h-32 w-full rounded-lg"
                            : "mb-0.5 h-11 w-11 rounded-lg"
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

                <div className={cn(
                    "flex w-full min-w-0 flex-col items-center text-center",
                    isModal ? "mt-auto gap-1.5" : "gap-0.5"
                )}>
                    <span
                        className={cn(
                            "font-black text-zinc-800 leading-tight w-full truncate text-center",
                            isModal ? "text-sm sm:text-base px-1" : "text-[9px] min-[380px]:text-[10px]"
                        )}
                        title={ingredient.name}
                    >
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
                        <span className="w-full truncate text-center text-[7.5px] font-bold uppercase tracking-widest text-zinc-400">
                            {isCustomUnit ? (customUnit || '?') : unit}
                        </span>
                    )}
                </div>
            </div>

            {/* ZONA INFERIOR — cromo de cabecera de tabla; sin pastilla */}
            {isModal ? (
                <div className="shrink-0 w-full flex items-center justify-center bg-white px-6 py-4">
                    <QuantityStepper
                        value={quantity}
                        onChange={(n) => updateLocal(n, unit, isCustomUnit, customUnit)}
                        min={0}
                        inputMode="decimal"
                        ariaLabel="Cantidad"
                        className="min-h-14"
                    />
                </div>
            ) : (
                <div data-element="order-qty-bar" className="grid w-full shrink-0 grid-cols-3 items-center justify-items-center">
                    <button
                        type="button"
                        onClick={() => adjustQuantity(-1)}
                        disabled={quantity <= 0}
                        aria-label={`Menos cantidad de ${ingredient.name}`}
                        className="flex shrink-0 items-center justify-center px-1 py-1 transition-colors hover:bg-white/10 active:bg-white/15 disabled:opacity-40"
                    >
                        <Minus size={13} strokeWidth={3} aria-hidden />
                    </button>
                    <span
                        data-element="qty-value"
                        className="relative z-[1] flex min-w-[1.25rem] shrink-0 items-center justify-center px-0.5 py-1 text-center text-[10px] font-black tabular-nums leading-none"
                    >
                        <input
                            ref={quantityInputRef}
                            type="text"
                            inputMode="decimal"
                            data-element="qty-input"
                            value={quantityInputFocused ? quantityRaw : (quantity > 0 ? String(quantity) : '')}
                            onChange={(e) => setQuantityRaw(e.target.value)}
                            onFocus={() => {
                                setQuantityInputFocused(true);
                                setQuantityRaw(quantity > 0 ? String(quantity) : '');
                                requestAnimationFrame(() => quantityInputRef.current?.select());
                            }}
                            onBlur={() => {
                                setQuantityInputFocused(false);
                                commitQuantityRaw(quantityRaw);
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    e.currentTarget.blur();
                                }
                            }}
                            aria-label={`Cantidad de ${ingredient.name}`}
                        />
                    </span>
                    <button
                        type="button"
                        onClick={() => adjustQuantity(1)}
                        aria-label={`Más cantidad de ${ingredient.name}`}
                        className="flex shrink-0 items-center justify-center px-1 py-1 transition-colors hover:bg-white/10 active:bg-white/15"
                    >
                        <Plus size={13} strokeWidth={3} aria-hidden />
                    </button>
                </div>
            )}

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
        <div className="relative group overflow-hidden">
            {renderCard(false)}

            <Modal
                open={showModal}
                onClose={() => setShowModal(false)}
                title="Editar producto pedido"
                ariaLabel="Editar producto pedido"
                variant="compact"
                layer="base"
                instance="order-product-edit"
                usageId="order-product-edit"
                usageLabel="Editar producto pedido"
                scrollContent={false}
            >
                <div className="flex justify-center">
                    {renderCard(true)}
                </div>
            </Modal>
        </div>
    );
}
