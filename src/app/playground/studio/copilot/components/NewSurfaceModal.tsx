'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../../store';
import { SurfaceType } from '../types';

const SURFACE_TYPES: { id: SurfaceType; name: string; icon: string }[] = [
    { id: 'pantalla', name: 'Pantalla Completa', icon: '💻' },
    { id: 'modal', name: 'Modal / Diálogo', icon: '🔲' },
    { id: 'formulario', name: 'Formulario', icon: '📝' },
    { id: 'tabla', name: 'Tabla de Datos', icon: '📊' },
    { id: 'kpis', name: 'Métricas / KPIs', icon: '📈' },
    { id: 'cabecera', name: 'Cabecera de Sección', icon: '▔' },
    { id: 'drawer', name: 'Drawer / Panel Lateral', icon: '📑' },
    { id: 'dashboard', name: 'Dashboard Completo', icon: '🎛️' },
];

const PRESET_PROMPTS = [
    "Diseña un modal elegante para visualizar el detalle de un ticket.",
    "Quiero un formulario extremadamente limpio pensado para dispositivo móvil.",
    "Haz una tabla inspirada en Linear pero adaptada al lenguaje visual de Marbella.",
    "Crea un dashboard de resumen de personal con alta legibilidad y calma visual.",
    "Cabecera monumental estilo Apple con indicadores de estado de turno."
];

export default function NewSurfaceModal() {
    const { isNewSurfaceModalOpen, closeNewSurfaceModal, addVariant, generateAIProposals, isGeneratingAI } = useStudioStore();

    const [mode, setMode] = useState<'manual' | 'ai'>('ai');
    const [surfaceType, setSurfaceType] = useState<SurfaceType>('modal');
    const [promptText, setPromptText] = useState('');
    const [variantCount, setVariantCount] = useState<number>(3);

    if (!isNewSurfaceModalOpen) return null;

    const handleCreate = () => {
        if (mode === 'manual') {
            addVariant(`Nueva ${surfaceType}`, 'control-panel');
            closeNewSurfaceModal();
        } else {
            const prompt = promptText.trim() || `Crear superficie ${surfaceType} limpia con tokens Marbella OS`;
            generateAIProposals(prompt, surfaceType, variantCount);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 select-none">
            <div className="bg-[#0e0e13] border border-white/15 rounded-3xl w-full max-w-xl shadow-2xl text-white overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/40">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#36606F] to-indigo-600 flex items-center justify-center font-bold text-sm shadow-md">
                            ✨
                        </div>
                        <div>
                            <h2 className="text-lg font-bold tracking-tight text-white">Nueva Superficie</h2>
                            <p className="text-xs text-zinc-400">Selecciona cómo deseas dar forma a tu diseño</p>
                        </div>
                    </div>
                    <button
                        onClick={closeNewSurfaceModal}
                        className="text-zinc-500 hover:text-white p-1 rounded-lg transition-colors text-sm"
                    >
                        ✕
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    {/* Step 1: Mode Selector (Manual vs AI) */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                            ¿Cómo quieres empezar?
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setMode('manual')}
                                className={`p-4 rounded-2xl border text-left transition-all ${
                                    mode === 'manual'
                                        ? 'bg-white/10 border-white/30 text-white shadow-md'
                                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <div className="font-bold text-sm mb-1 flex items-center gap-2">
                                    <span>○</span>
                                    <span>Diseño Manual (Vacío)</span>
                                </div>
                                <div className="text-xs text-zinc-400 leading-snug">
                                    Lienzo en blanco para construir desde cero elemento a elemento.
                                </div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setMode('ai')}
                                className={`p-4 rounded-2xl border text-left transition-all ${
                                    mode === 'ai'
                                        ? 'bg-gradient-to-br from-[#36606F]/40 to-indigo-900/40 border-[#5B8FB9] text-white shadow-md'
                                        : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                                }`}
                            >
                                <div className="font-bold text-sm mb-1 flex items-center gap-2 text-indigo-300">
                                    <span>✨</span>
                                    <span>Generado por IA (Copiloto)</span>
                                </div>
                                <div className="text-xs text-zinc-400 leading-snug">
                                    Propuestas completas 100% editables razonando bajo Marbella OS.
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Step 2: Surface Type */}
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                            Tipo de Superficie
                        </label>
                        <div className="grid grid-cols-4 gap-2">
                            {SURFACE_TYPES.map(st => (
                                <button
                                    key={st.id}
                                    type="button"
                                    onClick={() => setSurfaceType(st.id)}
                                    className={`p-2.5 rounded-xl border text-center transition-all ${
                                        surfaceType === st.id
                                            ? 'bg-[#36606F] border-[#5B8FB9] text-white font-bold shadow'
                                            : 'bg-white/5 border-white/10 text-zinc-400 hover:text-white hover:bg-white/10'
                                    }`}
                                >
                                    <div className="text-base mb-1">{st.icon}</div>
                                    <div className="text-[11px] truncate">{st.name}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 3: AI Prompt Input (If AI mode) */}
                    {mode === 'ai' && (
                        <div className="space-y-3">
                            <label className="block text-xs font-bold uppercase tracking-wider text-zinc-400">
                                Describe la propuesta que buscas
                            </label>

                            <textarea
                                value={promptText}
                                onChange={(e) => setPromptText(e.target.value)}
                                placeholder="Ej: Diseña un modal elegante para visualizar el detalle de un ticket con alta legibilidad..."
                                className="w-full bg-white/5 border border-white/15 rounded-xl p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#5B8FB9] h-20 resize-none"
                            />

                            {/* Prompt Presets Chips */}
                            <div className="flex flex-wrap gap-1.5 pt-1">
                                {PRESET_PROMPTS.slice(0, 3).map((preset, idx) => (
                                    <button
                                        key={idx}
                                        type="button"
                                        onClick={() => setPromptText(preset)}
                                        className="text-[10px] bg-white/5 hover:bg-white/15 text-zinc-300 px-2.5 py-1 rounded-lg border border-white/10 transition-colors text-left truncate max-w-xs"
                                    >
                                        💡 {preset}
                                    </button>
                                ))}
                            </div>

                            {/* Variant Quantity Selector */}
                            <div className="flex items-center justify-between pt-2">
                                <span className="text-xs text-zinc-400 font-medium">Cantidad de propuestas a generar:</span>
                                <div className="flex items-center gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                                    {[1, 3, 5].map(count => (
                                        <button
                                            key={count}
                                            type="button"
                                            onClick={() => setVariantCount(count)}
                                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                                                variantCount === count
                                                    ? 'bg-[#36606F] text-white shadow-sm'
                                                    : 'text-zinc-400 hover:text-white'
                                            }`}
                                        >
                                            {count} {count === 1 ? 'versión' : 'variantes'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="p-4 bg-black/40 border-t border-white/10 flex items-center justify-between">
                    <button
                        type="button"
                        onClick={closeNewSurfaceModal}
                        className="px-4 py-2 text-xs font-semibold text-zinc-400 hover:text-white transition-colors"
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        onClick={handleCreate}
                        disabled={isGeneratingAI}
                        className="px-6 py-2.5 bg-gradient-to-r from-[#36606F] to-indigo-600 hover:from-[#407080] hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                        {isGeneratingAI ? (
                            <span>Generando propuestas con IA...</span>
                        ) : mode === 'ai' ? (
                            <>
                                <span>Generar {variantCount} propuestas</span>
                                <span>✨</span>
                            </>
                        ) : (
                            <span>Crear lienzo en blanco</span>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
