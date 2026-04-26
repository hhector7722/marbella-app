'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Search, Plus, Trash2, X, ChevronDown, Phone, Mail, User, Package, Truck } from 'lucide-react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { toast, Toaster } from 'sonner';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

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
            if (error) {
                console.error('Supabase Error:', error);
                toast.error(`Error de base de datos: ${error.message}`);
                throw error;
            }

            const dbSuppliers = data || [];
            const combined = [...dbSuppliers];

            // Solo añadir iniciales si no hay una coincidencia clara en la DB
            INITIAL_SUPPLIERS.forEach((initial: Partial<Supplier>) => {
                const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]/g, '');

                const alreadyInDb = dbSuppliers.some(s => {
                    const dbName = normalize(s.name);
                    const initName = normalize(initial.name || '');
                    return dbName === initName || dbName.includes(initName) || initName.includes(dbName);
                });

                if (!alreadyInDb) {
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
        } catch (error: any) {
            console.error('Error fetching suppliers:', error);
            // Fallback solo si la base de datos está inaccesible o vacía
            if (suppliers.length === 0) {
                setSuppliers(INITIAL_SUPPLIERS.map((s, i) => ({
                    id: `fallback-${i}`,
                    name: s.name!,
                    category: s.category!,
                    image_url: null,
                    contact_person: null,
                    phone: null,
                    email: null
                })));
            }
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

    const [detailSupplier, setDetailSupplier] = useState<Supplier | null>(null);

    const filteredSuppliers = suppliers.filter(s => {
        const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (s.contact_person?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
        const matchesCategory = !selectedCategory || s.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">
            <Toaster position="top-right" />

            <div className="mb-6 md:mb-8 flex flex-row gap-2 items-center px-0">
                <div className="relative flex-1 min-w-0">
                    <Search className="absolute left-2.5 md:left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 md:w-4 md:h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-8 md:pl-10 pr-2 md:pr-4 py-2 md:py-3 bg-white/95 rounded-xl md:rounded-2xl shadow-sm outline-none text-xs md:text-sm font-medium text-gray-700 focus:ring-2 focus:ring-emerald-400"
                    />
                </div>
                <div className="flex gap-1.5 md:gap-2 items-center shrink-0">
                    {!selectedCategory ? (
                        <div className="relative">
                            <button
                                onClick={() => setShowCategoryPopup(!showCategoryPopup)}
                                className="px-2.5 md:px-5 py-2 md:py-3 bg-white/90 hover:bg-white rounded-xl md:rounded-2xl font-black text-[9px] md:text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-1 md:gap-2 border border-white/50"
                            >
                                <span className="hidden sm:inline">Categoría</span><span className="sm:hidden">Cat.</span> <ChevronDown size={12} className="text-zinc-400 md:w-3.5 md:h-3.5" />
                            </button>
                            {showCategoryPopup && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowCategoryPopup(false)}></div>
                                    <div className="absolute top-full right-0 mt-2 w-40 md:w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-auto">
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
                        <div className="flex items-center gap-1 bg-white rounded-xl md:rounded-2xl pl-2.5 md:pl-4 pr-1 md:pr-1.5 py-1 md:py-1.5 shadow-md border border-white max-w-[100px] md:max-w-none">
                            <span className="text-zinc-800 font-black text-[9px] md:text-[10px] uppercase tracking-widest truncate">{selectedCategory}</span>
                            <button
                                onClick={() => setSelectedCategory(null)}
                                className="p-1 md:p-1.5 hover:bg-zinc-100 rounded-xl transition-colors shrink-0"
                            >
                                <X size={12} className="text-rose-500 md:w-3.5 md:h-3.5" strokeWidth={4} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-emerald-600 text-white w-9 h-9 md:w-12 md:h-12 rounded-xl md:rounded-2xl shadow-lg hover:bg-emerald-700 transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"
                    >
                        <Plus className="w-5 h-5 md:w-6 md:h-6" />
                    </button>
                </div>
            </div>

            {/* GRID LIMPIO Y ESPACIADO (gap-6) */}
            {!loading && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6 pb-24">
                    {filteredSuppliers.map((supplier) => (
                        <div key={supplier.id} className="relative group">
                            <div
                                onClick={() => setDetailSupplier(supplier)}
                                className="bg-white rounded-xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col"
                            >
                                {/* IMAGEN PEQUEÑA SIN BORDE */}
                                <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                    {supplier.image_url || SUPPLIER_LOGOS[supplier.name] ? (
                                        <img src={supplier.image_url || SUPPLIER_LOGOS[supplier.name] || ''} alt="" className="w-full h-full object-contain" />
                                    ) : (
                                        <Truck className="w-6 h-6 text-gray-200" />
                                    )}
                                </div>
                                {/* TEXTO */}
                                <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                    <span className="font-bold text-gray-700 text-[10px] leading-tight truncate" title={supplier.name}>
                                        {supplier.name}
                                    </span>
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
                <div className="flex items-center justify-center py-20 w-full">
                    <LoadingSpinner size="xl" className="text-white" />
                </div>
            )}

            {/* MODAL DETALLE / CONTACTO PROVEEDOR */}
            {detailSupplier && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setDetailSupplier(null)}>
                    <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-200 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-end -mt-4 -mr-4 mb-2">
                            <button onClick={() => setDetailSupplier(null)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                <X className="text-gray-400" size={20} />
                            </button>
                        </div>

                        <div className="w-32 h-32 mx-auto bg-gray-50 rounded-3xl flex items-center justify-center mb-6 overflow-hidden border border-gray-100 shadow-inner">
                            {detailSupplier.image_url || SUPPLIER_LOGOS[detailSupplier.name] ? (
                                <img src={detailSupplier.image_url || SUPPLIER_LOGOS[detailSupplier.name] || ''} alt="" className="w-full h-full object-contain p-4" />
                            ) : (
                                <Truck className="w-12 h-12 text-gray-200" />
                            )}
                        </div>

                        <h2 className="text-xl font-black text-gray-800 uppercase tracking-wider mb-1">
                            {detailSupplier.name}
                        </h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-[0.2em] mb-4">
                            {detailSupplier.category || 'Varios'}
                        </p>

                        <div className="bg-gray-50 rounded-2xl p-4 mb-6">
                            <div className="flex items-center justify-center gap-2 text-gray-600 font-bold">
                                <Phone size={14} className="text-[#36606F]" />
                                <span>{detailSupplier.phone || 'Sin teléfono'}</span>
                            </div>
                        </div>

                        <div className="flex items-center justify-center gap-6 mt-2">
                            {detailSupplier.phone && (
                                <>
                                    <a
                                        href={`tel:${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? '+' + detailSupplier.phone.replace(/\D/g, '') : '+34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                        className="text-emerald-500 hover:text-emerald-600 transition-colors p-1 active:scale-95"
                                        title="Llamar"
                                    >
                                        <Phone size={28} />
                                    </a>
                                    <a
                                        href={`https://wa.me/${detailSupplier.phone.replace(/\D/g, '').startsWith('34') ? detailSupplier.phone.replace(/\D/g, '') : '34' + detailSupplier.phone.replace(/\D/g, '')}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="transition-all hover:scale-110 active:scale-95"
                                        title="WhatsApp"
                                    >
                                        <Image src="/icons/whatsapp.png" alt="WhatsApp" width={36} height={36} className="object-contain" />
                                    </a>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL CREACIÓN PROVEEDOR - ESTILO INGREDIENTES */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4" onClick={() => setShowCreateModal(false)}>
                    <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-[#3F51B5]">Nuevo Proveedor</h2>
                            <button onClick={() => setShowCreateModal(false)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors"><X className="text-gray-400" /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Nombre Empresa</label>
                                <input
                                    autoFocus
                                    onChange={e => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    className="w-full p-3 border rounded-xl font-bold outline-none focus:border-[#5E35B1]"
                                    placeholder="Ej. Suministros Marbella"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Categoría</label>
                                    <select
                                        onChange={e => setNewSupplier({ ...newSupplier, category: e.target.value })}
                                        className="w-full p-3 border rounded-xl bg-white font-bold outline-none focus:border-[#5E35B1]"
                                    >
                                        {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1.5 ml-1">Teléfono</label>
                                    <input
                                        onChange={e => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                                        className="w-full p-3 border rounded-xl font-bold outline-none focus:border-[#5E35B1]"
                                        placeholder="600 000 000"
                                    />
                                </div>
                            </div>

                            <button
                                className="w-full py-4 bg-[#5E35B1] text-white rounded-xl font-bold mt-2 shadow-lg hover:brightness-110 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isCreating ? (
                                    <>
                                        <LoadingSpinner size="sm" className="text-white" />
                                        <span>Guardando...</span>
                                    </>
                                ) : 'Crear Proveedor'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
