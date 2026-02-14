import { useState } from 'react';
import { Search, Package, Plus, Trash2, Camera, X, ChevronDown, Loader2 } from 'lucide-react';

/**
 * TEMPLATE: Gallery View (Estilo Marbella Clean)
 * 
 * Uso: Para vistas con muchos ítems seleccionables que abren modales de detalle/edición.
 * Basado en: src/app/ingredients/page.tsx
 */

export default function GalleryTemplate() {
    // 1. Estados de búsqueda y filtrado
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [selectedCategory, setSelectedCategory] = useState(null);

    return (
        /* FONDO AZUL CORPORATIVO PARA VISTAS DE GALERÍA */
        <div className="p-6 md:p-8 w-full bg-[#5B8FB9] min-h-screen">

            {/* AREA DE CABECERA Y FILTROS (ALTA DENSIDAD) */}
            <div className="mb-8 flex flex-col sm:flex-row gap-4 items-start sm:items-center">

                {/* BUSCADOR ROUNDED-2XL */}
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white/95 rounded-2xl shadow-sm outline-none text-sm font-medium text-gray-700 focus:ring-2 focus:ring-[#5E35B1] transition-all"
                    />
                </div>

                <div className="flex gap-2 items-center relative flex-1 justify-between w-full">
                    <div className="flex gap-2 items-center">
                        {/* SELECTOR DE FILTRO (POPUP FLOTANTE) */}
                        <div className="relative">
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className="px-5 py-2.5 bg-white/90 hover:bg-white rounded-2xl font-black text-[10px] text-zinc-800 uppercase tracking-widest shadow-sm transition-all flex items-center gap-2 border border-white/50"
                            >
                                Filtrar <ChevronDown size={14} className="text-zinc-400" />
                            </button>

                            {showFilters && (
                                <>
                                    <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)}></div>
                                    <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-xl border border-gray-100 py-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
                                        <div className="px-4 py-2 border-b border-gray-50 mb-1">
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Categoría</span>
                                        </div>
                                        {['Opción A', 'Opción B'].map(opt => (
                                            <button
                                                key={opt}
                                                className="w-full text-left px-4 py-2.5 text-xs font-bold text-gray-700 hover:bg-zinc-50 transition-colors uppercase tracking-wider"
                                            >
                                                {opt}
                                            </button>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* BOTÓN ACCIÓN PRINCIPAL (TARGET 48px TÁCTIL) */}
                    <button
                        className="bg-[#5E35B1] text-white w-12 h-12 rounded-2xl shadow-lg hover:bg-[#4d2c91] transition-all flex items-center justify-center hover:scale-105 active:scale-95 shrink-0"
                    >
                        <Plus className="w-6 h-6" />
                    </button>
                </div>
            </div>

            {/* GRID DE ALTA DENSIDAD (GAP-6) */}
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8 gap-6 pb-24">
                {/* ITEM CARD REPETIBLE */}
                {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                    <div key={i} className="relative group overflow-hidden">
                        <div className="bg-white rounded-2xl p-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer h-full flex flex-col active:scale-95">
                            {/* IMAGEN/ICONO */}
                            <div className="h-14 w-full bg-white rounded-lg flex items-center justify-center mb-1 overflow-hidden relative">
                                <Package className="text-gray-200 w-6 h-6" />
                            </div>
                            {/* TEXTOS COMPACTOS */}
                            <div className="flex justify-between items-center mt-auto px-0.5 gap-1">
                                <span className="font-bold text-gray-700 text-[10px] leading-tight truncate">Nombre Ítem</span>
                                <span className="font-black text-[#5E35B1] text-[10px] shrink-0">0.00€</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL DE EDICIÓN FLOTANTE (ESTÁNDAR) */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
                <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl animate-in zoom-in duration-300">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-2xl font-bold text-[#3F51B5]">Título Modal</h2>
                        <button className="p-2 hover:bg-gray-100 rounded-full transition-colors"><X className="text-gray-400" /></button>
                    </div>

                    <div className="space-y-4">
                        {/* AREA DE IMAGEN/UPLOAD */}
                        <div className="flex justify-center">
                            <div className="relative w-32 h-32 bg-white rounded-2xl flex items-center justify-center overflow-hidden border-2 border-dashed border-gray-300 hover:border-[#5E35B1] transition-all cursor-pointer">
                                <div className="text-center text-gray-400">
                                    <Camera className="w-8 h-8 mx-auto mb-1" />
                                    <span className="text-xs font-bold uppercase tracking-widest">Subir</span>
                                </div>
                            </div>
                        </div>

                        {/* INPUTS DE ALTO CONTRASTE */}
                        <input className="w-full p-3 border border-gray-200 rounded-2xl font-bold focus:ring-2 focus:ring-[#5E35B1] outline-none" placeholder="Nombre..." />

                        <div className="flex gap-2">
                            <input type="number" className="w-1/2 p-3 border border-gray-200 rounded-2xl font-bold outline-none" placeholder="0.00" />
                            <select className="w-1/2 p-3 border border-gray-200 rounded-2xl bg-white font-bold outline-none">
                                <option>kg</option>
                                <option>u</option>
                            </select>
                        </div>

                        {/* ACCIONES FINALES */}
                        <div className="flex gap-2 pt-4">
                            <button className="px-4 bg-gray-50 text-gray-400 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-95">
                                <Trash2 size={20} />
                            </button>
                            <button className="flex-1 py-4 bg-[#5E35B1] text-white rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-purple-200 active:scale-95 transition-all">
                                Guardar Cambios
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
