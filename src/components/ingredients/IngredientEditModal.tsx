'use client';

import { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Camera, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast } from 'sonner';
import { PricingChoiceButton, PricingStepHeader } from '@/components/ingredients/PricingAssistantControls';
import { pricingAssistantCopy } from '@/lib/ingredient-pricing-assistant-copy';
import { resolveDeclaredPurchaseUnitWithPackContent } from '@/lib/ingredient-pack-pricing';
import { RECIPE_UNIT_OPTIONS, resolveIngredientRecipeUnit } from '@/lib/recipe-cost';
import { buildSupplierNameSet, getOrphanedSupplierName } from '@/lib/orphaned-supplier';
import { resolveSupplierPickerItems } from '@/lib/supplier-seed';
import { OrphanedSupplierAlert } from '@/components/ingredients/OrphanedSupplierAlert';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/Field';
import { ConfirmModal } from '@/components/ui/ConfirmModal';

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
    recipe_unit?: string | null;
    recommended_stock?: number | null;
    price_locked?: boolean;
}

const ORDER_UNITS = ['pack', 'caja', 'ud', 'kg', 'pieza', 'l', 'g', 'ml', 'cl'];
const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas', 'Limpieza', 'Otros'];
const PACK_UNITS_PRESETS_EDIT = [12, 24];
const COUNTABLE_PACK_UNITS_PRESETS_EDIT = [100, 500, 1000];

