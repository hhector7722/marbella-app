'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Search, Package, Plus, Trash2, Upload, Camera, X, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import { IngredientWizard } from '@/components/ingredients/IngredientWizard';

interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    supplier_2?: string | null;
    current_price: number;
    purchase_unit: string;
    unit_type: string; // Added field
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
}

// Unidades canónicas (sin duplicados tipo lt/l o u/ud)
const STANDARD_UNITS = ['kg', 'g', 'l', 'ml', 'ud', 'cl'];
// Unidad de pedido (humana/operativa). Mantener sin duplicados.
const ORDER_UNITS = ['pack', 'caja', 'ud', 'kg', 'pieza', 'l', 'g', 'ml', 'cl'];
const STANDARD_SUPPLIERS = ['Santa Teresa', 'Sant Aniol', 'Ametller', 'Sanilec', 'Shers', 'Panabad', 'Zander', 'Videla', 'Abril', 'Nestle', 'Fritz Ravich', 'Paellador', 'Vins Pons'];
const CATEGORIES = ['Alimentos', 'Packaging', 'Bebidas'];

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
    const purchaseUnit = args.purchaseUnit ?? 'ud';
    const converted = convertQty(sizeQty, sizeUnit, purchaseUnit);
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
    const [editForm, setEditForm] = useState<Partial<Ingredient>>({});
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isCustomSupplier, setIsCustomSupplier] = useState(false);
    const [customSupplierName, setCustomSupplierName] = useState('');
    const [isCustomSupplier2, setIsCustomSupplier2] = useState(false);
    const [customSupplier2Name, setCustomSupplier2Name] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newIngredient, setNewIngredient] = useState<Partial<Ingredient>>({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit' });
    const [isCreating, setIsCreating] = useState(false);
    const [allSuppliers, setAllSuppliers] = useState<any[]>([]);
    const [editMode, setEditMode] = useState<'wizard' | 'expert'>('wizard');
    const [createMode, setCreateMode] = useState<'wizard' | 'expert'>('wizard');

    useEffect(() => { fetchIngredients(); fetchSuppliers(); }, []);

    async function fetchIngredients() {
        setLoading(true);
        const { data } = await supabase.from('ingredients').select('*').order('name');
        setIngredients(data || []);
        setLoading(false);
    }

    async function fetchSuppliers() {
        const { data } = await supabase.from('suppliers').select('*').order('name');
        if (data) setAllSuppliers(data);
    }

    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'edit' | 'create') {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `ing-${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage.from('ingredients').upload(fileName, file, { upsert: true });
            if (uploadError) throw uploadError;
            const { data: { publicUrl } } = supabase.storage.from('ingredients').getPublicUrl(fileName);
            if (target === 'edit' && editingIngredient) {
                await supabase.from('ingredients').update({ image_url: publicUrl }).eq('id', editingIngredient.id);
                setEditForm(prev => ({ ...prev, image_url: publicUrl }));
                toast.success('Imagen subida');
            } else {
                setNewIngredient(prev => ({ ...prev, image_url: publicUrl }));
            }
        } catch (error: any) { toast.error('Error: ' + error.message); } finally { setUploadingImage(false); }
    }

    async function handleSaveEdit() {
        if (!editingIngredient) return;
        setSaving(true);
        try {
            const mode = (editForm.supplier_pricing_mode ?? 'per_purchase_unit') as 'per_purchase_unit' | 'per_pack';
            const payload: any = {
                name: editForm.name,
                supplier: editForm.supplier || null,
                supplier_2: editForm.supplier_2 || null,
                purchase_unit: editForm.purchase_unit,
                unit_type: editForm.purchase_unit, // se normaliza en DB también
                category: editForm.category,
                waste_percentage: editForm.waste_percentage || 0,
                image_url: editForm.image_url,
                order_unit: editForm.order_unit || 'unidad',
                recommended_stock: editForm.recommended_stock || null,
                supplier_pricing_mode: mode,
            };

            if (mode === 'per_pack') {
                payload.pack_price = editForm.pack_price ?? null;
                payload.pack_units = editForm.pack_units ?? null;
                payload.pack_unit_size_qty = editForm.pack_unit_size_qty ?? null;
                payload.pack_unit_size_unit = editForm.pack_unit_size_unit ?? null;
                // current_price lo deriva el trigger
            } else {
                payload.current_price = editForm.current_price;
                payload.pack_price = null;
                payload.pack_units = null;
                payload.pack_unit_size_qty = null;
                payload.pack_unit_size_unit = null;
            }

            const { error } = await supabase.from('ingredients').update(payload).eq('id', editingIngredient.id);
            if (error) throw error;
            toast.success('Guardado'); setEditingIngredient(null); fetchIngredients();
        } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
    }

    async function handleCreate() {
        if (!newIngredient.name) return toast.error('El nombre es obligatorio');
        setIsCreating(true);
        const unit = newIngredient.purchase_unit || 'kg';
        try {
            const mode = (newIngredient.supplier_pricing_mode ?? 'per_purchase_unit') as 'per_purchase_unit' | 'per_pack';
            const payload: any = {
                ...newIngredient,
                supplier: newIngredient.supplier || null,
                supplier_2: newIngredient.supplier_2 || null,
                purchase_unit: unit,
                unit_type: unit, // DB también lo normaliza
                category: newIngredient.category || 'Alimentos',
                waste_percentage: newIngredient.waste_percentage || 0,
                order_unit: newIngredient.order_unit || 'unidad',
                recommended_stock: newIngredient.recommended_stock || null,
                supplier_pricing_mode: mode,
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
            toast.success('Creado'); setShowCreateModal(false); setNewIngredient({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit' }); fetchIngredients();
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

    const navigateIngredient = (direction: -1 | 1) => {
        if (!editingIngredient) return;
        const currentIndex = filteredIngredients.findIndex(ing => ing.id === editingIngredient.id);
        if (currentIndex === -1) return;

        let newIndex = currentIndex + direction;
        if (newIndex < 0) newIndex = filteredIngredients.length - 1;
        if (newIndex >= filteredIngredients.length) newIndex = 0;

        const nextIng = filteredIngredients[newIndex];
        setEditingIngredient(nextIng);
        setEditForm({ ...nextIng });
    };

    return (
        <div className="p-4 md:p-6 w-full bg-[#5B8FB9] min-h-screen pb-24">
            <Toaster position="top-right" />

            <div className="max-w-7xl mx-auto">
                <div className="bg-[#36606F] rounded-2xl px-4 md:px-6 py-4 md:py-5">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="relative w-full sm:max-w-xs">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/70" />
                            <input
                                type="text"
                                placeholder="Buscar ingrediente..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-white/30"
                            />
                        </div>
                        <div className="flex gap-2 items-center relative flex-1 justify-between w-full">
                            <div className="flex gap-2 items-center">
                                {!selectedSupplier ? (
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowSupplierPopup(!showSupplierPopup)}
                                            className="px-5 py-2.5 bg-white/90 hover:bg-white rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-white/50"
                                        >
                                            Proveedor <ChevronDown size={14} className="text-zinc-400" />
                                        </button>

                                        {showSupplierPopup && (
                                            <>
                                                <div className="fixed inset-0 z-30" onClick={() => setShowSupplierPopup(false)}></div>
                                                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
                                                    <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span>
                                                    </div>
                                                    <button
                                                        onClick={() => { setSelectedSupplier(null); setShowSupplierPopup(false); }}
                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                                    >
                                                        Todos
                                                    </button>
                                                    {suppliersList.map(sup => (
                                                        <button
                                                            key={sup}
                                                            onClick={() => { setSelectedSupplier(sup); setShowSupplierPopup(false); }}
                                                            className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                                        >
                                                            {sup}
                                                        </button>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1 bg-white rounded-2xl pl-4 pr-1.5 py-1.5 shadow-md border border-white">
                                        <span className="text-zinc-800 font-black text-[10px] uppercase tracking-widest">{selectedSupplier}</span>
                                        <button
                                            onClick={() => setSelectedSupplier(null)}
                                            className="p-1.5 hover:bg-zinc-100 rounded-2xl transition-colors"
                                        >
                                            <X size={14} className="text-rose-500" strokeWidth={4} />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => setShowCreateModal(true)}
                                className="bg-[#5E35B1] text-white w-10 h-10 rounded-2xl shadow-lg hover:bg-[#4d2c91] transition-all flex items-center justify-center hover:scale-105 shrink-0"
                            >
                                <Plus className="w-6 h-6" />
                            </button>
                        </div>
                    </div>
                </div>

                {!loading && (
                    <div className="pt-4 md:pt-6">
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6">
                            {filteredIngredients.map(ing => (
                                <div key={ing.id} className="relative group">
                                    <div
                                        onClick={() => {
                                            setEditingIngredient(ing);
                                            setEditForm({ ...ing });
                                        setEditMode('wizard');

                                            const isCustom1 = !!ing.supplier && !STANDARD_SUPPLIERS.includes(ing.supplier);
                                            setIsCustomSupplier(isCustom1);
                                            setCustomSupplierName(isCustom1 ? ing.supplier || '' : '');

                                            const isCustom2 = !!ing.supplier_2 && !STANDARD_SUPPLIERS.includes(ing.supplier_2);
                                            setIsCustomSupplier2(isCustom2);
                                            setCustomSupplier2Name(isCustom2 ? ing.supplier_2 || '' : '');
                                        }}
                                        className="bg-white rounded-2xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col"
                                    >
                                {/* IMAGEN PEQUEÑA SIN BORDE */}
                                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                    {ing.image_url ? <img src={ing.image_url} className="w-full h-full object-contain" /> : <Package className="text-gray-200 w-6 h-6" />}
                                </div>
                                {/* TEXTO */}
                                <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                    <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={ing.name}>{ing.name}</span>
                                    <span className="font-black text-[#5E35B1] text-[10px] shrink-0">{ing.current_price?.toFixed(2)}€</span>
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
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setEditingIngredient(null)}>
                    <div className="bg-white rounded-[20px] max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center shrink-0">
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">Editar</h2>
                            <button onClick={() => setEditingIngredient(null)} className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-[#fafafa] space-y-4">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setEditMode('wizard')}
                                    className={`flex-1 min-h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${editMode === 'wizard' ? 'bg-white border-[#36606F] text-[#36606F]' : 'bg-zinc-50 border-zinc-200 text-zinc-500'}`}
                                >
                                    Asistente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setEditMode('expert')}
                                    className={`flex-1 min-h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${editMode === 'expert' ? 'bg-white border-[#36606F] text-[#36606F]' : 'bg-zinc-50 border-zinc-200 text-zinc-500'}`}
                                >
                                    Modo experto
                                </button>
                            </div>

                            {editMode === 'wizard' && (
                                <IngredientWizard
                                    initialName={String(editForm.name || editingIngredient.name || '')}
                                    onDone={async (res) => {
                                        try {
                                            const payload: any = {
                                                supplier_pricing_mode: res.supplier_pricing_mode,
                                                purchase_unit: res.purchase_unit,
                                                unit_type: res.purchase_unit,
                                                updated_at: new Date().toISOString(),
                                            };
                                            if (res.supplier_pricing_mode === 'per_purchase_unit') {
                                                payload.current_price = res.current_price ?? 0;
                                                payload.pack_price = null;
                                                payload.pack_units = null;
                                                payload.pack_unit_size_qty = null;
                                                payload.pack_unit_size_unit = null;
                                            } else {
                                                payload.pack_price = res.pack_price ?? null;
                                                payload.pack_units = res.pack_units ?? null;
                                                payload.pack_unit_size_qty = res.pack_unit_size_qty ?? null;
                                                payload.pack_unit_size_unit = res.pack_unit_size_unit ?? null;
                                            }
                                            const { error } = await supabase.from('ingredients').update(payload).eq('id', editingIngredient.id);
                                            if (error) throw error;
                                            toast.success('Guardado');
                                            setEditingIngredient(null);
                                            fetchIngredients();
                                        } catch (e: any) {
                                            toast.error(e?.message || 'Error al guardar');
                                        }
                                    }}
                                />
                            )}

                            {editMode === 'expert' && (
                            <div className="space-y-4">
                            <div className="flex justify-center items-center gap-8">
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateIngredient(-1); }}
                                    className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 transition-colors text-zinc-400 hover:text-[#5E35B1] shrink-0 shadow-sm"
                                >
                                    <ChevronLeft size={24} />
                                </button>

                                <div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden group cursor-pointer border-2 border-dashed border-gray-300 hover:border-[#5E35B1] shrink-0">
                                    {editForm.image_url ? <img src={editForm.image_url} className="w-full h-full object-contain" /> : <div className="text-center text-gray-400"><Camera className="w-8 h-8 mx-auto mb-1" /><span className="text-xs">Subir</span></div>}
                                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-bold text-xs transition cursor-pointer">CAMBIAR<input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'edit')} disabled={uploadingImage} /></label>
                                    {uploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><LoadingSpinner size="md" className="text-[#5E35B1]" /></div>}
                                </div>

                                <button
                                    onClick={(e) => { e.stopPropagation(); navigateIngredient(1); }}
                                    className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-50 hover:bg-zinc-100 border border-zinc-100 transition-colors text-zinc-400 hover:text-[#5E35B1] shrink-0 shadow-sm"
                                >
                                    <ChevronRight size={24} />
                                </button>
                            </div>
                            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full p-3 border rounded-2xl font-bold" />
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio según proveedor (albarán)</label>
                                <select
                                    value={editForm.supplier_pricing_mode || 'per_purchase_unit'}
                                    onChange={e => setEditForm({ ...editForm, supplier_pricing_mode: e.target.value as any })}
                                    className="w-full p-3 border rounded-2xl bg-white font-bold"
                                >
                                    <option value="per_purchase_unit">Directo (€/kg, €/L, €/ud)</option>
                                    <option value="per_pack">Botella / lata / caja (unidad proveedor)</option>
                                </select>
                                <p className="text-[11px] text-gray-500 mt-1 px-1.5">
                                    Si el albarán viene por caja/pack/botella/lata, el coste en recetas se calcula usando el contenido.
                                </p>
                            </div>
                            <div className="flex gap-2">
                                {(editForm.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack' ? (
                                    <>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio del proveedor (€)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={editForm.pack_price ?? ''}
                                                onChange={e => setEditForm({ ...editForm, pack_price: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                            />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidades dentro</label>
                                            <input
                                                type="number"
                                                step="1"
                                                value={editForm.pack_units ?? ''}
                                                onChange={e => setEditForm({ ...editForm, pack_units: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                            />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Precio (€/unidad base)</label>
                                            <input
                                                type="number"
                                                step="0.01"
                                                value={editForm.current_price || ''}
                                                onChange={e => setEditForm({ ...editForm, current_price: parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                            />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidad base</label>
                                            <select value={editForm.purchase_unit} onChange={e => setEditForm({ ...editForm, purchase_unit: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">
                                                {STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                                            </select>
                                        </div>
                                    </>
                                )}
                            </div>
                            {(editForm.supplier_pricing_mode || 'per_purchase_unit') === 'per_pack' && (
                                <>
                                    <div className="flex gap-2">
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Contenido por unidad</label>
                                            <input
                                                type="number"
                                                step="0.001"
                                                value={editForm.pack_unit_size_qty ?? ''}
                                                onChange={e => setEditForm({ ...editForm, pack_unit_size_qty: e.target.value === '' ? null : parseFloat(e.target.value) })}
                                                className="w-full p-3 border rounded-2xl font-bold"
                                                placeholder="Ej: 330"
                                            />
                                        </div>
                                        <div className="w-1/2">
                                            <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Unidad contenido</label>
                                            <select
                                                value={editForm.pack_unit_size_unit || 'ud'}
                                                onChange={e => setEditForm({ ...editForm, pack_unit_size_unit: e.target.value })}
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
                                                value={editForm.purchase_unit}
                                                onChange={e => setEditForm({ ...editForm, purchase_unit: e.target.value })}
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
                                </>
                            )}
                            <div className="flex gap-2">
                                <div className="w-1/2">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">Categoría</label>
                                    <select value={editForm.category} onChange={e => setEditForm({ ...editForm, category: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select>
                                </div>
                                <div className="w-1/4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">% Merma</label>
                                    <input type="number" step="0.01" value={editForm.waste_percentage || ''} onChange={e => setEditForm({ ...editForm, waste_percentage: parseFloat(e.target.value) })} className="w-full p-3 border rounded-2xl font-bold" />
                                </div>
                                <div className="w-1/4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">U. Pedido</label>
                                    <select value={editForm.order_unit || 'unidad'} onChange={e => setEditForm({ ...editForm, order_unit: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">{ORDER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                </div>
                                <div className="w-1/4">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2" title="Stock Recomendado">Stock Rec.</label>
                                    <input type="number" step="1" value={editForm.recommended_stock || ''} onChange={e => setEditForm({ ...editForm, recommended_stock: parseFloat(e.target.value) || null })} className="w-full p-3 border rounded-2xl font-bold" placeholder="0" />
                                </div>
                            </div>
                            {!isCustomSupplier ? (
                                <select value={editForm.supplier || ''} onChange={e => { if (e.target.value === 'custom') setIsCustomSupplier(true); else setEditForm({ ...editForm, supplier: e.target.value }) }} className="w-full p-3 border rounded-2xl bg-white">
                                    <option value="">Proveedor...</option>
                                    {STANDARD_SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                                    <option value="custom">+ Nuevo...</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={customSupplierName} onChange={e => { setCustomSupplierName(e.target.value); setEditForm({ ...editForm, supplier: e.target.value }) }} className="flex-1 p-3 border rounded-2xl" placeholder="Proveedor" />
                                    <button
                                        onClick={() => {
                                            setIsCustomSupplier(false);
                                            setCustomSupplierName('');
                                            setEditForm({ ...editForm, supplier: null });
                                        }}
                                        className="text-xs text-red-500 font-bold"
                                    >
                                        X
                                    </button>
                                </div>
                            )}

                            {!isCustomSupplier2 ? (
                                <select
                                    value={editForm.supplier_2 || ''}
                                    onChange={e => {
                                        if (e.target.value === 'custom') {
                                            setIsCustomSupplier2(true);
                                        } else {
                                            setEditForm({ ...editForm, supplier_2: e.target.value });
                                        }
                                    }}
                                    className="w-full p-3 border rounded-2xl bg-white"
                                >
                                    <option value="">Proveedor 2 (opcional)...</option>
                                    {STANDARD_SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                                    <option value="custom">+ Nuevo...</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input
                                        value={customSupplier2Name}
                                        onChange={e => {
                                            setCustomSupplier2Name(e.target.value);
                                            setEditForm({ ...editForm, supplier_2: e.target.value });
                                        }}
                                        className="flex-1 p-3 border rounded-2xl"
                                        placeholder="Proveedor 2"
                                    />
                                    <button
                                        onClick={() => {
                                            setIsCustomSupplier2(false);
                                            setCustomSupplier2Name('');
                                            setEditForm({ ...editForm, supplier_2: null });
                                        }}
                                        className="text-xs text-red-500 font-bold"
                                    >
                                        X
                                    </button>
                                </div>
                            )}
                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        if (!confirm('¿Eliminar este ingrediente?')) return;
                                        await supabase.from('ingredients').delete().eq('id', editingIngredient.id);
                                        toast.success('Eliminado');
                                        setEditingIngredient(null);
                                        fetchIngredients();
                                    }}
                                    className="px-4 bg-gray-100 text-gray-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-colors"
                                >
                                    <Trash2 size={20} />
                                </button>
                                <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-3 bg-[#5E35B1] text-white rounded-2xl font-bold">Guardar</button>
                            </div>
                            </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-[20px] max-w-md w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={e => e.stopPropagation()}>
                        <div className="bg-[#36606F] px-6 py-4 shrink-0">
                            <h2 className="text-lg font-black text-white uppercase tracking-widest">Nuevo</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 bg-[#fafafa] space-y-4">
                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    onClick={() => setCreateMode('wizard')}
                                    className={`flex-1 min-h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${createMode === 'wizard' ? 'bg-white border-[#36606F] text-[#36606F]' : 'bg-zinc-50 border-zinc-200 text-zinc-500'}`}
                                >
                                    Asistente
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCreateMode('expert')}
                                    className={`flex-1 min-h-12 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${createMode === 'expert' ? 'bg-white border-[#36606F] text-[#36606F]' : 'bg-zinc-50 border-zinc-200 text-zinc-500'}`}
                                >
                                    Modo experto
                                </button>
                            </div>

                            <div className="flex justify-center"><div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300"><Upload className="text-gray-400" /><input type="file" className="absolute inset-0 opacity-0" onChange={(e) => handleImageUpload(e, 'create')} /></div></div>
                            <input onChange={e => setNewIngredient({ ...newIngredient, name: e.target.value })} className="w-full p-3 border rounded-2xl font-bold" placeholder="Nombre" />

                            {createMode === 'wizard' && (
                                <IngredientWizard
                                    initialName={String(newIngredient.name || '')}
                                    onDone={async (res) => {
                                        if (!newIngredient.name) return toast.error('El nombre es obligatorio');
                                        setIsCreating(true);
                                        try {
                                            const unit = res.purchase_unit || 'kg';
                                            const payload: any = {
                                                ...newIngredient,
                                                supplier: newIngredient.supplier || null,
                                                supplier_2: newIngredient.supplier_2 || null,
                                                purchase_unit: unit,
                                                unit_type: unit,
                                                category: newIngredient.category || 'Alimentos',
                                                waste_percentage: newIngredient.waste_percentage || 0,
                                                order_unit: newIngredient.order_unit || 'ud',
                                                recommended_stock: newIngredient.recommended_stock || null,
                                                supplier_pricing_mode: res.supplier_pricing_mode,
                                            };
                                            if (res.supplier_pricing_mode === 'per_purchase_unit') {
                                                payload.current_price = res.current_price ?? 0;
                                                payload.pack_price = null;
                                                payload.pack_units = null;
                                                payload.pack_unit_size_qty = null;
                                                payload.pack_unit_size_unit = null;
                                            } else {
                                                payload.pack_price = res.pack_price ?? null;
                                                payload.pack_units = res.pack_units ?? null;
                                                payload.pack_unit_size_qty = res.pack_unit_size_qty ?? null;
                                                payload.pack_unit_size_unit = res.pack_unit_size_unit ?? null;
                                                delete payload.current_price;
                                            }
                                            const { error } = await supabase.from('ingredients').insert(payload);
                                            if (error) throw error;
                                            toast.success('Creado');
                                            setShowCreateModal(false);
                                            setNewIngredient({ category: 'Alimentos', supplier_pricing_mode: 'per_purchase_unit' });
                                            fetchIngredients();
                                        } catch (e: any) {
                                            toast.error(e?.message || 'Error al crear');
                                        } finally {
                                            setIsCreating(false);
                                        }
                                    }}
                                />
                            )}

                            {createMode === 'expert' && (
                            <div className="space-y-4">
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
                                                    const u = normalizeUnit(newIngredient.purchase_unit);
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
                            <div className="flex gap-2">
                                <div className="w-1/3">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">% Merma</label>
                                    <input type="number" step="0.01" value={newIngredient.waste_percentage || ''} onChange={e => setNewIngredient({ ...newIngredient, waste_percentage: parseFloat(e.target.value) })} className="w-full p-3 border rounded-2xl font-bold" placeholder="Merma" />
                                </div>
                                <div className="w-1/3">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2">U. Pedido</label>
                                    <select value={newIngredient.order_unit || 'unidad'} onChange={e => setNewIngredient({ ...newIngredient, order_unit: e.target.value })} className="w-full p-3 border rounded-2xl bg-white">{ORDER_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                                </div>
                                <div className="w-1/3">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase ml-2" title="Stock Recomendado">Stock</label>
                                    <input type="number" step="1" value={newIngredient.recommended_stock || ''} onChange={e => setNewIngredient({ ...newIngredient, recommended_stock: parseFloat(e.target.value) || null })} className="w-full p-3 border rounded-2xl font-bold" placeholder="0" />
                                </div>
                            </div>
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