'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../../store';
import { SURFACES, canSurfaceFitViewport } from '../../contracts';
import { SurfaceType, ViewportPreset } from '../../types';

const VIEWPORT_LABELS: Record<ViewportPreset, string> = {
    desktop: 'Escritorio',
    tablet: 'Tablet',
    mobile: 'Móvil',
};

export default function NewSurfaceModal() {
    const {
        isNewSurfaceModalOpen,
        closeNewSurfaceModal,
        generateAIProposals,
        isGeneratingAI,
    } = useStudioStore();

    const [surfaceType, setSurfaceType] = useState<SurfaceType>('pantalla');
    const [viewport, setViewport] = useState<ViewportPreset>('desktop');
    const [prompt, setPrompt] = useState('');
    const [count, setCount] = useState(3);

    if (!isNewSurfaceModalOpen) return null;

    const selectedSurface = SURFACES.find(s => s.type === surfaceType);
    const fitsViewport = canSurfaceFitViewport(surfaceType, viewport);

    const handleGenerate = () => {
        if (!surfaceType) return;
        generateAIProposals(prompt, surfaceType, viewport, count);
        closeNewSurfaceModal();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
            <div className="bg-[#0c0c10] border border-white/15 rounded-3xl w-full max-w-3xl shadow-2xl text-white flex flex-col max-h-[88vh] overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-white">Nueva Superficie Gobernada</h2>
                        <p className="text-xs text-zinc-400 mt-0.5">
                            Elige el contrato de superficie y viewport. Las propuestas que lo violen no se muestran.
                        </p>
                    </div>
                    <button
                        onClick={closeNewSurfaceModal}
                        className="text-zinc-500 hover:text-white p-1.5 rounded-lg transition-colors text-sm"
                    >
                        ✕
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Viewport selector */}
                    <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9] mb-2">
                            Viewport de diseño
                        </label>
                        <div className="flex gap-2">
                            {(Object.keys(VIEWPORT_LABELS) as ViewportPreset[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setViewport(p)}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                        viewport === p
                                            ? 'bg-[#36606F] border-[#5B8FB9] text-white'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {VIEWPORT_LABELS[p]}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Surface contract grid */}
                    <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9] mb-2">
                            Contrato de superficie
                        </label>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                            {SURFACES.map(s => {
                                const fits = canSurfaceFitViewport(s.type, viewport);
                                const active = surfaceType === s.type;
                                return (
                                    <button
                                        key={s.type}
                                        disabled={!fits}
                                        onClick={() => setSurfaceType(s.type)}
                                        className={`text-left p-3 rounded-2xl border transition-all ${
                                            active
                                                ? 'bg-[#36606F]/30 border-[#5B8FB9] text-white'
                                                : fits
                                                ? 'bg-white/5 border-white/10 text-zinc-300 hover:bg-white/10'
                                                : 'bg-white/[0.02] border-white/5 text-zinc-600 cursor-not-allowed'
                                        }`}
                                        title={fits ? s.description : `${s.name} requiere ${s.minViewport} como mínimo`}
                                    >
                                        <div className="text-base">{s.icon}</div>
                                        <div className="text-xs font-bold mt-1">{s.name}</div>
                                        <div className="text-[10px] leading-tight mt-0.5 text-zinc-400">
                                            {fits ? s.description : `No cabe en ${VIEWPORT_LABELS[viewport]}`}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                        {selectedSurface && !fitsViewport && (
                            <p className="text-[11px] text-amber-400 mt-2">
                                {selectedSurface.name} necesita al menos viewport {selectedSurface.minViewport}. Cambia el viewport.
                            </p>
                        )}
                    </div>

                    {/* Prompt */}
                    <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9] mb-2">
                            Qué quieres en esta superficie
                        </label>
                        <textarea
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder={`Ej: resumen de turnos con KPIs de cobertura y listado del equipo`}
                            className="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3 text-xs text-white focus:outline-none focus:border-[#5B8FB9] h-20 resize-none"
                        />
                    </div>

                    {/* Proposal count */}
                    <div>
                        <label className="block text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9] mb-2">
                            Número de propuestas
                        </label>
                        <div className="flex gap-2">
                            {[1, 3, 5].map(n => (
                                <button
                                    key={n}
                                    onClick={() => setCount(n)}
                                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all ${
                                        count === n
                                            ? 'bg-[#36606F] border-[#5B8FB9] text-white'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-5 bg-black/40 border-t border-white/10 flex items-center justify-between gap-4">
                    <div className="text-[11px] text-zinc-500 leading-tight">
                        El Copiloto solo genera dentro del contrato de {selectedSurface?.name} en {VIEWPORT_LABELS[viewport]}.
                    </div>
                    <button
                        onClick={handleGenerate}
                        disabled={isGeneratingAI || !fitsViewport}
                        className="px-5 py-2.5 bg-[#36606F] hover:bg-[#407080] border border-[#5B8FB9] rounded-xl text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        {isGeneratingAI ? 'Generando...' : `✨ Generar ${count} propuesta${count > 1 ? 's' : ''}`}
                    </button>
                </div>
            </div>
        </div>
    );
}
