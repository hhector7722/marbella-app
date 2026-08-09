'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { ViewportPreset, StudioTab } from '../types';

export default function StudioTopBar() {
    const { 
        variants, 
        activeVariantId, 
        setActiveVariant, 
        viewMode, 
        setViewMode, 
        viewportPreset, 
        setViewportPreset, 
        zoom, 
        setZoom,
        resetToDefaults,
        addVariant,
        activeStudioTab,
        setActiveStudioTab
    } = useStudioStore();

    const activeVariant = variants.find(v => v.id === activeVariantId);

    const handleCreateVariant = () => {
        const name = prompt('Nombre de la nueva variante:', 'Variante personalizada');
        if (name) {
            addVariant(name, activeVariant?.layout || 'control-panel');
        }
    };

    return (
        <header className="h-14 border-b border-white/10 bg-[#0a0a0c] px-4 flex items-center justify-between text-white shrink-0 select-none z-30">
            {/* Left: Product Brand + Studio Mode Selector */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#36606F] to-[#1F5FAF] flex items-center justify-center font-bold text-xs shadow-md">
                        M
                    </div>
                    <span className="font-semibold text-sm tracking-tight text-zinc-100">Marbella Studio</span>
                </div>

                {/* Navigation Tabs between Editor, Design Academy & Comparator */}
                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                    {[
                        { id: 'canvas', name: '🎨 Lienzo Editor' },
                        { id: 'academy', name: '🎓 Design Academy' },
                        { id: 'comparator', name: '⚖️ Comparador' }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveStudioTab(tab.id as StudioTab)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                activeStudioTab === tab.id
                                    ? 'bg-[#36606F] text-white shadow-md'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                            {tab.name}
                        </button>
                    ))}
                </div>

                {/* Active Variant Dropdown (Only in Canvas tab) */}
                {activeStudioTab === 'canvas' && (
                    <div className="flex items-center gap-2 pl-3 border-l border-white/10">
                        <select
                            value={activeVariantId || ''}
                            onChange={(e) => setActiveVariant(e.target.value)}
                            className="bg-white/5 border border-white/15 rounded-lg px-2.5 py-1 text-xs font-medium text-zinc-200 focus:outline-none focus:border-[#36606F] hover:bg-white/10 transition-colors"
                        >
                            {variants.map(v => (
                                <option key={v.id} value={v.id} className="bg-[#121214] text-white">
                                    {v.name} ({v.layout})
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={handleCreateVariant}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-medium text-zinc-300 transition-colors flex items-center gap-1"
                            title="Nueva Variante"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                            Nueva
                        </button>
                    </div>
                )}
            </div>

            {/* Middle: Canvas Viewport & Zoom Controls (Only in Canvas tab) */}
            {activeStudioTab === 'canvas' && (
                <div className="flex items-center gap-2 bg-white/5 p-1 rounded-xl border border-white/10">
                    <div className="flex items-center border-r border-white/10 pr-2 mr-1">
                        {(['desktop', 'tablet', 'mobile'] as ViewportPreset[]).map(preset => (
                            <button
                                key={preset}
                                onClick={() => setViewportPreset(preset)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                                    viewportPreset === preset
                                        ? 'bg-[#36606F] text-white shadow-sm font-semibold'
                                        : 'text-zinc-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {preset === 'desktop' && 'Escritorio (1400px)'}
                                {preset === 'tablet' && 'Tablet (768px)'}
                                {preset === 'mobile' && 'Móvil (375px)'}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-1 text-xs text-zinc-400">
                        <button
                            onClick={() => setZoom(Math.max(50, zoom - 10))}
                            className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center font-bold"
                        >
                            -
                        </button>
                        <span className="w-10 text-center font-mono text-zinc-300">{zoom}%</span>
                        <button
                            onClick={() => setZoom(Math.min(150, zoom + 10))}
                            className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center font-bold"
                        >
                            +
                        </button>
                    </div>
                </div>
            )}

            {/* Right: View Mode Toggle & Reset */}
            <div className="flex items-center gap-3">
                {activeStudioTab === 'canvas' && (
                    <div className="flex bg-white/5 p-1 rounded-xl border border-white/10">
                        <button
                            onClick={() => setViewMode('edit')}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                viewMode === 'edit'
                                    ? 'bg-[#36606F] text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Editor Visual
                        </button>
                        <button
                            onClick={() => setViewMode('preview')}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                                viewMode === 'preview'
                                    ? 'bg-emerald-600 text-white shadow-sm'
                                    : 'text-zinc-400 hover:text-white'
                            }`}
                        >
                            Vista Limpia
                        </button>
                    </div>
                )}

                <button
                    onClick={resetToDefaults}
                    className="p-1.5 text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all"
                    title="Restablecer estado predeterminado"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>
        </header>
    );
}
