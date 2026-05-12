'use client';

import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Trash2, Camera, X, ChevronLeft, ChevronRight, Pencil } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { PricingChoiceButton, PricingStepHeader } from '@/components/ingredients/PricingAssistantControls';
import { pricingAssistantCopy } from '@/lib/ingredient-pricing-assistant-copy';

export interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    supplier_2?: string | null;
    current_price: number;
    purchase_unit: string;
    unit_type: string;
    supplier_pricing_mode?: 'per_purchase_unit' | 'per_pack';
    pack_price?: number | null;
    pack_units?: number | null;
    pack_unit_size_qty?: number | null;
    pack_unit_size_unit?: string | null;
    category: string;
    waste_percentage: number;
    image_url: string | null;
    allergens: string[];
    order_unit?: string | null;
    recommended_stock?: number | null;
    price_locked?: boolean;
}

const ORDER_UNITS = ['pack', 'caja', 'ud', 'kg', 'pieza', 'l', 'g', 'ml', 'cl'];
const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas', 'Limpieza', 'Otros'];
const PACK_UNITS_PRESETS_EDIT = [12, 24];

function normalizeUnit(u: string | null | undefined): 'g' | 'kg' | 'ml' | 'l' | 'ud' | 'cl' {
    const s = String(u ?? '').trim().toLowerCase();
    if (s === 'u' || s === 'ud' || s === 'un' || s === 'unidad') return 'ud';
    if (s === 'lt' || s === 'l' || s === 'litro') return 'l';
    if (s === 'ml') return 'ml';
    if (s === 'cl') return 'cl';
    if (s === 'kg' || s === 'kilo') return 'kg';
    if (s === 'g' || s === 'gr') return 'g';
    return s as 'g' | 'kg' | 'ml' | 'l' | 'ud' | 'cl';
}

function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (!Number.isFinite(qty)) return null;
    if (from === to) return qty;

    const fromVol = from === 'ml' || from === 'l' || from === 'cl';
    const toVol = to === 'ml' || to === 'l' || to === 'cl';
    if (fromVol && toVol) {
        const asMl = from === 'l' ? qty * 1000 : from === 'cl' ? qty * 10 : qty;
        if (to === 'ml') return asMl;
        if (to === 'cl') return asMl / 10;
        return asMl / 1000;
    }

    const fromMass = from === 'g' || from === 'kg';
    const toMass = to === 'g' || to === 'kg';
    if (fromMass && toMass) {
        if (from === 'g' && to === 'kg') return qty / 1000;
        if (from === 'kg' && to === 'g') return qty * 1000;
        return qty;
    }

    if (from === 'ud' && to === 'ud') return qty;
    return null;
}

function computeEffectivePriceFromPack(args: {
    packPrice: number | null | undefined;
    packUnits: number | null | undefined;
    unitSizeQty: number | null | undefined;
    unitSizeUnit: string | null | undefined;
    purchaseUnit: string | null | undefined;
}): number | null {
    const packPrice = Number(args.packPrice);
    const packUnits = Number(args.packUnits);
    if (!Number.isFinite(packPrice) || packPrice < 0) return null;
    if (!Number.isFinite(packUnits) || packUnits <= 0) return null;
    const sizeQty = args.unitSizeQty == null ? 1 : Number(args.unitSizeQty);
    if (!Number.isFinite(sizeQty) || sizeQty <= 0) return null;
    const sizeUnit = args.unitSizeUnit ?? 'ud';
    const purchaseUnit = args.purchaseUnit ?? 'ud';
    const converted = convertQty(sizeQty, sizeUnit, purchaseUnit);
    if (converted == null || converted <= 0) return null;
    const denom = packUnits * converted;
    if (!Number.isFinite(denom) || denom <= 0) return null;
    return packPrice / denom;
}

export type IngredientEditModalProps = {
    ingredient: Ingredient | null;
    onClose: () => void;
    onSaved: () => void;
    /** Lista para flechas anterior/siguiente; si falta o tiene 1 elemento, se ocultan flechas. */
    navigationIngredients?: Ingredient[];
};

