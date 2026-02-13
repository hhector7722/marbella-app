'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, Trash2, X, ChevronDown, Phone, Mail, User, Package, Truck } from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';

interface Supplier {
    id: string;
    name: string;
    contact_person: string | null;
    phone: string | null;
    email: string | null;
    category: string | null;
    image_url: string | null;
}

const SUPPLIER_LOGOS: Record<string, string> = {
    'Ametller': '/icons/prov/Ametller.png',
    'Panabad': '/icons/prov/panabad.png',
    'Videla': '/icons/prov/videla.png',
    'Zander': '/icons/prov/Zander.png',
    'Abril': '/icons/prov/Abril.png',
    'Carnicas Pijuan': '/icons/prov/Pijuan.png',
    'Santa Teresa': '/icons/prov/Sta-Teresa.png',
    'Shers': '/icons/prov/Shers.png',
    'Sanilec': '/icons/prov/Sanilec.png',
    'Nestle': '/icons/prov/Nestle.png',
    'Sant Aniol': '/icons/prov/Sant-Aniol.png',
    'Fritz Ravich': '/icons/prov/Fritz-Ravich.png',
    'Hielo Fenix': '/icons/prov/hielo-fenix.png',
    'Vins i Pons': '/icons/prov/Pons.png'
};

const CATEGORIES = ['Alimentos', 'Bebidas', 'Limpieza', 'Mantenimiento', 'Suministros', 'Otros'];

const INITIAL_SUPPLIERS: Partial<Supplier>[] = [
    { name: 'Ametller', category: 'Alimentos' },
    { name: 'Panabad', category: 'Alimentos' },
    { name: 'Videla', category: 'Alimentos' },
    { name: 'Santa Teresa', category: 'Alimentos' },
    { name: 'Carnicas Pijuan', category: 'Alimentos' },
    { name: 'Fritz Ravich', category: 'Alimentos' },
    { name: 'Sant Aniol', category: 'Bebidas' },
    { name: 'Vins i Pons', category: 'Bebidas' },
    { name: 'Shers', category: 'Bebidas' },
    { name: 'Zander', category: 'Bebidas' },
    { name: 'Nestle', category: 'Alimentos' },
    { name: 'Abril', category: 'Alimentos' },
    { name: 'Sanilec', category: 'Limpieza' },
    { name: 'Hielo Fenix', category: 'Otros' }
];

