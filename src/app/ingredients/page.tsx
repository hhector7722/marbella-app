'use client';
// SSOT precios ingredientes / albaranes: context/INGREDIENTS_PRECIOS_Y_ALBARANES.md

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { cn } from '@/lib/utils';
import { Search, Package, Plus, Trash2, Upload, Camera, X, ChevronDown, Settings } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import { IngredientWizard } from '@/components/ingredients/IngredientWizard';
import { IngredientEditModal, type Ingredient } from '@/components/ingredients/IngredientEditModal';
import { resolveDeclaredPurchaseUnitWithPackContent } from '@/lib/ingredient-pack-pricing';
import { RECIPE_UNIT_OPTIONS, resolveIngredientRecipeUnit } from '@/lib/recipe-cost';

// Unidades canónicas (sin duplicados tipo lt/l o u/ud)
const STANDARD_UNITS = ['kg', 'g', 'l', 'ml', 'ud', 'cl'];
// Unidad de pedido (humana/operativa). Mantener sin duplicados.
const ORDER_UNITS = ['pack', 'caja', 'ud', 'kg', 'pieza', 'l', 'g', 'ml', 'cl'];
const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas', 'Limpieza', 'Otros'];

function normalizeUnit(u: string | null | undefined): 'g' | 'kg' | 'ml' | 'l' | 'ud' | 'cl' {
    const s = String(u ?? '').trim().toLowerCase();
    if (s === 'u' || s === 'ud' || s === 'un' || s === 'unidad') return 'ud';
    if (s === 'lt' || s === 'l' || s === 'litro') return 'l';
    if (s === 'ml') return 'ml';
    if (s === 'cl') return 'cl';
    if (s === 'kg' || s === 'kilo') return 'kg';
    if (s === 'g' || s === 'gr') return 'g';
    return s as any;
}

