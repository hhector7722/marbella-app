'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Search, Calendar, Filter, X,
    ChevronDown, Download, Info
} from 'lucide-react';
import { cn } from '@/lib/utils';

export default function DetailViewTemplate() {
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState('');

    return (
        <div className="min-h-screen bg-[#5B8FB9] p-4 md:p-6 pb-24">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col min-h-[85vh]">

                    {/* 1. HEADER SÓLIDO */}
                    <div className="bg-[#36606F] px-8 py-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <button onClick={() => router.back()} className="text-white/60 hover:text-white transition-colors p-2 -ml-2">
                                <ArrowLeft size={24} />
                            </button>
                            <h1 className="text-lg font-black text-white uppercase tracking-wider">
                                Título de la Vista
                            </h1>
                        </div>
                        <button className="w-10 h-10 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-90">
                            <Download size={20} />
                        </button>
                    </div>

                    <div className="p-6 md:p-8 flex-1 flex flex-col">

                        {/* 2. FILTROS CONTEXTUALES (Compactos) */}
                        <div className="mb-8 space-y-4">
                            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                                <div className="relative flex-1">
                                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Filtrar datos..."
                                        className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-transparent rounded-2xl text-sm font-bold text-gray-700 outline-none focus:bg-white focus:border-blue-500/20 transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                                <button className="h-12 px-6 rounded-2xl bg-gray-50 border border-transparent font-black text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-2 hover:bg-white hover:border-gray-100 transition-all">
                                    <Calendar size={16} className="text-blue-500" />
                                    Este Mes
                                    <ChevronDown size={14} />
                                </button>
                            </div>
                        </div>

                        {/* 3. RESUMEN KPI CLEAN (Sin tarjetas, solo texto y color) */}
                        <div className="grid grid-cols-3 gap-4 mb-10 py-6 border-y border-gray-50">
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Métrica 1</span>
                                <span className="text-2xl font-black text-[#36606F]">1.000€</span>
                            </div>
                            <div className="flex flex-col items-center border-x border-gray-50">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Métrica 2</span>
                                <span className="text-2xl font-black text-emerald-500">+15.5%</span>
                            </div>
                            <div className="flex flex-col items-center">
                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-1">Alerta</span>
                                <span className="text-2xl font-black text-rose-500">24</span>
                            </div>
                        </div>

                        {/* 4. CONTENT AREA (Bento Grid Example) */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-4 pr-1">
                            <div className="p-6 bg-gray-50 rounded-2xl border border-gray-100">
                                <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4">Sección de Contenido</h3>
                                <div className="space-y-3">
                                    {/* Filas de alta densidad */}
                                    {[1, 2, 3].map((i) => (
                                        <div key={i} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100/50 hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-black">
                                                    {i}
                                                </div>
                                                <span className="text-sm font-bold text-gray-700">Dato Relevante {i}</span>
                                            </div>
                                            <span className="text-xs font-black text-gray-400">12:00h</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
}
