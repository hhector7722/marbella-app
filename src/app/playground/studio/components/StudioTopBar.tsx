'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { ViewportPreset } from '../types';

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
        openNewSurfaceModal,
        toggleCopilotPanel,
        isCopilotOpen,
        openVariantManager
    } = useStudioStore();

    return (
        <header className="h-14 border-b border-white/10 bg-[#0a0a0c] px-4 flex items-center justify-between text-white shrink-0 select-none z-30">
            {/* Left: Product Brand & Active Document Switcher */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#36606F] to-[#1F5FAF] flex items-center justify-center font-bold text-xs shadow-md">
                        M
                    </div>
                    <span className="font-semibold text-sm tracking-tight text-zinc-100">Marbella Studio</span>
                </div>

                {/* Active Variant Switcher & Manager Trigger */}
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/5 border border-white/15 rounded-xl p-1">
                        <select
                            value={activeVariantId || ''}
                            onChange={(e) => setActiveVariant(e.target.value)}
                            className="bg-transparent text-xs font-bold text-white focus:outline-none px-2 cursor-pointer"
                        >
                            {variants.filter(v => !v.isArchived && !v.isSystemVariant).map(v => (
                                <option key={v.id} value={v.id} className="bg-[#121214] text-white font-medium">
                                    {v.name} {v.isBaseVariant ? '⭐' : ''}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={openVariantManager}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                            title="Abrir Gestor Documental de Variantes"
                        >
                            <span>🗂️</span>
                            <span className="hidden md:inline">Gestor ({variants.filter(v => !v.isArchived && !v.isSystemVariant).length})</span>
                        </button>
                    </div>

                    <button
                        onClick={openNewSurfaceModal}
                        className="px-3 py-1 bg-[#36606F] hover:bg-[#407080] border border-[#5B8FB9] rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow"
                        title="Declarar Nueva Intención de Superficie"
                    >
                        <span>+ Nueva Variante</span>
                    </button>
                </div>
            </div>

            {/* Middle: Canvas Viewport & Zoom Controls */}
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

            {/* Right: AI Copilot Toggle & View Mode Toggle & Reset */}
            <div className="flex items-center gap-3">
                {/* Copilot Toggle Trigger */}
                <button
                    onClick={() => toggleCopilotPanel()}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border ${
                        isCopilotOpen
                            ? 'bg-gradient-to-r from-[#36606F] to-indigo-600 border-[#5B8FB9] text-white shadow-md'
                            : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white hover:bg-white/10'
                    }`}
                >
                    <span>✨ Copiloto IA</span>
                </button>

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