function convertQty(qty: number, fromUnit: string, toUnit: string): number | null {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (!Number.isFinite(qty)) return null;
    if (from === to) return qty;

    // cl es volumen (centilitros)
    const fromVol = from === 'ml' || from === 'l' || from === 'cl';
    const toVol = to === 'ml' || to === 'l' || to === 'cl';
    if (fromVol && toVol) {
        const asMl =
            from === 'l' ? qty * 1000 :
            from === 'cl' ? qty * 10 :
            qty;
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

export default function IngredientsPage() {
    const supabase = createClient();
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
    const [showSupplierPopup, setShowSupplierPopup] = useState(false);
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newIngredient, setNewIngredient] = useState<Partial<Ingredient>>({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit' });
    const [isCreating, setIsCreating] = useState(false);
    const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
    const [createMode, setCreateMode] = useState<'wizard' | 'expert'>('wizard');
    const [createSettingsOpen, setCreateSettingsOpen] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isCustomSupplier, setIsCustomSupplier] = useState(false);
    const [customSupplierName, setCustomSupplierName] = useState('');
    const [isCustomSupplier2, setIsCustomSupplier2] = useState(false);
    const [customSupplier2Name, setCustomSupplier2Name] = useState('');

    useEffect(() => { fetchIngredients(); fetchSuppliers(); }, []);

    async function fetchIngredients() {
        setLoading(true);
        const { data } = await supabase.from('ingredients').select('*').order('name');
        setIngredients(data || []);
        setLoading(false);
    }

    async function fetchSuppliers() {
        const { data, error } = await supabase.from('suppliers').select('id,name').order('name');
        if (error) {
            toast.error('No se pudieron cargar los proveedores');
            return;
        }
        if (data) setAllSuppliers(data);
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `ing-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('ingredients').upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('ingredients').getPublicUrl(fileName);
            setNewIngredient(prev => ({ ...prev, image_url: publicUrl }));
        } catch (error: any) { toast.error('Error: ' + error.message); } finally { setUploadingImage(false); }
    }

    async function handleCreate() {
        if (!newIngredient.name) return toast.error('El nombre es obligatorio');
        setIsCreating(true);
        const mode = (newIngredient.supplier_pricing_mode ?? 'per_purchase_unit') as 'per_purchase_unit' | 'per_pack';
        const unit =
            mode === 'per_pack'
                ? resolveDeclaredPurchaseUnitWithPackContent(
                      String(newIngredient.purchase_unit ?? 'ud'),
                      newIngredient.pack_unit_size_unit ?? null
                  )
                : newIngredient.purchase_unit || 'kg';
        try {
            const payload: any = {
                ...newIngredient,
                supplier: newIngredient.supplier || null,
                supplier_2: newIngredient.supplier_2 || null,
                purchase_unit: unit,
                unit_type: unit, // DB también lo normaliza
                category: newIngredient.category || 'Alimentos',
                waste_percentage: newIngredient.waste_percentage || 0,
                order_unit: newIngredient.order_unit || 'unidad',
                recipe_unit: resolveIngredientRecipeUnit(newIngredient.recipe_unit, unit),
                recommended_stock: newIngredient.recommended_stock || null,
                supplier_pricing_mode: mode,
                price_locked: !!newIngredient.price_locked,
            };

            if (mode === 'per_pack') {
                payload.pack_price = newIngredient.pack_price ?? null;
                payload.pack_units = newIngredient.pack_units ?? null;
                payload.pack_unit_size_qty = newIngredient.pack_unit_size_qty ?? null;
                payload.pack_unit_size_unit = newIngredient.pack_unit_size_unit ?? null;
                delete payload.current_price; // lo deriva el trigger
            } else {
                payload.current_price = newIngredient.current_price || 0;
                payload.pack_price = null;
                payload.pack_units = null;
                payload.pack_unit_size_qty = null;
                payload.pack_unit_size_unit = null;
            }

            const { error } = await supabase.from('ingredients').insert(payload);
            if (error) throw error;
            toast.success('Creado');
            setShowCreateModal(false);
            setNewIngredient({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit', price_locked: false });
            setIsCustomSupplier(false);
            setIsCustomSupplier2(false);
            setCustomSupplierName('');
            setCustomSupplier2Name('');
            fetchIngredients();
        } catch (e: any) { toast.error(e.message); } finally { setIsCreating(false); }
    }

    const suppliersList = Array.from(
        new Set(
            ingredients
                .flatMap((i) => [i.supplier, i.supplier_2])
                .filter(Boolean)
        )
    ) as string[];
    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSupplier = !selectedSupplier || ing.supplier === selectedSupplier || ing.supplier_2 === selectedSupplier;
        return matchesSearch && matchesSupplier;
    });

    return (
        <div className="p-4 md:p-6 w-full bg-[#5B8FB9] min-h-screen pb-24">
            <Toaster position="top-right" />

            <div className="max-w-7xl mx-auto">
                <div className="flex flex-row items-center gap-2">
                    <div className="relative min-w-0 flex-1">
                        <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 md:left-4 md:h-4 md:w-4" />
                        <input
                            type="text"
                            placeholder="Buscar ingrediente..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={cn(
                                'w-full rounded-xl bg-white py-2 pr-2 pl-8 text-xs font-medium text-gray-700 shadow-sm outline-none md:rounded-2xl md:py-2.5 md:pr-4 md:pl-10 md:text-sm',
                                'focus:ring-2 focus:ring-[#36606F]/25',
                            )}
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 md:gap-2">
                        {!selectedSupplier ? (
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowSupplierPopup(!showSupplierPopup)}
                                    className="flex items-center gap-1 rounded-xl border border-white/50 bg-white/90 px-2.5 py-2 font-black text-[9px] uppercase tracking-widest text-zinc-800 shadow-sm transition-all hover:bg-white md:gap-2 md:rounded-2xl md:px-5 md:py-2.5 md:text-[10px]"
                                >
                                    <span className="hidden sm:inline">Proveedor</span>
                                    <span className="sm:hidden">Prov.</span>
                                    <ChevronDown size={12} className="text-zinc-400 md:h-3.5 md:w-3.5" />
                                </button>

                                {showSupplierPopup && (
                                    <>
                                        <div data-marbella-modal-root className="fixed inset-0 z-30" onClick={() => setShowSupplierPopup(false)} />
                                        <div className="absolute right-0 top-full z-40 mt-2 w-40 animate-in fade-in slide-in-from-top-2 rounded-2xl border border-gray-100 bg-white py-2 shadow-xl duration-200 md:w-48 pointer-events-auto">
                                            <div className="mb-1 border-b border-gray-50 px-4 py-2">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Seleccionar</span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setSelectedSupplier(null);
                                                    setShowSupplierPopup(false);
                                                }}
                                                className="w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gray-700 transition-colors hover:bg-zinc-50"
                                            >
                                                Todos
                                            </button>
                                            {suppliersList.map((sup) => (
                                                <button
                                                    key={sup}
                                                    type="button"
                                                    onClick={() => {
                                                        setSelectedSupplier(sup);
                                                        setShowSupplierPopup(false);
                                                    }}
                                                    className="w-full px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-gray-700 transition-colors hover:bg-zinc-50"
                                                >
                                                    {sup}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex max-w-[100px] items-center gap-1 rounded-xl border border-white bg-white py-1 pl-2.5 pr-1 shadow-md md:max-w-none md:rounded-2xl md:py-1.5 md:pl-4 md:pr-1.5">
                                <span className="truncate font-black text-[9px] uppercase tracking-widest text-zinc-800 md:text-[10px]">
                                    {selectedSupplier}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSelectedSupplier(null)}
                                    className="shrink-0 rounded-xl p-1 transition-colors hover:bg-zinc-100 md:p-1.5"
                                >
                                    <X size={12} className="text-rose-500 md:h-3.5 md:w-3.5" strokeWidth={4} />
                                </button>
                            </div>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                setCreateMode('wizard');
                                setCreateSettingsOpen(false);
                                setIsCustomSupplier(false);
                                setIsCustomSupplier2(false);
                                setCustomSupplierName('');
                                setCustomSupplier2Name('');
                                setShowCreateModal(true);
                            }}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-lg transition-all hover:scale-105 hover:bg-emerald-700 active:scale-95 md:h-12 md:w-12 md:rounded-2xl"
                        >
                            <Plus className="h-5 w-5 md:h-6 md:w-6" />
                        </button>
                    </div>
                </div>

                {!loading && (
                    <div className="pt-4 md:pt-6">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6">
                            {filteredIngredients.map(ing => (
                                <div key={ing.id} className="relative group">
                                    <div
                                        onClick={() => setEditingIngredient(ing)}
                                        className="bg-white rounded-2xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col"
                                    >
                                {/* IMAGEN PEQUEÑA SIN BORDE */}
                                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                    {ing.image_url ? <img src={ing.image_url} className="w-full h-full object-contain" /> : <Package className="text-gray-200 w-6 h-6" />}
                                </div>
                                {/* TEXTO */}
                                <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                    <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={ing.name}>{ing.name}</span>
                                    <span className="font-black text-[#5E35B1] text-[10px] shrink-0 flex items-center gap-0.5">
                                        {ing.current_price?.toFixed(2)}€
                                        {ing.price_locked ? (
                                            <span className="rounded bg-zinc-200 px-1 text-[8px] font-black uppercase text-zinc-600" title="Precio fijo">
                                                Fijo
                                            </span>
                                        ) : null}
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                        </div>
                    </div>
                )}
            </div>

            {/* MODALES */}
            {editingIngredient && (
                <IngredientEditModal
                    key={editingIngredient.id}
                    ingredient={editingIngredient}
                    onClose={() => setEditingIngredient(null)}
                    onSaved={() => void fetchIngredients()}
                    navigationIngredients={filteredIngredients}
                />
            )}

            {showCreateModal && (
                <div data-marbella-modal-root className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-[20px] max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-4 md:px-6 py-4 shrink-0 flex justify-between items-center gap-3 relative">
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">Nuevo</h2>
                            <div className="flex items-center gap-1 shrink-0">
                                <div className="relative">
                                    <button
                                        type="button"
                                        aria-label="Ajustes"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setCreateSettingsOpen((v) => !v);
                                        }}
                                        className="min-h-12 min-w-12 inline-flex items-center justify-center text-white hover:opacity-80 rounded-full bg-transparent border-0 shadow-none p-0"
                                    >
                                        <Settings className="w-6 h-6" strokeWidth={1.75} />
                                    </button>
                                    {createSettingsOpen && (
                                        <>
                                            <div data-marbella-modal-root className="fixed inset-0 z-[70]" onClick={() => setCreateSettingsOpen(false)} />
                                            <div className="absolute right-0 top-full mt-2 w-64 rounded-2xl bg-white shadow-xl border border-zinc-100 p-3 z-[80] text-left">
                                                <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 px-1">Modo de creación</div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCreateMode('wizard');
                                                        setCreateSettingsOpen(false);
                                                    }}
                                                    className={cn(
                                                        'mt-2 w-full text-left min-h-12 rounded-xl px-3 text-sm font-black',
                                                        createMode === 'wizard' ? 'bg-[#36606F]/10 text-[#36606F]' : 'hover:bg-zinc-50 text-zinc-800'
                                                    )}
                                                >
                                                    Asistente
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setCreateMode('expert');
                                                        setCreateSettingsOpen(false);
                                                    }}
                                                    className={cn(
                                                        'mt-1 w-full text-left min-h-12 rounded-xl px-3 text-sm font-black',
                                                        createMode === 'expert' ? 'bg-[#36606F]/10 text-[#36606F]' : 'hover:bg-zinc-50 text-zinc-800'
                                                    )}
                                                >
                                                    Modo experto
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setShowCreateModal(false)}
                                    className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-[#fafafa] space-y-4">
                            {createMode === 'wizard' && (
                                <IngredientWizard
                                    onClose={() => {
                                        setShowCreateModal(false);
                                        setNewIngredient({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit', price_locked: false });
                                        fetchIngredients();
                                    }}
                                />
                            )}

                            {createMode === 'expert' && (
                            <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 group shrink-0">
                                    {newIngredient.image_url ? (
                                        <img src={newIngredient.image_url} className="w-full h-full object-contain" alt="" />
                                    ) : (
                                        <Upload className="text-gray-400" />
                                    )}
                                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold cursor-pointer">
                                        Foto
                                        <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} disabled={uploadingImage} />
                                    </label>
                                    {uploadingImage && (
                                        <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                            <LoadingSpinner size="md" className="text-[#5E35B1]" />
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Nombre</label>
                                <input
                                    value={newIngredient.name || ''}
                                    onChange={(e) => setNewIngredient({ ...newIngredient, name: e.target.value })}
                                    className="w-full p-3 border rounded-2xl font-bold mt-1"
                                    placeholder="Nombre del ingrediente"
                                />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio según proveedor (albarán)</label>
                                <select
                                    value={newIngredient.supplier_pricing_mode || 'per_purchase_unit'}
                                    onChange={e => setNewIngredient({ ...newIngredient, supplier_pricing_mode: e.target.value as any })}
                                    className="w-full p-3 border rounded-2xl bg-white font-bold"
                                >
                                    <option value="per_purchase_unit">Directo (€/kg, €/L, €/ud)</option>
                                    <option value="per_pack">Botella / lata / caja (unidad proveedor)</option>
                                </select>
                                <p className="text-[11px] text-gray-500 mt-1 px-1.5">
                                    Si el albarán viene por caja/pack/botella/lata, el coste en recetas se calcula usando el contenido.
                                </p>
                            </div>
                            {(newIngredient.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack' ? (
                                <>
                                    <div className="flex gap-2">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio del proveedor (€)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={newIngredient.pack_price ?? ''}
                                                onChange={e => setNewIngredient({ ...newIngredient, pack_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                                placeholder="Ej: 3,25"
                                            />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidades dentro</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={newIngredient.pack_units ?? ''}
                                                onChange={e => setNewIngredient({ ...newIngredient, pack_units: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                                placeholder="Ej: 100"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Contenido por unidad</label>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={newIngredient.pack_unit_size_qty ?? ''}
                                                onChange={e => setNewIngredient({ ...newIngredient, pack_unit_size_qty: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                                placeholder="Ej: 330"
                                            />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidad contenido</label>
                                            <select
                                                value={newIngredient.pack_unit_size_unit || 'ud'}
                                                onChange={e => setNewIngredient({ ...newIngredient, pack_unit_size_unit: e.target.value })}
                                                className="w-full p-3 border rounded-2xl bg-white"
                                            >
                                                <option value="ud">ud</option>
                                                <option value="ml">ml</option>
                                                <option value="cl">cl</option>
                                                <option value="l">L</option>
                                                <option value="g">g</option>
                                                <option value="kg">kg</option>
                                            </select>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 items-end">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidad base (recetas)</label>
                                            <select
                                                value={newIngredient.purchase_unit || 'ud'}
                                                onChange={e => setNewIngredient({ ...newIngredient, purchase_unit: e.target.value })}
                                                className="w-full p-3 border rounded-2xl bg-white"
                                            >
                                                {STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Coste unitario (auto)</label>
                                            <div className="w-full p-3 border rounded-2xl bg-white font-black text-[#5E35B1]">
                                                {(() => {
                                                    const effective = computeEffectivePriceFromPack({
                                                        packPrice: newIngredient.pack_price ?? null,
                                                        packUnits: newIngredient.pack_units ?? null,
                                                        unitSizeQty: newIngredient.pack_unit_size_qty ?? null,
                                                        unitSizeUnit: newIngredient.pack_unit_size_unit ?? null,
                                                        purchaseUnit: newIngredient.purchase_unit ?? null,
                                                    });
                                                    if (effective == null) return '—';
                                                    const u = normalizeUnit(
                                                        resolveDeclaredPurchaseUnitWithPackContent(
                                                            newIngredient.purchase_unit ?? 'ud',
                                                            newIngredient.pack_unit_size_unit ?? null
                                                        )
                                                    );
                                                    return `${effective.toFixed(4)}€/${u}`;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex gap-2">
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio (€/unidad base)</label>
                                        <input
                                            type="number"
                                            step="0.01"
                                            value={newIngredient.current_price || ''}
                                            onChange={e => setNewIngredient({ ...newIngredient, current_price: parseFloat(e.target.value) })}
                                            className="w-full p-3 border rounded-2xl font-bold"
                                            placeholder="Precio"
                                        />
                                    </div>
                                    <div className="w-1/2">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidad base</label>
                                        <select
                                            value={newIngredient.purchase_unit || 'kg'}
                                            onChange={e => setNewIngredient({ ...newIngredient, purchase_unit: e.target.value })}
                                            className="w-full p-3 border rounded-2xl bg-white"
                                        >
                                            {STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                        </select>
                                    </div>
                                </div>
                            )}
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Categoría</label>
                                <select value={newIngredient.category} onChange={e => setNewIngredient({ ...newIngredient, category: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                            </div>
                            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-zinc-100 bg-zinc-50 px-3 py-2">
                                <input
                                    type="checkbox"
                                    checked={!!newIngredient.price_locked}
                                    onChange={(e) => setNewIngredient({ ...newIngredient, price_locked: e.target.checked })}
                                    className="h-5 w-5 shrink-0 rounded border-zinc-300"
                                />
                                <span className="text-xs font-bold leading-snug text-zinc-800">
                                    Precio fijo: no actualizar desde albaranes
                                </span>
                            </label>
                            <div className="flex gap-2 flex-wrap">
                                <div className="w-[calc(50%-0.25rem)] min-w-[7rem]">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">% Merma</label>
                                    <input type="number" step="0.01" value={newIngredient.waste_percentage || ''} onChange={e => setNewIngredient({ ...newIngredient, waste_percentage: parseFloat(e.target.value) })} className="w-full p-3 border rounded-2xl font-bold" placeholder="Merma" />
                                </div>
                                <div className="w-[calc(50%-0.25rem)] min-w-[7rem]">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">U. Pedido</label>
                                    <select value={newIngredient.order_unit || 'unidad'} onChange={e => setNewIngredient({ ...newIngredient, order_unit: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">{ORDER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                </div>
                                <div className="w-[calc(50%-0.25rem)] min-w-[7rem]">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2" title="Unidad al añadir a recetas">U. receta</label>
                                    <select
                                        value={newIngredient.recipe_unit || resolveIngredientRecipeUnit(null, newIngredient.purchase_unit || 'kg')}
                                        onChange={e => setNewIngredient({ ...newIngredient, recipe_unit: e.target.value })}
                                        className="w-full p-3 border rounded-2xl bg-white font-bold"
                                    >
                                        {RECIPE_UNIT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                </div>
                                <div className="w-[calc(50%-0.25rem)] min-w-[7rem]">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2" title="Stock Recomendado">Stock</label>
                                    <input type="number" step="1" value={newIngredient.recommended_stock || ''} onChange={e => setNewIngredient({ ...newIngredient, recommended_stock: parseFloat(e.target.value) || null })} className="w-full p-3 border rounded-2xl font-bold" placeholder="0" />
                                </div>
                            </div>
                            {!isCustomSupplier ? (
                                <select
                                    value={newIngredient.supplier || ''}
                                    onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                            setIsCustomSupplier(true);
                                            setCustomSupplierName('');
                                            setNewIngredient({ ...newIngredient, supplier: undefined });
                                        } else setNewIngredient({ ...newIngredient, supplier: e.target.value || undefined });
                                    }}
                                    className="w-full p-3 border rounded-2xl bg-white"
                                >
                                    <option value="">Proveedor...</option>
                                    {allSuppliers.map((s: { id: number; name: string }) => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                    <option value="custom">+ Nuevo...</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        value={customSupplierName}
                                        onChange={(e) => {
                                            setCustomSupplierName(e.target.value);
                                            setNewIngredient({ ...newIngredient, supplier: e.target.value });
                                        }}
                                        className="flex-1 p-3 border rounded-2xl"
                                        placeholder="Proveedor"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCustomSupplier(false);
                                            setCustomSupplierName('');
                                            setNewIngredient({ ...newIngredient, supplier: undefined });
                                        }}
                                        className="text-xs text-red-500 font-bold"
                                    >
                                        X
                                    </button>
                                </div>
                            )}
                            {!isCustomSupplier2 ? (
                                <select
                                    value={newIngredient.supplier_2 || ''}
                                    onChange={(e) => {
                                        if (e.target.value === 'custom') {
                                            setIsCustomSupplier2(true);
                                            setCustomSupplier2Name('');
                                            setNewIngredient({ ...newIngredient, supplier_2: undefined });
                                        } else setNewIngredient({ ...newIngredient, supplier_2: e.target.value || undefined });
                                    }}
                                    className="w-full p-3 border rounded-2xl bg-white"
                                >
                                    <option value="">Proveedor 2 (opcional)...</option>
                                    {allSuppliers.map((s: { id: number; name: string }) => (
                                        <option key={s.id} value={s.name}>{s.name}</option>
                                    ))}
                                    <option value="custom">+ Nuevo...</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        value={customSupplier2Name}
                                        onChange={(e) => {
                                            setCustomSupplier2Name(e.target.value);
                                            setNewIngredient({ ...newIngredient, supplier_2: e.target.value });
                                        }}
                                        className="flex-1 p-3 border rounded-2xl"
                                        placeholder="Proveedor 2"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsCustomSupplier2(false);
                                            setCustomSupplier2Name('');
                                            setNewIngredient({ ...newIngredient, supplier_2: undefined });
                                        }}
                                        className="text-xs text-red-500 font-bold"
                                    >
                                        X
                                    </button>
                                </div>
                            )}
                            <button onClick={handleCreate} className="w-full py-3 bg-[#5E35B1] text-white rounded-2xl font-bold">Crear</button>
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}