export default function SuppliersPage() {
    const supabase = createClient();
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [showCategoryPopup, setShowCategoryPopup] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newSupplier, setNewSupplier] = useState<Partial<Supplier>>({ name: '', category: 'Alimentos' });
    const [isCreating, setIsCreating] = useState(false);

    useEffect(() => { fetchSuppliers(); }, []);

    async function fetchSuppliers() {
        try {
            setLoading(true);
            const { data, error } = await supabase.from('suppliers').select('*').order('name');
            if (error) throw error;

            // Combinar con los iniciales si no están en DB
            const dbSuppliers = data || [];
            const combined = [...dbSuppliers];

            INITIAL_SUPPLIERS.forEach((initial: Partial<Supplier>) => {
                if (!dbSuppliers.some(s => s.name.toLowerCase() === initial.name?.toLowerCase())) {
                    combined.push({
                        id: `initial-${initial.name}`,
                        name: initial.name!,
                        category: initial.category!,
                        image_url: null,
                        contact_person: null,
                        phone: null,
                        email: null
                    });
                }
            });

            setSuppliers(combined.sort((a, b) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            // Fallback total a los iniciales si falla la DB
            setSuppliers(INITIAL_SUPPLIERS.map((s, i) => ({
                id: `fallback-${i}`,
                name: s.name!,
                category: s.category!,
                image_url: null,
                contact_person: null,
                phone: null,
                email: null
            })));
        } finally {
            setLoading(false);
        }
    }

    async function handleCreateSupplier() {
        if (!newSupplier.name) { toast.error('El nombre es obligatorio'); return; }
        try {
            setIsCreating(true);
            const { error } = await supabase.from('suppliers').insert(newSupplier);
            if (error) throw error;
            toast.success('Proveedor creado');
            await fetchSuppliers();
            setShowCreateModal(false);
            setNewSupplier({ name: '', category: 'Alimentos' });
        } catch (error: any) {
            toast.error('Error: ' + error.message);
        } finally {
            setIsCreating(false);
        }
    }

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        const matchesCategory = !selectedCategory || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">
            <Toaster position="top-right" />

            {/* CABECERA ESTRECHA MARBELLA DETAIL */}
            <div className="max-w-7xl mx-auto mb-8 bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col">
                <div className="bg-[#36606F] px-8 py-5 flex items-center justify-between">
                    <h1 className="text-xl font-black text-white uppercase tracking-wider">
                        Proveedores
                    </h1>
                    <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 bg-white flex flex-col sm:flex-row gap-4 items-start sm:items-center border-b border-gray-50">
                    <div className="relative w-full sm:max-w-xs">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar proveedor..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-gray-50 rounded-2xl outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#36606F]/20 border-transparent focus:border-[#36606F]/10 border-2 transition-all"
                        />
                    </div>

                    <div className="flex gap-2 items-center relative flex-1 justify-between w-full">
                        <div className="flex gap-2 items-center">
                            {!selectedCategory ? (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowCategoryPopup(!showCategoryPopup)}
                                        className="px-5 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-gray-200"
                                    >
                                        Categoría <ChevronDown size={14} className="text-zinc-400" />
                                    </button>

                                    {showCategoryPopup && (
                                        <>
                                            <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                            <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Seleccionar</span>
                                                </div>
                                                <button
                                                    onClick={() => { setSelectedCategory(null); setShowCategoryPopup(false); }}
                                                    className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                                >
                                                    Todas
                                                </button>
                                                {CATEGORIES.map(cat => (
                                                    <button
                                                        key={cat}
                                                        onClick={() => { setSelectedCategory(cat); setShowCategoryPopup(false); }}
                                                        className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                                    >
                                                        {cat}
                                                    </button>
                                                ))}
                                            </div>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div className="flex items-center gap-1 bg-gray-50 rounded-2xl pl-4 pr-1.5 py-1.5 shadow-sm border border-gray-200">
                                    <span className="text-zinc-800 font-black text-[10px] uppercase tracking-widest">{selectedCategory}</span>
                                    <button
                                        onClick={() => setSelectedCategory(null)}
                                        className="p-1.5 hover:bg-gray-200 rounded-xl transition-colors"
                                    >
                                        <X size={14} className="text-rose-500" strokeWidth={4} />
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-[#36606F] text-white w-12 h-12 rounded-xl shadow-lg hover:brightness-110 transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"
                        >
                            <Plus className="w-6 h-6" />
                        </button>
                    </div>
                </div>
            </div>

            {/* GRID DE GALERÍA ALTA DENSIDAD */}
            <div className="max-w-7xl mx-auto">
                {!loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-6 pb-24">
                        {filteredSuppliers.map((supplier) => (
                            <div key={supplier.id} className="group relative">
                                <div className="bg-white rounded-2xl p-3 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer h-full flex flex-col active:scale-95 border border-white">
                                    {/* LOGO / IMAGEN */}
                                    <div className="h-20 w-full bg-gray-50 rounded-xl flex items-center justify-center mb-3 overflow-hidden relative border border-gray-100/50">
                                        {supplier.image_url || SUPPLIER_LOGOS[supplier.name] ? (
                                            <img src={supplier.image_url || SUPPLIER_LOGOS[supplier.name] || ''} alt="" className="h-full w-full object-contain p-2" />
                                        ) : (
                                            <Truck className="w-8 h-8 text-gray-200" />
                                        )}
                                        <div className="absolute top-1 right-1 px-1.5 py-0.5 bg-white/80 backdrop-blur-sm rounded-md border border-gray-100">
                                            <span className="text-[7px] font-black text-gray-400 uppercase tracking-tighter">{supplier.category || 'Varios'}</span>
                                        </div>
                                    </div>

                                    {/* INFO */}
                                    <div className="flex flex-col gap-1 px-0.5">
                                        <span className="font-black text-gray-800 text-xs leading-tight truncate" title={supplier.name}>
                                            {supplier.name}
                                        </span>
                                        <div className="flex flex-col gap-0.5 opacity-60">
                                            {supplier.contact_person && (
                                                <div className="flex items-center gap-1">
                                                    <User size={8} />
                                                    <span className="text-[8px] font-bold truncate capitalize">{supplier.contact_person}</span>
                                                </div>
                                            )}
                                            {supplier.phone && (
                                                <div className="flex items-center gap-1">
                                                    <Phone size={8} />
                                                    <span className="text-[8px] font-bold">{supplier.phone}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {filteredSuppliers.length === 0 && !loading && (
                            <div className="col-span-full py-20 bg-white/5 rounded-[2.5rem] border-2 border-dashed border-white/20 flex flex-col items-center justify-center gap-4">
                                <Truck size={48} className="text-white/20" />
                                <p className="text-white/40 font-black uppercase tracking-widest text-xs">No se encontraron proveedores</p>
                            </div>
                        )}
                    </div>
                )}
                {loading && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-6">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                            <div key={i} className="bg-white/5 rounded-2xl h-40 animate-pulse border border-white/10"></div>
                        ))}
                    </div>
                )}
            </div>

            {/* MODAL CREACIÓN PROVEEDOR */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-[2.5rem] p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h2 className="text-xl font-black text-gray-800 uppercase tracking-wider">Nuevo Proveedor</h2>
                                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Alta en sistema</p>
                            </div>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="text-gray-400" /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nombre Empresa *</label>
                                <input
                                    autoFocus
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-[#36606F]/20 rounded-2xl font-bold outline-none transition-all text-sm"
                                    placeholder="Ej. Suministros Marbella"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Categoría</label>
                                    <select
                                        onChange={e => setNewSupplier({ ...newSupplier, category: e.target.value })}
                                        className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-[#36606F]/20 rounded-2xl font-bold outline-none bg-white text-sm"
                                    >
                                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Teléfono</label>
                                    <input
                                        onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                        className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-[#36606F]/20 rounded-2xl font-bold outline-none transition-all text-sm"
                                        placeholder="600 000 000"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Email de Pedidos</label>
                                <input
                                    type="email"
                                    onChange={e => setNewSupplier({ ...newSupplier, email: e.target.value })}
                                    className="w-full p-3.5 bg-gray-50 border-2 border-transparent focus:border-[#36606F]/20 rounded-2xl font-bold outline-none transition-all text-sm"
                                    placeholder="pedidos@proveedor.com"
                                />
                            </div>

                            <div className="flex gap-2 pt-4">
                                <button onClick={() => setShowCreateModal(false)} className="flex-1 py-4 bg-gray-100 text-gray-500 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">Cancelar</button>
                                <button
                                    onClick={handleCreateSupplier}
                                    disabled={isCreating}
                                    className="flex-1 py-4 bg-[#36606F] text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-[#36606F]/20 active:scale-95 transition-all disabled:opacity-50"
                                >
                                    {isCreating ? 'Guardando...' : 'Crear Proveedor'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
