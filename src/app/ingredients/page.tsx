'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import Link from 'next/link';
import { Search, ChefHat, Package, BookOpen, TrendingUp, Settings, Home, X, Save, Plus, Trash2, Upload, Camera, Loader2 } from 'lucide-react';
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

    // Estados Modal Edición
    const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
    const [editForm, setEditForm] = useState<Partial<Ingredient>>({});
    const [saving, setSaving] = useState(false);
    const [uploadingImage, setUploadingImage] = useState(false);
    const [isCustomSupplier, setIsCustomSupplier] = useState(false);
    const [customSupplierName, setCustomSupplierName] = useState('');

    // Estados Modal Creación
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newIngredient, setNewIngredient] = useState<Partial<Ingredient>>({});
    const [isCreating, setIsCreating] = useState(false);

    // Estados Selección
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

    // --- SUBIDA DE IMAGEN ---
    async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>, target: 'edit' | 'create') {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploadingImage(true);
        try {
            const fileExt = file.name.split('.').pop();
            const cleanName = file.name.toLowerCase().replace(/\.[^/.]+$/, "").replace(/[^a-z0-9]/g, "_");
            const fileName = `ing-${Date.now()}-${cleanName}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('ingredients')
                .upload(fileName, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('ingredients')
                .getPublicUrl(fileName);

            if (target === 'edit' && editingIngredient) {
                await supabase.from('ingredients').update({ image_url: publicUrl }).eq('id', editingIngredient.id);
                setEditForm(prev => ({ ...prev, image_url: publicUrl }));
                toast.success('Imagen subida');
            } else {
                setNewIngredient(prev => ({ ...prev, image_url: publicUrl }));
            }
        } catch (error: any) {
            console.error(error);
            toast.error('Error: ' + error.message);
        } finally {
            setUploadingImage(false);
        }
    }

    async function handleSaveEdit() {
        if (!editingIngredient) return;
        setSaving(true);
        try {
            const { error } = await supabase
                .from('ingredients')
                .update({
                    name: editForm.name,
                    supplier: editForm.supplier,
                    current_price: editForm.current_price,
                    purchase_unit: editForm.purchase_unit,
                    category: editForm.category,
                    image_url: editForm.image_url
                })
                .eq('id', editingIngredient.id);

            if (error) throw error;
            toast.success('Guardado');
            setEditingIngredient(null);
            fetchIngredients();
        } catch (e: any) { toast.error(e.message); }
        finally { setSaving(false); }
    }

    async function handleCreate() {
        if (!newIngredient.name || !newIngredient.current_price) return toast.error('Faltan datos');
        setIsCreating(true);
        try {
            const { error } = await supabase.from('ingredients').insert({
                ...newIngredient,
                purchase_unit: newIngredient.purchase_unit || 'kg',
                category: newIngredient.category || 'Alimentos'
            });
            if (error) throw error;
            toast.success('Creado');
            setShowCreateModal(false);
            setNewIngredient({});
            fetchIngredients();
        } catch (e: any) { toast.error(e.message); }
        finally { setIsCreating(false); }
    }

    async function handleBulkDelete() {
        if (!confirm(`¿Borrar ${selectedIds.length} elementos?`)) return;
        setIsDeleting(true);
        await supabase.from('ingredients').delete().in('id', selectedIds);
        setIngredients(prev => prev.filter(i => !selectedIds.includes(i.id)));
        setSelectedIds([]);
        setIsDeleting(false);
        toast.success('Eliminados');
    }

    const suppliers = ['Todos', ...Array.from(new Set(ingredients.map(i => i.supplier).filter(Boolean))) as string[]];
    const filteredIngredients = ingredients.filter(ing => {
        const matchesSearch = ing.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesSupplier = selectedSupplier === 'Todos' || ing.supplier === selectedSupplier;
        return matchesSearch && matchesSupplier;
    });

    return (
        <div className="min-h-screen flex" style={{ backgroundColor: '#5B8FB9' }}>
            <Toaster position="top-right" />

            {/* Sidebar */}
            <aside className="w-20 flex flex-col items-center py-8 space-y-8 shadow-2xl sticky top-0 h-screen overflow-y-auto" style={{ background: 'linear-gradient(to bottom, #4A7A9A, #36606F)' }}>
                <Link href="/" className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform">
                    <ChefHat className="w-7 h-7 text-[#3F51B5]" />
                </Link>
                <nav className="flex flex-col gap-6">
                    <SidebarIcon icon={<Home size={24} />} href="/" />
                    <SidebarIcon icon={<BookOpen size={24} />} href="/recipes" />
                    <SidebarIcon icon={<Package size={24} />} active />
                    <SidebarIcon icon={<TrendingUp size={24} />} />
                    <SidebarIcon icon={<Settings size={24} />} />
                </nav>
            </aside>

            {/* Main Content: MÁS PADDING (p-8) */}
            <main className="flex-1 p-8 overflow-y-auto">
                <div className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-4xl font-bold text-white">Ingredientes</h1>
                        <p className="text-gray-100">{ingredients.length} items</p>
                    </div>
                </div>

                {/* Filtros */}
                <div className="mb-8 space-y-4">
                    <div className="relative max-w-md">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input type="text" placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-12 pr-4 py-3 bg-white/90 rounded-2xl outline-none shadow-lg focus:ring-2 focus:ring-[#7E57C2]" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {suppliers.map(s => (
                            <button key={s} onClick={() => setSelectedSupplier(s)} className={`px-4 py-2 rounded-xl font-bold transition uppercase text-xs ${selectedSupplier === s ? 'bg-[#5E35B1] text-white shadow-lg' : 'bg-white/60 text-gray-700 hover:bg-white'}`}>{s}</button>
                        ))}
                        <button onClick={() => { setSelectionMode(!selectionMode); setSelectedIds([]) }} className="ml-auto px-4 py-2 bg-white/80 rounded-xl font-bold border border-white/50 text-gray-700 text-xs uppercase">{selectionMode ? 'Cancelar' : 'Seleccionar'}</button>
                    </div>
                </div>

                {/* GRID: MÁS GAP (gap-6) Y MENOS COLUMNAS PARA DAR AIRE */}
                {!loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 pb-20">
                        {filteredIngredients.map(ing => (
                            <div key={ing.id} className="relative group">
                                {selectionMode && (
                                    <input type="checkbox" checked={selectedIds.includes(ing.id)} onChange={() => setSelectedIds(p => p.includes(ing.id) ? p.filter(id => id !== ing.id) : [...p, ing.id])} className="absolute top-2 left-2 z-20 w-5 h-5 accent-[#5E35B1] cursor-pointer" />
                                )}

                                <div
                                    onClick={() => !selectionMode && (setEditingIngredient(ing), setEditForm({ ...ing }))}
                                    className={`bg-white rounded-2xl p-3 shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer h-full flex flex-col ${selectedIds.includes(ing.id) ? 'ring-4 ring-[#5E35B1] scale-95' : ''}`}
                                >
                                    {/* IMAGEN PEQUEÑA SIN BORDES */}
                                    <div className="h-16 w-full bg-white rounded-xl flex items-center justify-center mb-2 overflow-hidden relative">
                                        {ing.image_url ? (
                                            <img src={ing.image_url} className="w-full h-full object-contain" />
                                        ) : (
                                            <Package className="text-gray-200 w-8 h-8" />
                                        )}
                                    </div>

                                    {/* TEXTO EN FILA (Nombre ... Precio) */}
                                    <div className="flex justify-between items-center mt-auto gap-2 border-t border-gray-50 pt-2">
                                        <span className="font-bold text-gray-700 text-xs truncate" title={ing.name}>{ing.name}</span>
                                        <span className="font-black text-[#5E35B1] text-xs shrink-0">{ing.current_price?.toFixed(2)}€</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>

            {/* Floating Action */}
            {selectedIds.length > 0 ? (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#5E35B1] text-white px-8 py-4 rounded-full shadow-2xl flex gap-6 z-50 animate-in slide-in-from-bottom items-center">
                    <span className="font-bold">{selectedIds.length} seleccionados</span>
                    <button onClick={handleBulkDelete} disabled={isDeleting} className="hover:text-red-200 font-bold flex items-center gap-2 uppercase">{isDeleting ? '...' : <><Trash2 size={18} /> Borrar</>}</button>
                    <button onClick={() => setSelectedIds([])}><X size={18} /></button>
                </div>
            ) : (
                <button onClick={() => setShowCreateModal(true)} className="fixed bottom-8 right-8 w-16 h-16 bg-[#5E35B1] text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition z-40"><Plus size={32} /></button>
            )}

            {/* EDIT MODAL */}
            {editingIngredient && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setEditingIngredient(null)}>
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
                            <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} className="w-full p-3 border rounded-xl font-bold" placeholder="Nombre" />
                            <div className="flex gap-2">
                                <input type="number" step="0.01" value={editForm.current_price} onChange={e => setEditForm({ ...editForm, current_price: parseFloat(e.target.value) })} className="w-1/2 p-3 border rounded-xl font-bold" placeholder="Precio" />
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
                                    <input type="text" value={customSupplierName} onChange={e => { setCustomSupplierName(e.target.value); setEditForm({ ...editForm, supplier: e.target.value }) }} className="flex-1 p-3 border rounded-xl" placeholder="Nombre Proveedor" />
                                    <button onClick={() => setIsCustomSupplier(false)} className="text-xs text-red-500 font-bold">X</button>
                                </div>
                            )}
                            <div className="flex gap-2 pt-4">
                                <button onClick={() => setEditingIngredient(null)} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600">Cancelar</button>
                                <button onClick={handleSaveEdit} disabled={saving} className="flex-1 py-3 bg-[#5E35B1] text-white rounded-xl font-bold hover:shadow-lg">{saving ? '...' : 'Guardar'}</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CREATE MODAL */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
                        <h2 className="text-2xl font-bold text-[#3F51B5] mb-6">Nuevo Ingrediente</h2>
                        <div className="space-y-4">
                            <div className="flex justify-center">
                                <div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300">
                                    {newIngredient.image_url ? <img src={newIngredient.image_url} className="w-full h-full object-contain" /> : <Upload className="text-gray-400" />}
                                    <label className="absolute inset-0 opacity-0 hover:opacity-100 cursor-pointer flex items-center justify-center bg-black/30 text-white font-bold text-xs transition">SUBIR<input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'create')} disabled={uploadingImage} /></label>
                                    {uploadingImage && <div className="absolute inset-0 bg-white/80 flex items-center justify-center"><Loader2 className="animate-spin text-[#5E35B1]" /></div>}
                                </div>
                            </div>
                            <input type="text" onChange={e => setNewIngredient({ ...newIngredient, name: e.target.value })} className="w-full p-3 border rounded-xl font-bold" placeholder="Nombre" />
                            <div className="flex gap-2">
                                <input type="number" step="0.01" onChange={e => setNewIngredient({ ...newIngredient, current_price: parseFloat(e.target.value) })} className="w-1/2 p-3 border rounded-xl font-bold" placeholder="Precio" />
                                <select onChange={e => setNewIngredient({ ...newIngredient, purchase_unit: e.target.value })} className="w-1/2 p-3 border rounded-xl bg-white">{STANDARD_UNITS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                            </div>
                            <button onClick={handleCreate} disabled={isCreating} className="w-full py-3 bg-[#5E35B1] text-white rounded-xl font-bold hover:shadow-lg mt-4">{isCreating ? 'Creando...' : 'Crear Ingrediente'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function SidebarIcon({ icon, active, href }: { icon: React.ReactNode; active?: boolean; href?: string }) {
    const className = `w-12 h-12 flex items-center justify-center rounded-xl transition-all ${active ? 'bg-white text-[#3F51B5] shadow-lg' : 'text-white/70 hover:text-white hover:bg-white/10'}`;
    return href ? <Link href={href} className={className}>{icon}</Link> : <div className={className}>{icon}</div>;
}