export function IngredientEditModal({ ingredient, onClose, onSaved, navigationIngredients }: IngredientEditModalProps) {
    const supabase = createClient();
    const [activeIngredient, setActiveIngredient] = useState<Ingredient | null>(null);
    const [editForm, setEditForm] = useState<Partial<Ingredient>>({});
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isCustomSupplier, setIsCustomSupplier] = useState(false);
    const [customSupplierName, setCustomSupplierName] = useState('');
    const [isCustomSupplier2, setIsCustomSupplier2] = useState(false);
    const [customSupplier2Name, setCustomSupplier2Name] = useState('');
    const [allSuppliers, setAllSuppliers] = useState<{ id: number; name: string }[]>([]);
    const [editPricingOpen, setEditPricingOpen] = useState(false);
    const [editPricingStep, setEditPricingStep] = useState<1 | 2>(1);

    const supplierNamesFromDb = useMemo(
        () =>
            new Set(
                allSuppliers
                    .map((s) => String(s?.name ?? '').trim())
                    .filter(Boolean)
            ),
        [allSuppliers]
    );

    const navList = useMemo(() => {
        if (navigationIngredients && navigationIngredients.length > 0) return navigationIngredients;
        if (activeIngredient) return [activeIngredient];
        return [];
    }, [navigationIngredients, activeIngredient]);

    const showNavArrows = navList.length > 1;

    const ingredientId = ingredient?.id ?? null;

    useLayoutEffect(() => {
        if (!ingredientId || !ingredient) {
            setActiveIngredient(null);
            setEditForm({});
            setEditPricingOpen(false);
            setEditPricingStep(1);
            return;
        }
        setActiveIngredient(ingredient);
        setEditForm({ ...ingredient });
    }, [ingredientId, ingredient]);

    useEffect(() => {
        if (!ingredientId) return;
        void (async () => {
            const { data, error } = await supabase.from('suppliers').select('id,name').order('name');
            if (error) {
                toast.error('No se pudieron cargar los proveedores');
                return;
            }
            if (data) setAllSuppliers(data as { id: number; name: string }[]);
        })();
    }, [ingredientId, supabase]);

    useEffect(() => {
        if (allSuppliers.length === 0) return;
        const sup1 = editForm.supplier ?? null;
        const sup1Str = typeof sup1 === 'string' ? sup1.trim() : '';
        const isCustom1 = !!sup1Str && !supplierNamesFromDb.has(sup1Str);
        setIsCustomSupplier(isCustom1);
        setCustomSupplierName(isCustom1 ? sup1Str : '');
        const sup2 = editForm.supplier_2 ?? null;
        const sup2Str = typeof sup2 === 'string' ? sup2.trim() : '';
        const isCustom2 = !!sup2Str && !supplierNamesFromDb.has(sup2Str);
        setIsCustomSupplier2(isCustom2);
        setCustomSupplier2Name(isCustom2 ? sup2Str : '');
    }, [editForm.supplier, editForm.supplier_2, supplierNamesFromDb, allSuppliers.length]);

    function applyIngredientToForm(ing: Ingredient) {
        setActiveIngredient(ing);
        setEditForm({ ...ing });
        const isCustom1 = !!ing.supplier && !supplierNamesFromDb.has(ing.supplier);
        setIsCustomSupplier(isCustom1);
        setCustomSupplierName(isCustom1 ? ing.supplier || '' : '');
        const isCustom2 = !!ing.supplier_2 && !supplierNamesFromDb.has(ing.supplier_2);
        setIsCustomSupplier2(isCustom2);
        setCustomSupplier2Name(isCustom2 ? ing.supplier_2 || '' : '');
    }

    const navigateIngredient = (direction: -1 | 1) => {
        if (!activeIngredient || navList.length <= 1) return;
        const currentIndex = navList.findIndex((ing) => ing.id === activeIngredient.id);
        if (currentIndex === -1) return;
        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = navList.length - 1;
        if (newIndex >= navList.length) newIndex = 0;
        applyIngredientToForm(navList[newIndex]);
    };

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        const rowId = activeIngredient?.id ?? ingredient?.id;
        if (!file || !rowId) return;
        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `ing-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('ingredients').upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;
            const {
                data: { publicUrl },
            } = supabase.storage.from('ingredients').getPublicUrl(fileName);
            await supabase.from('ingredients').update({ image_url: publicUrl }).eq('id', rowId);
            setEditForm((prev) => ({ ...prev, image_url: publicUrl }));
            toast.success('Imagen subida');
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : String(error);
            toast.error('Error: ' + msg);
        } finally {
            setUploadingImage(false);
        }
    }

    async function handleSaveEdit() {
        const rowId = activeIngredient?.id ?? ingredient?.id;
        if (!rowId) return;
        setSaving(true);
        try {
            const mode = (editForm.supplier_pricing_mode ?? 'per_purchase_unit') as 'per_purchase_unit' | 'per_pack';
            const payload: Record<string, unknown> = {
                name: editForm.name,
                supplier: editForm.supplier || null,
                supplier_2: editForm.supplier_2 || null,
                purchase_unit: editForm.purchase_unit,
                unit_type: editForm.purchase_unit,
                category: editForm.category,
                waste_percentage: editForm.waste_percentage || 0,
                image_url: editForm.image_url,
                order_unit: editForm.order_unit || 'unidad',
                recommended_stock: editForm.recommended_stock || null,
                supplier_pricing_mode: mode,
                price_locked: !!editForm.price_locked,
            };

            if (mode === 'per_pack') {
                payload.pack_price = editForm.pack_price ?? null;
                payload.pack_units = editForm.pack_units ?? null;
                payload.pack_unit_size_qty = editForm.pack_unit_size_qty ?? null;
                payload.pack_unit_size_unit = editForm.pack_unit_size_unit ?? null;
            } else {
                payload.current_price = editForm.current_price;
                payload.pack_price = null;
                payload.pack_units = null;
                payload.pack_unit_size_qty = null;
                payload.pack_unit_size_unit = null;
            }

            const { error } = await supabase.from('ingredients').update(payload).eq('id', rowId);
            if (error) throw error;
            toast.success('Guardado');
            onSaved();
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(msg);
        } finally {
            setSaving(false);
        }
    }

    if (!ingredient) return null;
    const targetIngredient = activeIngredient ?? ingredient;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
            <div
                className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[20px] bg-white shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex shrink-0 items-center justify-between bg-[#36606F] px-6 py-4">
                    <h2 className="text-lg font-black uppercase tracking-widest text-white">Editar</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto bg-[#fafafa] p-6">
                    <div className="space-y-4">
                        <div className="flex items-center justify-center gap-8">
                            {showNavArrows ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateIngredient(-1);
                                    }}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-100 bg-zinc-50 text-zinc-400 shadow-sm transition-colors hover:bg-zinc-100 hover:text-[#5E35B1]"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                            ) : (
                                <div className="h-12 w-12 shrink-0" aria-hidden />
                            )}

                            <div className="group relative flex h-32 w-32 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-300 bg-white hover:border-[#5E35B1]">
                                {editForm.image_url ? (
                                    <img src={editForm.image_url} alt="" className="h-full w-full object-contain" />
                                ) : (
                                    <div className="text-center text-gray-400">
                                        <Camera className="mx-auto mb-1 h-8 w-8" />
                                        <span className="text-xs">Subir</span>
                                    </div>
                                )}
                                <label className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-xs font-bold text-white opacity-0 transition group-hover:opacity-100">
                                    CAMBIAR
                                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={uploadingImage} />
                                </label>
                                {uploadingImage && (
                                    <div className="absolute inset-0 flex items-center justify-center bg-white/80">
                                        <LoadingSpinner size="md" className="text-[#5E35B1]" />
                                    </div>
                                )}
                            </div>

                            {showNavArrows ? (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateIngredient(1);
                                    }}
                                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-zinc-100 bg-zinc-50 text-zinc-400 shadow-sm transition-colors hover:bg-zinc-100 hover:text-[#5E35B1]"
                                >
                                    <ChevronRight size={24} />
                                </button>
                            ) : (
                                <div className="h-12 w-12 shrink-0" aria-hidden />
                            )}
                        </div>
                        <input
                            value={editForm.name ?? ''}
                            onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            className="w-full rounded-2xl border p-3 font-bold"
                        />
                        <div className="rounded-2xl border border-zinc-100 bg-white p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Precio proveedor</div>
                                    <div className="font-black text-zinc-900">
                                        {(editForm.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack'
                                            ? `${Number(editForm.pack_price ?? 0).toFixed(2)}€ (pack)`
                                            : `${Number(editForm.current_price ?? 0).toFixed(2)}€ / ${normalizeUnit(editForm.purchase_unit)}`}
                                    </div>
                                    {(editForm.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack' ? (
                                        <div className="mt-1 text-xs text-zinc-500">
                                            {Number(editForm.pack_units ?? 0) || '—'} uds · {Number(editForm.pack_unit_size_qty ?? 0) || '—'}
                                            {String(editForm.pack_unit_size_unit ?? '') || ''} · base {normalizeUnit(editForm.purchase_unit)}
                                        </div>
                                    ) : null}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditPricingOpen((v) => !v);
                                        setEditPricingStep(1);
                                    }}
                                    className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 font-black text-[#36606F] hover:bg-zinc-50"
                                >
                                    <Pencil className="h-4 w-4" />
                                    Editar
                                </button>
                            </div>

                            <label className="mt-3 flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={!!editForm.price_locked}
                                    onChange={(e) => setEditForm({ ...editForm, price_locked: e.target.checked })}
                                    className="h-5 w-5 shrink-0 rounded border-zinc-300"
                                />
                                <span className="text-xs font-bold leading-snug text-zinc-800">Precio fijo: no actualizar desde albaranes</span>
                            </label>

                            {editPricingOpen && (
                                <div className="mt-4 space-y-3 rounded-2xl bg-[#36606F] p-4 shadow-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="text-[10px] font-black uppercase tracking-widest text-white/70">
                                                {pricingAssistantCopy.modal.header}
                                            </div>
                                            <div className="truncate text-sm font-black text-white">
                                                {pricingAssistantCopy.modal.step(editPricingStep === 1 ? 1 : 2, 2)}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setEditPricingOpen(false);
                                                setEditPricingStep(1);
                                            }}
                                            className="min-h-12 shrink-0 rounded-xl bg-white/10 px-4 font-black text-white hover:bg-white/15"
                                        >
                                            Cerrar
                                        </button>
                                    </div>

                                    <div className="space-y-3 rounded-2xl bg-white p-4">
                                        {editPricingStep === 1 && (
                                            <>
                                                <PricingStepHeader
                                                    title={pricingAssistantCopy.invoiceStyle.title}
                                                    hint={pricingAssistantCopy.invoiceStyle.hint}
                                                />
                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perKg}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perKgSub}
                                                        onClick={() => {
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_purchase_unit',
                                                                purchase_unit: 'kg',
                                                                unit_type: 'kg',
                                                                pack_price: null,
                                                                pack_units: null,
                                                                pack_unit_size_qty: null,
                                                                pack_unit_size_unit: null,
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perL}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perLSub}
                                                        onClick={() => {
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_purchase_unit',
                                                                purchase_unit: 'l',
                                                                unit_type: 'l',
                                                                pack_price: null,
                                                                pack_units: null,
                                                                pack_unit_size_qty: null,
                                                                pack_unit_size_unit: null,
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perPack}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perPackSub}
                                                        onClick={() => {
                                                            const base = (
                                                                editForm.category === 'Bebidas'
                                                                    ? 'l'
                                                                    : editForm.category === 'Packaging' ||
                                                                        editForm.category === 'Limpieza' ||
                                                                        editForm.category === 'Otros'
                                                                      ? 'ud'
                                                                      : 'kg'
                                                            ) as 'kg' | 'l' | 'ud';
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_pack',
                                                                purchase_unit: base,
                                                                unit_type: base,
                                                                pack_units: p.pack_units ?? 12,
                                                                pack_unit_size_qty: p.pack_unit_size_qty ?? null,
                                                                pack_unit_size_unit: p.pack_unit_size_unit ?? (base === 'l' ? 'ml' : 'ud'),
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perUnit}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perUnitSub}
                                                        onClick={() => {
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_purchase_unit',
                                                                purchase_unit: 'ud',
                                                                unit_type: 'ud',
                                                                pack_price: null,
                                                                pack_units: null,
                                                                pack_unit_size_qty: null,
                                                                pack_unit_size_unit: null,
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditPricingOpen(false);
                                                            setEditPricingStep(1);
                                                        }}
                                                        className="min-h-12 flex-1 rounded-xl bg-rose-600 font-black text-white hover:bg-rose-700"
                                                    >
                                                        Cancelar
                                                    </button>
                                                </div>
                                            </>
                                        )}

                                        {editPricingStep === 2 && (
                                            <>
                                                <PricingStepHeader
                                                    title={pricingAssistantCopy.amounts.title}
                                                    hint={pricingAssistantCopy.amounts.hint}
                                                />
                                                {(editForm.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack' ? (
                                                    <div className="space-y-3">
                                                        <label className="block space-y-1">
                                                            <span className="text-xs font-bold text-zinc-800">
                                                                {pricingAssistantCopy.amounts.packFullPrice}
                                                            </span>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                value={editForm.pack_price ?? ''}
                                                                onChange={(e) =>
                                                                    setEditForm({
                                                                        ...editForm,
                                                                        pack_price: e.target.value === '' ? null : parseFloat(e.target.value),
                                                                    })
                                                                }
                                                                className="min-h-12 w-full rounded-xl border border-zinc-200 px-3 font-mono font-bold"
                                                            />
                                                        </label>
                                                        <div className="space-y-1">
                                                            <div className="text-sm font-black text-zinc-900">
                                                                {pricingAssistantCopy.amounts.howManyInPack}
                                                            </div>
                                                            <p className="text-xs leading-snug text-zinc-600">
                                                                {pricingAssistantCopy.amounts.howManyInPackHint}
                                                            </p>
                                                        </div>
                                                        <div className="grid grid-cols-3 gap-2">
                                                            {PACK_UNITS_PRESETS_EDIT.map((n) => (
                                                                <button
                                                                    key={n}
                                                                    type="button"
                                                                    onClick={() => setEditForm((p) => ({ ...p, pack_units: n }))}
                                                                    className={cn(
                                                                        'min-h-12 rounded-xl border px-2 text-sm font-black',
                                                                        Number(editForm.pack_units) === n
                                                                            ? 'border-[#36606F] bg-[#36606F]/5 text-[#36606F]'
                                                                            : 'border-zinc-200 bg-white hover:bg-zinc-50'
                                                                    )}
                                                                >
                                                                    {n}
                                                                </button>
                                                            ))}
                                                            <input
                                                                type="number"
                                                                step="1"
                                                                placeholder="Otro"
                                                                value={editForm.pack_units ?? ''}
                                                                onChange={(e) =>
                                                                    setEditForm((p) => ({
                                                                        ...p,
                                                                        pack_units: e.target.value === '' ? null : parseFloat(e.target.value),
                                                                    }))
                                                                }
                                                                className="min-h-12 rounded-xl border border-zinc-200 px-3 font-mono text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div>
                                                                <div className="text-sm font-bold text-zinc-800">
                                                                    {pricingAssistantCopy.amounts.eachPiece}
                                                                </div>
                                                                <p className="mt-0.5 text-xs leading-snug text-zinc-600">
                                                                    {pricingAssistantCopy.amounts.eachPieceHint}
                                                                </p>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2">
                                                                <label className="block space-y-1">
                                                                    <span className="text-[10px] font-bold uppercase text-zinc-400">Cantidad</span>
                                                                    <input
                                                                        type="number"
                                                                        step="0.001"
                                                                        value={editForm.pack_unit_size_qty ?? ''}
                                                                        onChange={(e) =>
                                                                            setEditForm({
                                                                                ...editForm,
                                                                                pack_unit_size_qty:
                                                                                    e.target.value === '' ? null : parseFloat(e.target.value),
                                                                            })
                                                                        }
                                                                        className="min-h-12 w-full rounded-xl border border-zinc-200 px-3 font-mono text-sm"
                                                                    />
                                                                </label>
                                                                <label className="block space-y-1">
                                                                    <span className="text-[10px] font-bold uppercase text-zinc-400">Medida</span>
                                                                    <select
                                                                        value={editForm.pack_unit_size_unit || 'ud'}
                                                                        onChange={(e) =>
                                                                            setEditForm({ ...editForm, pack_unit_size_unit: e.target.value })
                                                                        }
                                                                        className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                                                    >
                                                                        <option value="ud">ud</option>
                                                                        <option value="ml">ml</option>
                                                                        <option value="cl">cl</option>
                                                                        <option value="l">L</option>
                                                                        <option value="g">g</option>
                                                                        <option value="kg">kg</option>
                                                                    </select>
                                                                </label>
                                                            </div>
                                                        </div>
                                                        <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                                                                {pricingAssistantCopy.amounts.costPreview}
                                                            </div>
                                                            <div className="mt-1 font-black text-[#5E35B1]">
                                                                {(() => {
                                                                    const effective = computeEffectivePriceFromPack({
                                                                        packPrice: editForm.pack_price ?? null,
                                                                        packUnits: editForm.pack_units ?? null,
                                                                        unitSizeQty: editForm.pack_unit_size_qty ?? null,
                                                                        unitSizeUnit: editForm.pack_unit_size_unit ?? null,
                                                                        purchaseUnit: editForm.purchase_unit ?? null,
                                                                    });
                                                                    if (effective == null) return '—';
                                                                    const u = normalizeUnit(editForm.purchase_unit);
                                                                    return `${effective.toFixed(4)}€/${u}`;
                                                                })()}
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <label className="block space-y-1">
                                                        <span className="text-xs font-bold text-zinc-800">{pricingAssistantCopy.amounts.priceEur}</span>
                                                        <span className="mb-1 block text-xs text-zinc-600">
                                                            {pricingAssistantCopy.amounts.priceSimpleHint}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={editForm.current_price ?? ''}
                                                            onChange={(e) =>
                                                                setEditForm({
                                                                    ...editForm,
                                                                    current_price: e.target.value === '' ? 0 : parseFloat(e.target.value),
                                                                })
                                                            }
                                                            className="min-h-12 w-full rounded-xl border border-zinc-200 px-3 font-mono font-bold"
                                                        />
                                                    </label>
                                                )}
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditPricingStep(1)}
                                                        className="min-h-12 flex-1 rounded-xl bg-rose-600 font-black text-white hover:bg-rose-700"
                                                    >
                                                        Atrás
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setEditPricingOpen(false);
                                                            setEditPricingStep(1);
                                                            toast.success('Precio actualizado (pendiente de Guardar)');
                                                        }}
                                                        className="min-h-12 flex-1 rounded-xl bg-zinc-200 font-black text-zinc-800 hover:bg-zinc-300"
                                                    >
                                                        {pricingAssistantCopy.modal.done}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <div className="w-1/2">
                                <label className="ml-2 text-[10px] font-bold uppercase text-gray-400">Categoría</label>
                                <select
                                    value={editForm.category}
                                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                    className="w-full rounded-2xl border bg-white p-3"
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-1/4">
                                <label className="ml-2 text-[10px] font-bold uppercase text-gray-400">% Merma</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={editForm.waste_percentage || ''}
                                    onChange={(e) => setEditForm({ ...editForm, waste_percentage: parseFloat(e.target.value) })}
                                    className="w-full rounded-2xl border p-3 font-bold"
                                />
                            </div>
                            <div className="w-1/4">
                                <label className="ml-2 text-[10px] font-bold uppercase text-gray-400">U. Pedido</label>
                                <select
                                    value={editForm.order_unit || 'unidad'}
                                    onChange={(e) => setEditForm({ ...editForm, order_unit: e.target.value })}
                                    className="w-full rounded-2xl border bg-white p-3"
                                >
                                    {ORDER_UNITS.map((u) => (
                                        <option key={u} value={u}>
                                            {u}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-1/4">
                                <label className="ml-2 text-[10px] font-bold uppercase text-gray-400" title="Stock Recomendado">
                                    Stock Rec.
                                </label>
                                <input
                                    type="number"
                                    step="1"
                                    value={editForm.recommended_stock || ''}
                                    onChange={(e) =>
                                        setEditForm({ ...editForm, recommended_stock: parseFloat(e.target.value) || null })
                                    }
                                    className="w-full rounded-2xl border p-3 font-bold"
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        {!isCustomSupplier ? (
                            <select
                                value={editForm.supplier || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                        setIsCustomSupplier(true);
                                        setCustomSupplierName('');
                                        setEditForm({ ...editForm, supplier: null });
                                    } else setEditForm({ ...editForm, supplier: e.target.value });
                                }}
                                className="w-full rounded-2xl border bg-white p-3"
                            >
                                <option value="">Proveedor...</option>
                                {allSuppliers.map((s) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name}
                                    </option>
                                ))}
                                <option value="custom">+ Nuevo...</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    value={customSupplierName}
                                    onChange={(e) => {
                                        setCustomSupplierName(e.target.value);
                                        setEditForm({ ...editForm, supplier: e.target.value });
                                    }}
                                    className="flex-1 rounded-2xl border p-3"
                                    placeholder="Proveedor"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCustomSupplier(false);
                                        setCustomSupplierName('');
                                        setEditForm({ ...editForm, supplier: null });
                                    }}
                                    className="text-xs font-bold text-red-500"
                                >
                                    X
                                </button>
                            </div>
                        )}

                        {!isCustomSupplier2 ? (
                            <select
                                value={editForm.supplier_2 || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                        setIsCustomSupplier2(true);
                                        setCustomSupplier2Name('');
                                        setEditForm({ ...editForm, supplier_2: null });
                                    } else {
                                        setEditForm({ ...editForm, supplier_2: e.target.value });
                                    }
                                }}
                                className="w-full rounded-2xl border bg-white p-3"
                            >
                                <option value="">Proveedor 2 (opcional)...</option>
                                {allSuppliers.map((s) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name}
                                    </option>
                                ))}
                                <option value="custom">+ Nuevo...</option>
                            </select>
                        ) : (
                            <div className="flex gap-2">
                                <input
                                    value={customSupplier2Name}
                                    onChange={(e) => {
                                        setCustomSupplier2Name(e.target.value);
                                        setEditForm({ ...editForm, supplier_2: e.target.value });
                                    }}
                                    className="flex-1 rounded-2xl border p-3"
                                    placeholder="Proveedor 2"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsCustomSupplier2(false);
                                        setCustomSupplier2Name('');
                                        setEditForm({ ...editForm, supplier_2: null });
                                    }}
                                    className="text-xs font-bold text-red-500"
                                >
                                    X
                                </button>
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={async () => {
                                    if (!confirm('¿Eliminar este ingrediente?')) return;
                                    await supabase.from('ingredients').delete().eq('id', targetIngredient.id);
                                    toast.success('Eliminado');
                                    onSaved();
                                    onClose();
                                }}
                                className="rounded-2xl bg-gray-100 px-4 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-500"
                            >
                                <Trash2 size={20} />
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveEdit}
                                disabled={saving}
                                className="flex-1 rounded-2xl bg-[#5E35B1] py-3 font-bold text-white"
                            >
                                Guardar
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
