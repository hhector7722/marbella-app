'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { ViewportPreset } from '../types';
import { getSurfaceContract, canSurfaceFitViewport } from '../contracts';

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
        openVariantManager,
        openNewSurfaceModal,
        isCopilotOpen,
        toggleCopilotPanel,
        isGeneratingAI
    } = useStudioStore();

    const activeVariant = variants.find(v => v.id === activeVariantId);
    const activeContract = activeVariant ? getSurfaceContract(activeVariant.surfaceType) : null;
    const fitsViewport = activeVariant ? canSurfaceFitViewport(activeVariant.surfaceType, viewportPreset) : true;

    return (
        <header className="h-14 border-b border-white/10 bg-[#0a0a0c] px-4 flex items-center justify-between text-white shrink-0 select-none z-30">
            {/* Left: Product Brand & Active Variant Switcher */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 pr-3 border-r border-white/10">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#36606F] to-[#1F5FAF] flex items-center justify-center font-bold text-xs shadow-md">
                        M
                    </div>
                    <span className="font-semibold text-sm tracking-tight text-zinc-100">Marbella Studio</span>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-white/5 border border-white/15 rounded-xl p-1">
                        <select
                            value={activeVariantId || ''}
                            onChange={(e) => setActiveVariant(e.target.value)}
                            className="bg-transparent text-xs font-bold text-white focus:outline-none px-2 cursor-pointer"
                        >
                            {variants.map(v => (
                                <option key={v.id} value={v.id} className="bg-[#121214] text-white font-medium">
                                    {v.name}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={openVariantManager}
                            className="px-2 py-1 bg-white/10 hover:bg-white/20 text-zinc-200 text-xs font-bold rounded-lg transition-colors"
                            title="Gestionar pantallas"
                        >
                            <span className="hidden md:inline">Gestionar</span>
                            <span className="md:hidden">⋯</span>
                        </button>
                    </div>

                    <button
                        onClick={openNewSurfaceModal}
                        className="px-3 py-1 bg-[#36606F] hover:bg-[#407080] border border-[#5B8FB9] rounded-xl text-xs font-bold text-white transition-all flex items-center gap-1.5 shadow"
                        title="Crear una nueva superficie gobernada por contrato"
                    >
                        <span>+ Nueva Superficie</span>
                    </button>
                </div>
            </div>

            {/* Contract Chip: active surface */}
            {activeContract && (
                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-xl px-3 py-1.5">
                    <span className="text-base">{activeContract.icon}</span>
                    <div className="leading-tight">
                        <div className="text-[9px] uppercase font-bold tracking-wider text-[#5B8FB9]">Contrato activo</div>
                        <div className="text-xs font-bold text-white">
                            {activeContract.name}
                            {!fitsViewport && <span className="text-amber-400 ml-1">⚠</span>}
                        </div>
                    </div>
                </div>
            )}

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
                            {preset === 'desktop' && 'Escritorio'}
                            {preset === 'tablet' && 'Tablet'}
                            {preset === 'mobile' && 'Móvil'}
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

            {/* Right: View Mode Toggle + Copilot */}
            <div className="flex items-center gap-2">
                <button
                    onClick={() => toggleCopilotPanel()}
                    className={`px-3 py-1 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 border ${
                        isCopilotOpen
                            ? 'bg-[#36606F] text-white border-[#5B8FB9] font-semibold'
                            : 'bg-white/5 border-white/10 text-zinc-300 hover:text-white'
                    }`}
                    title="Abrir el Copiloto gobernado"
                >
                    {isGeneratingAI && (
                        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    ✨ Copiloto
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
                        Editar
                    </button>
                    <button
                        onClick={() => setViewMode('preview')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
                            viewMode === 'preview'
                                ? 'bg-[#36606F] text-white shadow-sm'
                                : 'text-zinc-400 hover:text-white'
                        }`}
                    >
                        Vista
                    </button>
                </div>
            </div>
        </header>
    );
}
