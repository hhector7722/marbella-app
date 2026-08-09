'use client';

import React, { useState } from 'react';
import { DESIGN_BENCHMARKS } from '../data';
import { ProductBrand, PatternCategory } from '../types';
import { useStudioStore } from '../../store';

const PRODUCTS: (ProductBrand | 'Todos')[] = [
    'Todos', 'Linear', 'Stripe', 'Vercel', 'Apple', 'Notion', 'Raycast', 'Attio', 'Supabase'
];

const CATEGORIES: (PatternCategory | 'Todas')[] = [
    'Todas', 'Tablas', 'Cabeceras', 'KPIs', 'Filtros', 'Navegación', 'Dashboards'
];

export default function AcademyGallery() {
    const [selectedProduct, setSelectedProduct] = useState<ProductBrand | 'Todos'>('Todos');
    const [selectedCategory, setSelectedCategory] = useState<PatternCategory | 'Todas'>('Todas');

    const { setSelectedBenchmarkId, setActiveStudioTab } = useStudioStore();

    const filteredBenchmarks = DESIGN_BENCHMARKS.filter(b => {
        const matchesProduct = selectedProduct === 'Todos' || b.product === selectedProduct;
        const matchesCategory = selectedCategory === 'Todas' || b.category === selectedCategory;
        return matchesProduct && matchesCategory;
    });

    const handleInspectBenchmark = (id: string) => {
        setSelectedBenchmarkId(id);
        setActiveStudioTab('academy');
    };

    return (
        <div className="flex-1 bg-[#070709] text-white p-8 overflow-y-auto">
            {/* Academy Header Banner */}
            <div className="max-w-6xl mx-auto mb-10">
                <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 bg-gradient-to-r from-indigo-500/20 to-purple-500/20 text-indigo-400 border border-indigo-500/30 rounded-full text-xs font-mono uppercase font-bold tracking-widest">
                        Design Academy • Laboratorio de Inspiración
                    </span>
                </div>
                <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
                    Estudia las decisiones de los mejores productos del mundo
                </h1>
                <p className="text-zinc-400 text-base max-w-3xl leading-relaxed">
                    Reconstrucciones funcionales interactivas para entrenar la mirada como diseñador de producto. 
                    Inspecciona la densidad, el contraste, la reducción de carga cognitiva y traslada sus principios a Marbella OS.
                </p>
            </div>

            {/* Filter Bar */}
            <div className="max-w-6xl mx-auto mb-8 space-y-4">
                {/* Product Filter Tabs */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-white/10">
                    <span className="text-xs text-zinc-500 font-mono uppercase mr-2 font-bold shrink-0">Producto:</span>
                    {PRODUCTS.map(prod => (
                        <button
                            key={prod}
                            onClick={() => setSelectedProduct(prod)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                                selectedProduct === prod
                                    ? 'bg-[#36606F] text-white shadow-md'
                                    : 'bg-white/5 text-zinc-400 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            {prod}
                        </button>
                    ))}
                </div>

                {/* Category Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                    <span className="text-xs text-zinc-500 font-mono uppercase mr-2 font-bold shrink-0">Patrón:</span>
                    {CATEGORIES.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all shrink-0 ${
                                selectedCategory === cat
                                    ? 'bg-white/20 text-white font-bold'
                                    : 'text-zinc-500 hover:text-zinc-300'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Grid of Benchmark Cards */}
            <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredBenchmarks.map(benchmark => (
                    <div
                        key={benchmark.id}
                        onClick={() => handleInspectBenchmark(benchmark.id)}
                        className="group bg-[#0d0d11] hover:bg-[#121218] border border-white/10 hover:border-[#36606F] rounded-2xl p-6 transition-all cursor-pointer flex flex-col justify-between shadow-lg relative overflow-hidden"
                    >
                        {/* Top Product Badge */}
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-xs font-bold font-mono text-zinc-300 group-hover:text-white flex items-center gap-1.5">
                                    <span 
                                        className="w-2 h-2 rounded-full" 
                                        style={{ backgroundColor: benchmark.brandColor }} 
                                    />
                                    {benchmark.product}
                                </span>
                                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 bg-black/40 px-2 py-0.5 rounded">
                                    {benchmark.category}
                                </span>
                            </div>

                            <h3 className="text-lg font-bold text-zinc-100 group-hover:text-white mb-2 tracking-tight">
                                {benchmark.title}
                            </h3>

                            <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                                {benchmark.tagline}
                            </p>
                        </div>

                        {/* Bottom Principles Preview */}
                        <div>
                            <div className="space-y-2 pt-4 border-t border-white/5 mb-4">
                                {benchmark.principles.slice(0, 2).map((p, idx) => (
                                    <div key={idx} className="flex items-start gap-2 text-[11px] text-zinc-400">
                                        <span className="text-[#36606F] font-bold">✓</span>
                                        <span className="truncate">{p.title}</span>
                                    </div>
                                ))}
                            </div>

                            <button className="w-full py-2.5 bg-[#36606F]/20 hover:bg-[#36606F] text-[#5B8FB9] hover:text-white border border-[#36606F]/40 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2">
                                <span>Investigar & Experimentar</span>
                                <span>→</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