function parseDecimalInput(v: string): number | null {
    const n = Number(String(v ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

function isCountableIngredientCategory(category: string | null | undefined): boolean {
    const c = String(category ?? '');
    return c === 'Packaging' || c === 'Limpieza' || c === 'Otros';
}

function packNeedsBaseMeasureStep(category: string | null | undefined): boolean {
    return !isCountableIngredientCategory(category);
}

function displayPricingWizardStep(
    logicalStep: 1 | 2 | 3,
    category: string | null | undefined
): { current: number; total: number } {
    const total = packNeedsBaseMeasureStep(category) ? 3 : 2;
    if (total === 2 && logicalStep === 3) return { current: 2, total: 2 };
    return { current: logicalStep, total };
}

function resolvedPackPurchaseUnit(form: Partial<Ingredient>): string {
    return resolveDeclaredPurchaseUnitWithPackContent(form.purchase_unit ?? 'ud', form.pack_unit_size_unit ?? null);
}

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
    const declaredPurchase = args.purchaseUnit ?? 'ud';
    const storePurchaseUnit = resolveDeclaredPurchaseUnitWithPackContent(declaredPurchase, sizeUnit);
    const converted = convertQty(sizeQty, sizeUnit, storePurchaseUnit);
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
    const [allSuppliers, setAllSuppliers] = useState<{ id: string; name: string }[]>([]);
    const [suppliersLoaded, setSuppliersLoaded] = useState(false);
    const [editPricingOpen, setEditPricingOpen] = useState(false);
    const [editPricingStep, setEditPricingStep] = useState<1 | 2 | 3>(1);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const supplierNamesFromDb = useMemo(() => buildSupplierNameSet(allSuppliers), [allSuppliers]);

    const orphanedSupplier1 = useMemo(
        () => getOrphanedSupplierName(editForm.supplier, supplierNamesFromDb, suppliersLoaded),
        [editForm.supplier, supplierNamesFromDb, suppliersLoaded],
    );

    const orphanedSupplier2 = useMemo(
        () => getOrphanedSupplierName(editForm.supplier_2, supplierNamesFromDb, suppliersLoaded),
        [editForm.supplier_2, supplierNamesFromDb, suppliersLoaded],
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
        setSuppliersLoaded(false);
        void (async () => {
            const { data, error } = await supabase.from('suppliers').select('id,name').order('name');
            if (error) {
                toast.error('No se pudieron cargar los proveedores');
                setSuppliersLoaded(true);
                return;
            }
            const rows = (data ?? []).map((r) => ({
                id: String(r.id),
                name: String(r.name ?? '').trim(),
            })).filter((r) => r.name);
            setAllSuppliers(resolveSupplierPickerItems(rows));
            setSuppliersLoaded(true);
        })();
    }, [ingredientId, supabase]);

    useEffect(() => {
        if (!suppliersLoaded) return;
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
    }, [editForm.supplier, editForm.supplier_2, supplierNamesFromDb, suppliersLoaded]);

    function pickSupplier1FromList() {
        setIsCustomSupplier(false);
        setCustomSupplierName('');
        setEditForm((prev) => ({ ...prev, supplier: null }));
    }

    function clearSupplier1() {
        setIsCustomSupplier(false);
        setCustomSupplierName('');
        setEditForm((prev) => ({ ...prev, supplier: null }));
    }

    function pickSupplier2FromList() {
        setIsCustomSupplier2(false);
        setCustomSupplier2Name('');
        setEditForm((prev) => ({ ...prev, supplier_2: null }));
    }

    function clearSupplier2() {
        setIsCustomSupplier2(false);
        setCustomSupplier2Name('');
        setEditForm((prev) => ({ ...prev, supplier_2: null }));
    }

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

    function buildPricingPayload(
        form: Partial<Ingredient>
    ): { ok: true; payload: Record<string, unknown> } | { ok: false; message: string } {
        const mode = (form.supplier_pricing_mode ?? 'per_purchase_unit') as 'per_purchase_unit' | 'per_pack';
        const purchaseUnitStored =
            mode === 'per_pack'
                ? resolveDeclaredPurchaseUnitWithPackContent(
                      String(form.purchase_unit ?? 'ud'),
                      form.pack_unit_size_unit ?? null
                  )
                : form.purchase_unit ?? 'kg';

        if (mode === 'per_pack') {
            const packPrice = form.pack_price == null ? null : Number(form.pack_price);
            const packUnits = form.pack_units == null ? null : Number(form.pack_units);
            const sizeQty = form.pack_unit_size_qty == null ? 1 : Number(form.pack_unit_size_qty);
            const sizeUnit = String(form.pack_unit_size_unit ?? 'ud').trim() || 'ud';
            if (packPrice == null || !Number.isFinite(packPrice) || packPrice < 0) {
                return { ok: false, message: 'Indica el precio del pack en euros' };
            }
            if (packUnits == null || !Number.isFinite(packUnits) || packUnits <= 0) {
                return { ok: false, message: 'Indica cuántas piezas trae el pack (ej. 1000)' };
            }
            if (!Number.isFinite(sizeQty) || sizeQty <= 0) {
                return { ok: false, message: 'Indica cuánto lleva cada pieza' };
            }
            const converted = convertQty(sizeQty, sizeUnit, purchaseUnitStored);
            if (converted == null || converted <= 0) {
                return {
                    ok: false,
                    message: `No se puede convertir ${sizeQty} ${sizeUnit} a ${purchaseUnitStored}. Revisa medida y base.`,
                };
            }
        }

        const payload: Record<string, unknown> = {
            purchase_unit: purchaseUnitStored,
            unit_type: purchaseUnitStored,
            supplier_pricing_mode: mode,
        };

        if (mode === 'per_pack') {
            payload.pack_price = form.pack_price ?? null;
            payload.pack_units = form.pack_units ?? null;
            payload.pack_unit_size_qty = form.pack_unit_size_qty ?? 1;
            payload.pack_unit_size_unit = form.pack_unit_size_unit ?? 'ud';
        } else {
            payload.current_price = form.current_price ?? 0;
            payload.pack_price = null;
            payload.pack_units = null;
            payload.pack_unit_size_qty = null;
            payload.pack_unit_size_unit = null;
        }

        return { ok: true, payload };
    }

    async function persistPricingToDb(form: Partial<Ingredient>): Promise<boolean> {
        const rowId = activeIngredient?.id ?? ingredient?.id;
        if (!rowId) return false;
        const built = buildPricingPayload(form);
        if (!built.ok) {
            toast.error(built.message);
            return false;
        }
        const payload = built.payload;
        setSaving(true);
        try {
            const { error } = await supabase.from('ingredients').update(payload).eq('id', rowId);
            if (error) throw error;
            setEditForm((p) => ({
                ...p,
                purchase_unit: payload.purchase_unit as string,
                unit_type: payload.unit_type as string,
                supplier_pricing_mode: payload.supplier_pricing_mode as Ingredient['supplier_pricing_mode'],
                pack_price: (payload.pack_price as number | null | undefined) ?? p.pack_price,
                pack_units: (payload.pack_units as number | null | undefined) ?? p.pack_units,
                pack_unit_size_qty: (payload.pack_unit_size_qty as number | null | undefined) ?? p.pack_unit_size_qty,
                pack_unit_size_unit: (payload.pack_unit_size_unit as string | null | undefined) ?? p.pack_unit_size_unit,
            }));
            return true;
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(msg || 'No se pudo guardar el precio');
            return false;
        } finally {
            setSaving(false);
        }
    }

    async function handleSaveEdit() {
        const rowId = activeIngredient?.id ?? ingredient?.id;
        if (!rowId) return;
        setSaving(true);
        try {
            const pricingBuilt = buildPricingPayload(editForm);
            if (!pricingBuilt.ok) {
                toast.error(pricingBuilt.message);
                return;
            }
            const payload: Record<string, unknown> = {
                name: editForm.name,
                supplier: editForm.supplier || null,
                supplier_2: editForm.supplier_2 || null,
                category: editForm.category,
                waste_percentage: editForm.waste_percentage || 0,
                image_url: editForm.image_url,
                order_unit: editForm.order_unit || 'unidad',
                recipe_unit: resolveIngredientRecipeUnit(
                    editForm.recipe_unit,
                    String(pricingBuilt.payload.purchase_unit ?? editForm.purchase_unit ?? 'kg'),
                ),
                recommended_stock: editForm.recommended_stock || null,
                price_locked: !!editForm.price_locked,
                ...pricingBuilt.payload,
            };

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

    async function handleDeleteIngredient() {
        const rowId = activeIngredient?.id ?? ingredient?.id;
        if (!rowId) return;
        setIsDeleting(true);
        try {
            const { error } = await supabase.from('ingredients').delete().eq('id', rowId);
            if (error) throw error;
            toast.success('Eliminado');
            setDeleteConfirmOpen(false);
            onSaved();
            onClose();
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            toast.error(msg);
        } finally {
            setIsDeleting(false);
        }
    }

    if (!ingredient) return null;
    const pricingWizardSteps = displayPricingWizardStep(editPricingStep, editForm.category);
    const packBaseUnit = resolvedPackPurchaseUnit(editForm);

    return (
        <>
        <Modal
            open
            onClose={onClose}
            variant="standard"
            layer="base"
            instance="ingredient-edit"
            usageId="ingredient-edit"
            usageLabel="Editar ingrediente"
            title="Editar"
            headerTone="petroleum"
            scrollContent
            footer={
                <>
                    <Button
                        type="button"
                        variant="destructive"
                        instance="ingredient-edit-delete"
                        onClick={() => setDeleteConfirmOpen(true)}
                    >
                        Eliminar
                    </Button>
                    <Button
                        type="button"
                        variant="primary"
                        instance="ingredient-edit-save"
                        onClick={handleSaveEdit}
                        disabled={saving}
                        loading={saving}
                    >
                        Guardar
                    </Button>
                </>
            }
        >
            <div className="space-y-4">
                    <div className="space-y-4">
                        <div className="flex items-center justify-center gap-8">
                            {showNavArrows ? (
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="ingredient-edit-prev"
                                    icon={<ChevronLeft />}
                                    aria-label="Ingrediente anterior"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateIngredient(-1);
                                    }}
                                />
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
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="ingredient-edit-next"
                                    icon={<ChevronRight />}
                                    aria-label="Ingrediente siguiente"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigateIngredient(1);
                                    }}
                                />
                            ) : (
                                <div className="h-12 w-12 shrink-0" aria-hidden />
                            )}
                        </div>
                        <Field instance="ingredient-edit-name" label="Nombre" htmlFor="ingredient-edit-name">
                            <input
                                id="ingredient-edit-name"
                                value={editForm.name ?? ''}
                                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                            />
                        </Field>
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
                                            {String(editForm.pack_unit_size_unit ?? '') || ''} · base {normalizeUnit(packBaseUnit)}
                                        </div>
                                    ) : null}
                                </div>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    instance="ingredient-edit-pricing"
                                    onClick={() => {
                                        setEditPricingOpen((v) => !v);
                                        setEditPricingStep(1);
                                    }}
                                >
                                    Editar
                                </Button>
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
                                                {pricingAssistantCopy.modal.step(pricingWizardSteps.current, pricingWizardSteps.total)}
                                            </div>
                                        </div>
                                        <Button
                                            type="button"
                                            variant="secondary"
                                            instance="ingredient-pricing-close"
                                            onClick={() => {
                                                setEditPricingOpen(false);
                                                setEditPricingStep(1);
                                            }}
                                        >
                                            Cerrar
                                        </Button>
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
                                                            setEditPricingStep(3);
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
                                                            setEditPricingStep(3);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perPack}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perPackSub}
                                                        onClick={() => {
                                                            if (isCountableIngredientCategory(editForm.category)) {
                                                                setEditForm((p) => ({
                                                                    ...p,
                                                                    supplier_pricing_mode: 'per_pack',
                                                                    purchase_unit: 'ud',
                                                                    unit_type: 'ud',
                                                                    pack_units: p.pack_units ?? 12,
                                                                    pack_unit_size_qty: 1,
                                                                    pack_unit_size_unit: 'ud',
                                                                }));
                                                                setEditPricingStep(3);
                                                                return;
                                                            }
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_pack',
                                                                pack_units: p.pack_units ?? 1,
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.invoiceStyle.perUnit}
                                                        subtitle={pricingAssistantCopy.invoiceStyle.perUnitSub}
                                                        onClick={() => {
                                                            if (isCountableIngredientCategory(editForm.category)) {
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
                                                                setEditPricingStep(3);
                                                                return;
                                                            }
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_purchase_unit',
                                                            }));
                                                            setEditPricingStep(2);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        instance="ingredient-pricing-cancel"
                                                        onClick={() => {
                                                            setEditPricingOpen(false);
                                                            setEditPricingStep(1);
                                                        }}
                                                    >
                                                        Cancelar
                                                    </Button>
                                                </div>
                                            </>
                                        )}

                                        {editPricingStep === 2 && packNeedsBaseMeasureStep(editForm.category) && (
                                            <>
                                                <PricingStepHeader
                                                    title={pricingAssistantCopy.baseMeasure.title}
                                                    hint={pricingAssistantCopy.baseMeasure.hint}
                                                />
                                                <div className="grid grid-cols-1 gap-2">
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.baseMeasure.weight}
                                                        subtitle={pricingAssistantCopy.baseMeasure.weightSub}
                                                        onClick={() => {
                                                            const isPack =
                                                                (editForm.supplier_pricing_mode ?? 'per_purchase_unit') ===
                                                                'per_pack';
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_pack',
                                                                purchase_unit: 'kg',
                                                                unit_type: 'kg',
                                                                pack_units: isPack ? (p.pack_units ?? 1) : 1,
                                                                pack_unit_size_qty: 1,
                                                                pack_unit_size_unit: 'kg',
                                                            }));
                                                            setEditPricingStep(3);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.baseMeasure.volume}
                                                        subtitle={pricingAssistantCopy.baseMeasure.volumeSub}
                                                        onClick={() => {
                                                            const isPack =
                                                                (editForm.supplier_pricing_mode ?? 'per_purchase_unit') ===
                                                                'per_pack';
                                                            setEditForm((p) => ({
                                                                ...p,
                                                                supplier_pricing_mode: 'per_pack',
                                                                purchase_unit: 'l',
                                                                unit_type: 'l',
                                                                pack_units: isPack ? (p.pack_units ?? 1) : 1,
                                                                pack_unit_size_qty: isPack ? (p.pack_unit_size_qty ?? null) : null,
                                                                pack_unit_size_unit: 'l',
                                                            }));
                                                            setEditPricingStep(3);
                                                        }}
                                                    />
                                                    <PricingChoiceButton
                                                        title={pricingAssistantCopy.baseMeasure.count}
                                                        subtitle={pricingAssistantCopy.baseMeasure.countSub}
                                                        onClick={() => {
                                                            const isPack =
                                                                (editForm.supplier_pricing_mode ?? 'per_purchase_unit') ===
                                                                'per_pack';
                                                            if (isPack) {
                                                                setEditForm((p) => ({
                                                                    ...p,
                                                                    supplier_pricing_mode: 'per_pack',
                                                                    purchase_unit: 'ud',
                                                                    unit_type: 'ud',
                                                                    pack_units: p.pack_units ?? 1,
                                                                    pack_unit_size_qty: 1,
                                                                    pack_unit_size_unit: 'ud',
                                                                }));
                                                            } else {
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
                                                            }
                                                            setEditPricingStep(3);
                                                        }}
                                                    />
                                                </div>
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        instance="ingredient-pricing-back-base"
                                                        onClick={() => setEditPricingStep(1)}
                                                    >
                                                        Atrás
                                                    </Button>
                                                </div>
                                            </>
                                        )}

                                        {editPricingStep === 3 && (
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
                                                                        pack_price:
                                                                            e.target.value === ''
                                                                                ? null
                                                                                : parseDecimalInput(e.target.value),
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
                                                            {(isCountableIngredientCategory(editForm.category) ||
                                                            normalizeUnit(editForm.purchase_unit) === 'ud'
                                                                ? COUNTABLE_PACK_UNITS_PRESETS_EDIT
                                                                : PACK_UNITS_PRESETS_EDIT
                                                            ).map((n) => (
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
                                                                        pack_units:
                                                                            e.target.value === ''
                                                                                ? null
                                                                                : parseDecimalInput(e.target.value),
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
                                                                        onChange={(e) => {
                                                                            const unit = e.target.value;
                                                                            const stored = resolveDeclaredPurchaseUnitWithPackContent(
                                                                                editForm.purchase_unit ?? 'ud',
                                                                                unit
                                                                            );
                                                                            setEditForm({
                                                                                ...editForm,
                                                                                pack_unit_size_unit: unit,
                                                                                purchase_unit: stored,
                                                                                unit_type: stored,
                                                                            });
                                                                        }}
                                                                        className="min-h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm"
                                                                    >
                                                                        {normalizeUnit(editForm.purchase_unit) === 'ud' ? (
                                                                            <option value="ud">ud</option>
                                                                        ) : normalizeUnit(editForm.purchase_unit) === 'l' ? (
                                                                            <>
                                                                                <option value="ml">ml</option>
                                                                                <option value="cl">cl</option>
                                                                                <option value="l">L</option>
                                                                            </>
                                                                        ) : normalizeUnit(editForm.purchase_unit) === 'kg' ? (
                                                                            <>
                                                                                <option value="g">g</option>
                                                                                <option value="kg">kg</option>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <option value="ud">ud</option>
                                                                                <option value="ml">ml</option>
                                                                                <option value="cl">cl</option>
                                                                                <option value="l">L</option>
                                                                                <option value="g">g</option>
                                                                                <option value="kg">kg</option>
                                                                            </>
                                                                        )}
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
                                                                    const u = normalizeUnit(
                                                                        resolveDeclaredPurchaseUnitWithPackContent(
                                                                            editForm.purchase_unit ?? 'ud',
                                                                            editForm.pack_unit_size_unit ?? null
                                                                        )
                                                                    );
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
                                                <div className="flex flex-wrap items-center justify-end gap-2">
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        instance="ingredient-pricing-back-amounts"
                                                        onClick={() =>
                                                            setEditPricingStep(
                                                                packNeedsBaseMeasureStep(editForm.category) ? 2 : 1
                                                            )
                                                        }
                                                    >
                                                        Atrás
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        variant="primary"
                                                        instance="ingredient-pricing-done"
                                                        disabled={saving}
                                                        loading={saving}
                                                        onClick={async () => {
                                                            const ok = await persistPricingToDb(editForm);
                                                            if (!ok) return;
                                                            setEditPricingOpen(false);
                                                            setEditPricingStep(1);
                                                            toast.success('Precio guardado');
                                                        }}
                                                    >
                                                        {pricingAssistantCopy.modal.done}
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                                <Field instance="ingredient-edit-category" label="Categoría" htmlFor="ingredient-edit-category">
                                <select
                                    id="ingredient-edit-category"
                                    value={editForm.category}
                                    onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                                >
                                    {CATEGORIES.map((c) => (
                                        <option key={c} value={c}>
                                            {c}
                                        </option>
                                    ))}
                                </select>
                                </Field>
                                <Field instance="ingredient-edit-waste" label="% Merma" htmlFor="ingredient-edit-waste">
                                <input
                                    id="ingredient-edit-waste"
                                    type="number"
                                    step="0.01"
                                    value={editForm.waste_percentage || ''}
                                    onChange={(e) => setEditForm({ ...editForm, waste_percentage: parseFloat(e.target.value) })}
                                />
                                </Field>
                                <Field instance="ingredient-edit-order-unit" label="U. Pedido" htmlFor="ingredient-edit-order-unit">
                                <select
                                    id="ingredient-edit-order-unit"
                                    value={editForm.order_unit || 'unidad'}
                                    onChange={(e) => setEditForm({ ...editForm, order_unit: e.target.value })}
                                >
                                    {ORDER_UNITS.map((u) => (
                                        <option key={u} value={u}>
                                            {u}
                                        </option>
                                    ))}
                                </select>
                                </Field>
                                <Field instance="ingredient-edit-recipe-unit" label="U. receta" htmlFor="ingredient-edit-recipe-unit">
                                <select
                                    id="ingredient-edit-recipe-unit"
                                    value={
                                        editForm.recipe_unit ||
                                        resolveIngredientRecipeUnit(null, editForm.purchase_unit ?? 'kg')
                                    }
                                    onChange={(e) => setEditForm({ ...editForm, recipe_unit: e.target.value })}
                                >
                                    {RECIPE_UNIT_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>
                                            {o.label}
                                        </option>
                                    ))}
                                </select>
                                </Field>
                                <Field instance="ingredient-edit-stock" label="Stock Rec." htmlFor="ingredient-edit-stock">
                                <input
                                    id="ingredient-edit-stock"
                                    type="number"
                                    step="1"
                                    value={editForm.recommended_stock || ''}
                                    onChange={(e) =>
                                        setEditForm({ ...editForm, recommended_stock: parseFloat(e.target.value) || null })
                                    }
                                    placeholder="0"
                                />
                                </Field>
                        </div>
                        {orphanedSupplier1 ? (
                            <OrphanedSupplierAlert
                                supplierName={orphanedSupplier1}
                                onPickFromList={pickSupplier1FromList}
                                onClear={clearSupplier1}
                            />
                        ) : null}
                        {!isCustomSupplier ? (
                            <Field instance="ingredient-edit-supplier" label="Proveedor" htmlFor="ingredient-edit-supplier">
                            <select
                                id="ingredient-edit-supplier"
                                value={editForm.supplier || ''}
                                onChange={(e) => {
                                    if (e.target.value === 'custom') {
                                        setIsCustomSupplier(true);
                                        setCustomSupplierName('');
                                        setEditForm({ ...editForm, supplier: null });
                                    } else setEditForm({ ...editForm, supplier: e.target.value });
                                }}
                            >
                                <option value="">Proveedor...</option>
                                {allSuppliers.map((s) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name}
                                    </option>
                                ))}
                                <option value="custom">+ Nuevo...</option>
                            </select>
                            </Field>
                        ) : (
                            <div className="flex items-end gap-2">
                                <div className="min-w-0 flex-1">
                                    <Field instance="ingredient-edit-supplier-custom" label="Proveedor" htmlFor="ingredient-edit-supplier-custom">
                                    <input
                                        id="ingredient-edit-supplier-custom"
                                        value={customSupplierName}
                                        onChange={(e) => {
                                            setCustomSupplierName(e.target.value);
                                            setEditForm({ ...editForm, supplier: e.target.value });
                                        }}
                                        placeholder="Proveedor"
                                    />
                                    </Field>
                                </div>
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="ingredient-edit-supplier-cancel"
                                    icon={<X />}
                                    aria-label="Cancelar proveedor nuevo"
                                    onClick={() => {
                                        setIsCustomSupplier(false);
                                        setCustomSupplierName('');
                                        setEditForm({ ...editForm, supplier: null });
                                    }}
                                />
                            </div>
                        )}

                        {orphanedSupplier2 ? (
                            <OrphanedSupplierAlert
                                supplierName={orphanedSupplier2}
                                label="Proveedor 2"
                                onPickFromList={pickSupplier2FromList}
                                onClear={clearSupplier2}
                            />
                        ) : null}
                        {!isCustomSupplier2 ? (
                            <Field instance="ingredient-edit-supplier-2" label="Proveedor 2" htmlFor="ingredient-edit-supplier-2">
                            <select
                                id="ingredient-edit-supplier-2"
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
                            >
                                <option value="">Proveedor 2 (opcional)...</option>
                                {allSuppliers.map((s) => (
                                    <option key={s.id} value={s.name}>
                                        {s.name}
                                    </option>
                                ))}
                                <option value="custom">+ Nuevo...</option>
                            </select>
                            </Field>
                        ) : (
                            <div className="flex items-end gap-2">
                                <div className="min-w-0 flex-1">
                                    <Field instance="ingredient-edit-supplier-2-custom" label="Proveedor 2" htmlFor="ingredient-edit-supplier-2-custom">
                                    <input
                                        id="ingredient-edit-supplier-2-custom"
                                        value={customSupplier2Name}
                                        onChange={(e) => {
                                            setCustomSupplier2Name(e.target.value);
                                            setEditForm({ ...editForm, supplier_2: e.target.value });
                                        }}
                                        placeholder="Proveedor 2"
                                    />
                                    </Field>
                                </div>
                                <Button
                                    type="button"
                                    variant="tertiary"
                                    instance="ingredient-edit-supplier-2-cancel"
                                    icon={<X />}
                                    aria-label="Cancelar proveedor 2 nuevo"
                                    onClick={() => {
                                        setIsCustomSupplier2(false);
                                        setCustomSupplier2Name('');
                                        setEditForm({ ...editForm, supplier_2: null });
                                    }}
                                />
                            </div>
                        )}
                    </div>
            </div>
        </Modal>
        <ConfirmModal
            open={deleteConfirmOpen}
            onClose={() => { if (!isDeleting) setDeleteConfirmOpen(false); }}
            title="Eliminar ingrediente"
            confirmLabel="Eliminar"
            instance="ingredient-delete-confirm"
            parentInstance="ingredient-edit"
            usageLabel="Confirmar eliminar ingrediente"
            confirming={isDeleting}
            onConfirm={() => { void handleDeleteIngredient(); }}
        >
            {`¿Seguro que quieres eliminar "${editForm.name ?? ''}"? Esta acción no se puede deshacer.`}
        </ConfirmModal>
        </>
    );
}
