'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Search, Package, Plus, Trash2, Upload, Camera, Loader2, X } from 'lucide-react';
import { toast, Toaster } from 'sonner';

interface Ingredient {
    id: string;
    name: string;
    supplier: string | null;
    current_price: number;
    purchase_unit: string;
    category: string;
    image_url: string | null;
}

const STANDARD_UNITS = ['kg', 'g', 'l', 'ml', 'cl', 'u'];
const STANDARD_SUPPLIERS = ['Santa Teresa', 'Sant Aniol', 'Ametller', 'Sanilec', 'Shers', 'Panabad', 'Zander', 'Videla', 'Abril', 'Nestle', 'Fritz Ravich', 'Paellador', 'Vins Pons'];

export default function IngredientsPage() {
    const supabase = createClient();
    const [ingredients, setIngredients] = useState<Ingredient[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedSupplier, setSelectedSupplier] = useState<string>('Todos');
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [editForm, setEditForm] = useState<Partial<Ingredient>>({});
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isCustomSupplier, setIsCustomSupplier] = useState(false);
    const [customSupplierName, setCustomSupplierName] = useState('');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newIngredient, setNewIngredient] = useState<Partial<Ingredient>>({});
    const [isCreating, setIsCreating] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDeleting, setIsDeleting] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);

    useEffect(() => { fetchIngredients(); }, []);

    async function fetchIngredients() {
        setLoading(true);
        const { data } = await supabase.from('ingredients').select('*').order('name');
        setIngredients(data || []);
        setLoading(false);
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
            const { error } = await supabase.from('ingredients').update({ name: editForm.name, supplier: editForm.supplier, current_price: editForm.current_price, purchase_unit: editForm.purchase_unit, category: editForm.category, image_url: editForm.image_url }).eq('id', editingIngredient.id);
            if (error) throw error;
            toast.success('Guardado'); setEditingIngredient(null); fetchIngredients();
        } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
    }

    async function handleCreate() {
        if (!newIngredient.name || !newIngredient.current_price) return toast.error('Faltan datos');
        setIsCreating(true);
        try {
            const { error } = await supabase.from('ingredients').insert({ ...newIngredient, purchase_unit: newIngredient.purchase_unit || 'kg', category: newIngredient.category || 'Alimentos' });
            if (error) throw error;
            toast.success('Creado'); setShowCreateModal(false); setNewIngredient({}); fetchIngredients();
        } catch (e: any) { toast.error(e.message); } finally { setIsCreating(false); }
    }

    async function handleBulkDelete() {
        if (!confirm(`¿Borrar ${selectedIds.length}?`)) return;
        setIsDeleting(true);
        await supabase.from('ingredients').delete().in('id', selectedIds);
        setIngredients(prev => prev.filter(i => !selectedIds.includes(i.id)));
        setSelectedIds([]); setIsDeleting(false); toast.success('Eliminados');
    }

    const suppliers = ['Todos', ...Array.from(new Set(ingredients.map(i => i.supplier).filter(Boolean))) as string[]];
    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSupplier = selectedSupplier === 'Todos' || ing.supplier === selectedSupplier;
        return matchesSearch && matchesSupplier;
    });

    return (
        // ELIMINADO EL WRAPPER DEL SIDEBAR Y EL FONDO AZUL
        <div className="p-6 md:p-8 w-full">
            <Toaster position="top-right" />

            <div className="mb-8 flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold text-white">Ingredientes</h1>
                    <p className="text-sm text-gray-100">{ingredients.length} items</p>
                </div>
            </div>

            {/* Buscador y Filtros */}
            <div className="mb-8 space-y-3">
                <div className="relative max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-3 py-3 bg-white/90 rounded-2xl outline-none shadow-sm text-sm focus:ring-2 focus:ring-[#7E57C2]" />
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {suppliers.map(s => (
                        <button key={s} onClick={() => setSelectedSupplier(s)} className={`px-3 py-1 rounded-lg font-bold text-[10px] transition uppercase ${selectedSupplier === s ? 'bg-[#5E35B1] text-white shadow' : 'bg-white/60 text-gray-700 hover:bg-white'}`}>{s}</button>
                    ))}
                    <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds([]) }} className="ml-auto px-3 py-1 bg-white/80 rounded-lg font-bold border border-white/50 text-gray-700 text-[10px] uppercase">{selectionMode ? 'Cancelar' : 'Seleccionar'}</button>
                </div>
            </div>

            {/* GRID LIMPIO Y ESPACIADO (gap-6) */}
            {!loading && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6 pb-24">
                    {filteredIngredients.map(ing => (
                        <div key={ing.id} className="relative group">
                            {selectionMode && (
                                <input type="checkbox" checked={selectedIds.includes(ing.id)} onChange={() => setSelectedIds(p => p.includes(ing.id) ? p.filter(id => id !== ing.id) : [...p, ing.id])} className="absolute top-1 left-1 z-20 w-4 h-4 accent-[#5E35B1] cursor-pointer" />
                            )}

                            <div onClick={() => !selectionMode && (setEditingIngredient(ing), setEditForm({ ...ing }))} className={`bg-white rounded-xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col ${selectedIds.includes(ing.id) ? 'ring-4 ring-[#5E35B1] scale-95' : ''}`}>
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
            )}

            {/* Floating Action */}
            {selectedIds.length > 0 ? (
                <div className="fixed bottom-24 md:bottom-8 left-1/2 -translate-x-1/2 bg-[#5E35B1] text-white px-6 py-3 rounded-full shadow-2xl flex gap-4 z-50 animate-in slide-in-from-bottom text-xs items-center">
                    <span className="font-bold">{selectedIds.length} items</span>
                    <div className="h-4 w-px bg-white/20"></div>
                    <button onClick={handleBulkDelete} disabled={isDeleting} className="hover:text-red-200 font-bold flex items-center gap-1 uppercase">{isDeleting ? '...' : <><Trash2 size={14} /> Borrar</>}</button>
                    <button onClick={() => setSelectedIds([])}><X size={14} /></button>
                </div>
            ) : (
                <button onClick={() => setShowCreateModal(true)} className="fixed bottom-24 md:bottom-8 right-6 w-12 h-12 bg-[#5E35B1] text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition z-40"><Plus size={24} /></button>
            )}

            {/* MODALES */}
            {editingIngredient && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setEditingIngredient(null)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-[#3F51B5]">Editar</h2>
                            <button onClick={() => setEditingIngredient(null)}><X className="text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden group cursor-pointer border-2 border-dashed border-gray-300 hover:border-[#5E35B1]">
                                    {editForm.image_url ? <img src={editForm.image_url} className="w-full h-full object-contain" /> : <div className="text-center text-gray-400"><Camera className="w-8 h-8 mx-auto mb-1" /><span className="text-xs">Subir</span></div>}
                                    <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white font-bold text-xs transition cursor-pointer">CAMBIAR<input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'edit')} disabled={uploadingImage} /></label>
                                    {uploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-[#5E35B1]" /></div>}
                                </div>
                            </div>
                            <input value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full p-3 border rounded-xl font-bold" />
                            <div className="flex gap-2">
                                <input type="number" step="0.01" value={editForm.current_price} onChange={e => setEditForm({ ...editForm, current_price: parseFloat(e.target.value) })} className="w-1/2 p-3 border rounded-xl font-bold" />
                                <select value={editForm.purchase_unit} onChange={e => setEditForm({ ...editForm, purchase_unit: e.target.value })} className="w-1/2 p-3 border rounded-xl bg-white">{STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                            </div>
                            {!isCustomSupplier ? (
                                <select value={editForm.supplier || ''} onChange={e => { if (e.target.value === 'custom') setIsCustomSupplier(true); else setEditForm({ ...editForm, supplier: e.target.value }) }} className="w-full p-3 border rounded-xl bg-white">
                                    <option value="">Proveedor...</option>
                                    {STANDARD_SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                                    <option value="custom">+ Nuevo...</option>
                                </select>
                            ) : (
                                <div className="flex gap-2">
                                    <input value={customSupplierName} onChange={e => { setCustomSupplierName(e.target.value); setEditForm({ ...editForm, supplier: e.target.value }) }} className="flex-1 p-3 border rounded-xl" placeholder="Proveedor" />
                                    <button onClick={() => setIsCustomSupplier(false)} className="text-xs text-red-500 font-bold">X</button>
                                </div>
                            )}
                            <button onClick={handleSaveEdit} disabled={saving} className="w-full py-3 bg-[#5E35B1] text-white rounded-xl font-bold">Guardar</button>
                        </div>
                    </div>
                </div>
            )}

            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold text-[#3F51B5] mb-6">Nuevo</h2>
                        <div className="space-y-4">
                            <div className="flex justify-center"><div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300"><Upload className="text-gray-400" /><input type="file" className="absolute inset-0 opacity-0" onChange={(e) => handleImageUpload(e, 'create')} /></div></div>
                            <input onChange={e => setNewIngredient({ ...newIngredient, name: e.target.value })} className="w-full p-3 border rounded-xl font-bold" placeholder="Nombre" />
                            <div className="flex gap-2">
                                <input type="number" step="0.01" onChange={e => setNewIngredient({ ...newIngredient, current_price: parseFloat(e.target.value) })} className="w-1/2 p-3 border rounded-xl font-bold" placeholder="Precio" />
                                <select onChange={e => setNewIngredient({ ...newIngredient, purchase_unit: e.target.value })} className="w-1/2 p-3 border rounded-xl bg-white">{STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                            </div>
                            <button onClick={handleCreate} className="w-full py-3 bg-[#5E35B1] text-white rounded-xl font-bold">Crear</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}