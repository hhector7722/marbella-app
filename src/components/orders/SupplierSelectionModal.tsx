import React, { useEffect, useState } from 'react';
import { X, Package, Search } from 'lucide-react';
import { createClient } from "@/utils/supabase/client";
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Supplier {
    id: string;
    name: string;
    image_url?: string;
}

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

export function SupplierSelectionModal({ isOpen, onClose }: Props) {
    const supabase = createClient();
    const router = useRouter();
    const [suppliers, setSuppliers] = useState<Supplier[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        if (!isOpen) return;

        const fetchSuppliers = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('suppliers')
                .select('id, name, image_url')
                .order('name');

            if (!error && data) {
                setSuppliers(data);
            }
            setLoading(false);
        };

        fetchSuppliers();
    }, [isOpen, supabase]);

    if (!isOpen) return null;

    const filteredSuppliers = suppliers.filter(s =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleSelectSupplier = (supplierId: string, supplierName: string) => {
        // Redirigir a la vista de nuevo pedido con el proveedor seleccionado
        router.push(`/orders/new?supplier=${encodeURIComponent(supplierName)}`);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>

                {/* Header Marbella Premium */}
                <div className="bg-[#36606F] px-6 py-4 flex justify-between items-center text-white shrink-0 shadow-md relative z-10">
                    <div className="flex flex-col">
                        <h3 className="text-lg font-black uppercase tracking-wider leading-none">Proveedor</h3>
                        <p className="text-white/70 text-[10px] font-black uppercase tracking-[0.2em] mt-1.5 flex items-center gap-1">
                            <Package size={12} /> Selecciona proveedor
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90"
                    >
                        <X size={20} strokeWidth={3} />
                    </button>
                </div>

                <div className="p-4 bg-gray-50 flex-1 overflow-hidden flex flex-col">
                    {/* Buscador */}
                    <div className="relative mb-4 shrink-0">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="Buscar proveedor..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full h-12 pl-10 pr-4 rounded-xl border-2 border-zinc-200 text-sm font-bold text-zinc-700 bg-white focus:ring-2 focus:ring-[#36606F] focus:border-[#36606F] outline-none transition-all placeholder:text-zinc-300"
                        />
                    </div>

                    <div className="overflow-y-auto no-scrollbar grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {loading ? (
                            <div className="col-span-full py-10 flex justify-center">
                                <span className="text-sm font-bold text-gray-400 animate-pulse">Cargando proveedores...</span>
                            </div>
                        ) : filteredSuppliers.length === 0 ? (
                            <div className="col-span-full py-10 text-center">
                                <span className="text-sm font-bold text-gray-400">No se encontraron proveedores</span>
                            </div>
                        ) : (
                            filteredSuppliers.map(supplier => (
                                <button
                                    key={supplier.id}
                                    onClick={() => handleSelectSupplier(supplier.id, supplier.name)}
                                    className="bg-white border-2 border-gray-100 rounded-2xl p-4 flex flex-col items-center gap-3 transition-all hover:border-[#36606F]/30 hover:shadow-lg active:scale-95 min-h-[110px] justify-center"
                                >
                                    <div className="w-12 h-12 flex items-center justify-center bg-gray-50 rounded-full overflow-hidden shrink-0 border border-gray-100">
                                        {supplier.image_url ? (
                                            <Image
                                                src={supplier.image_url}
                                                alt={supplier.name}
                                                width={48}
                                                height={48}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <Package className="w-6 h-6 text-gray-400" />
                                        )}
                                    </div>
                                    <span className="text-[11px] font-black uppercase text-gray-800 tracking-wider text-center line-clamp-2">
                                        {supplier.name}
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
