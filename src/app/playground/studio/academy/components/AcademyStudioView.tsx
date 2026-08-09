'use client';

import React, { useState } from 'react';
import { DESIGN_BENCHMARKS } from '../data';
import { InteractiveControlState } from '../types';
import { useStudioStore } from '../../store';

export default function AcademyStudioView() {
    const { selectedBenchmarkId, setSelectedBenchmarkId, setActiveStudioTab, applyBenchmarkToMarbella } = useStudioStore();

    const benchmark = DESIGN_BENCHMARKS.find(b => b.id === selectedBenchmarkId) || DESIGN_BENCHMARKS[0];

    const [controls, setControls] = useState<InteractiveControlState>(benchmark.defaultControls);

    const handleApplyToMarbella = () => {
        applyBenchmarkToMarbella(benchmark.id);
    };

    // Calculate dynamic styles based on live experimentation controls
    const isCompact = controls.density === 'compact';
    const isSpacious = controls.density === 'spacious';
    const isHighContrast = controls.contrast === 'high';
    const isLowContrast = controls.contrast === 'low';
    const isEmphasized = controls.hierarchy === 'emphasized';

    return (
        <div className="flex-1 flex bg-[#070709] text-white overflow-hidden">
            {/* Left Pane: Principles Breakdown & Why it works */}
            <aside className="w-80 border-r border-white/10 bg-[#0a0a0d] flex flex-col shrink-0 overflow-y-auto p-5 select-none">
                <button
                    onClick={() => setActiveStudioTab('academy')}
                    className="text-xs text-zinc-400 hover:text-white mb-4 flex items-center gap-1.5 transition-colors"
                >
                    ← Volver a Galería
                </button>

                <div className="flex items-center gap-2 mb-3">
                    <span 
                        className="w-3 h-3 rounded-full shadow-sm" 
                        style={{ backgroundColor: benchmark.brandColor }} 
                    />
                    <span className="text-xs font-bold font-mono text-zinc-200 uppercase">
                        {benchmark.product} • {benchmark.category}
                    </span>
                </div>

                <h2 className="text-xl font-bold tracking-tight text-white mb-2">
                    {benchmark.title}
                </h2>
                <p className="text-xs text-zinc-400 leading-relaxed mb-6">
                    {benchmark.overview}
                </p>

                {/* Principles Accordion / Breakdown */}
                <div className="space-y-4 mb-8">
                    <div className="text-[10px] uppercase font-bold tracking-widest text-[#5B8FB9]">
                        Decisiones Clave & Por qué funciona
                    </div>

                    {benchmark.principles.map((principle, idx) => (
                        <div key={idx} className="p-3.5 bg-white/5 rounded-xl border border-white/10 space-y-1.5">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-zinc-200">{principle.title}</span>
                                <span className="text-[9px] font-mono uppercase bg-white/10 px-1.5 py-0.5 rounded text-zinc-400">
                                    {principle.impact}
                                </span>
                            </div>
                            <p className="text-[11px] text-zinc-400 leading-relaxed">
                                {principle.description}
                            </p>
                        </div>
                    ))}
                </div>

                {/* Translation to Marbella OS Box */}
                <div className="mt-auto pt-6 border-t border-white/10 space-y-4">
                    <div className="p-4 bg-[#36606F]/20 border border-[#36606F]/50 rounded-2xl space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-white">
                            <span className="w-2 h-2 rounded-full bg-[#5B8FB9]" />
                            <span>Translación a Marbella OS</span>
                        </div>
                        <p className="text-xs text-zinc-300 leading-relaxed">
                            {benchmark.marbellaTranslation.philosophyTitle}
                        </p>
                        <button
                            onClick={handleApplyToMarbella}
                            className="w-full py-2.5 bg-[#36606F] hover:bg-[#407080] text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <span>Aplicar esta filosofía a Marbella</span>
                            <span>⚡</span>
                        </button>
                    </div>
                </div>
            </aside>

            {/* Center Canvas Pane: Interactive Pattern Playground */}
            <main className="flex-1 bg-[#050507] p-8 overflow-y-auto flex flex-col items-center justify-center relative">
                <div className="w-full max-w-4xl">
                    {/* Live Canvas Banner */}
                    <div className="flex items-center justify-between mb-4">
                        <div className="text-xs font-mono text-zinc-400 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Reconstrucción Funcional Interactiva
                        </div>
                        <div className="flex items-center gap-2">
                            <select
                                value={selectedBenchmarkId}
                                onChange={(e) => setSelectedBenchmarkId(e.target.value)}
                                className="bg-white/5 border border-white/10 rounded-lg px-3 py-1 text-xs text-zinc-300 font-medium focus:outline-none"
                            >
                                {DESIGN_BENCHMARKS.map(b => (
                                    <option key={b.id} value={b.id} className="bg-[#121214]">
                                        {b.product}: {b.title}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* LIVE PATTERN RECONSTRUCTION CANVAS */}
                    <div className={`transition-all duration-300 rounded-2xl shadow-2xl border ${
                        isHighContrast ? 'bg-black border-zinc-700' : isLowContrast ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-950 border-zinc-800'
                    }`}>
                        {/* LINEAR PATTERN */}
                        {benchmark.patternType === 'linear-table' && (
                            <div className={`${isCompact ? 'p-4' : isSpacious ? 'p-8' : 'p-6'}`}>
                                <div className="flex justify-between items-center mb-6 pb-4 border-b border-zinc-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-7 h-7 rounded-lg bg-[#5E6AD2]/20 text-[#5E6AD2] border border-[#5E6AD2]/40 flex items-center justify-center font-bold text-xs">
                                            LIN
                                        </div>
                                        <h3 className={`font-bold ${isEmphasized ? 'text-lg text-white' : 'text-sm text-zinc-200'}`}>
                                            Issues / Tareas de Equipo
                                        </h3>
                                    </div>
                                    <span className="text-xs text-zinc-400 font-mono">12 ítems • Foco activo</span>
                                </div>

                                <div className="space-y-1.5 font-sans">
                                    {[
                                        { id: 'MAR-102', title: 'Optimizar tiempos de carga en pantalla de cocina', state: 'En Progreso', priority: 'Urgent', date: '2 min' },
                                        { id: 'MAR-103', title: 'Refactorizar cálculo de horas extraordinarias', state: 'Bloqueado', priority: 'High', date: '1 hora' },
                                        { id: 'MAR-104', title: 'Diseño de liquidación mensual de personal', state: 'Completado', priority: 'Medium', date: 'Ayer' },
                                        { id: 'MAR-105', title: 'Normalización de fotos de catálogo', state: 'En Progreso', priority: 'Low', date: '3 días' }
                                    ].map((row, i) => (
                                        <div 
                                            key={i} 
                                            className={`flex items-center justify-between rounded-lg border transition-all cursor-pointer ${
                                                isCompact ? 'px-3 py-1.5 text-xs' : isSpacious ? 'px-5 py-3 text-sm' : 'px-4 py-2 text-xs'
                                            } ${i === 0 ? 'bg-[#5E6AD2]/10 border-[#5E6AD2]/40 text-white' : 'bg-white/[0.02] border-transparent hover:bg-white/5 text-zinc-300'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[10px] text-zinc-500 font-bold">{row.id}</span>
                                                <span className="font-medium text-zinc-200">{row.title}</span>
                                            </div>

                                            <div className="flex items-center gap-3">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                    row.state === 'En Progreso' ? 'bg-amber-500/20 text-amber-300' :
                                                    row.state === 'Bloqueado' ? 'bg-rose-500/20 text-rose-300' :
                                                    'bg-emerald-500/20 text-emerald-300'
                                                }`}>
                                                    {row.state}
                                                </span>
                                                <span className="text-[10px] text-zinc-400 font-mono">{row.date}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* STRIPE PATTERN */}
                        {benchmark.patternType === 'stripe-dashboard' && (
                            <div className={`${isCompact ? 'p-4' : isSpacious ? 'p-8' : 'p-6'}`}>
                                <div className="mb-6 flex justify-between items-center">
                                    <div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-[#635BFF]">Stripe Financial Engine</span>
                                        <h3 className="text-2xl font-extrabold text-white tracking-tight">Resumen Ejecutivo de Facturación</h3>
                                    </div>
                                    <button className="px-3 py-1.5 bg-[#635BFF] text-white font-semibold text-xs rounded-xl shadow-md">
                                        Exportar Informe
                                    </button>
                                </div>

                                <div className="grid grid-cols-3 gap-4 mb-6">
                                    {[
                                        { label: 'Volumen Bruto Hoy', val: '€14.280,50', detail: '+12% vs ayer' },
                                        { label: 'Coste Laboral Estimado', val: '€2.140,00', detail: '15.0% sobre ventas' },
                                        { label: 'Margen Operativo', val: '85.0%', detail: 'Saludable' }
                                    ].map((kpi, i) => (
                                        <div key={i} className="bg-zinc-900/80 p-4 rounded-xl border border-zinc-800 shadow-sm">
                                            <div className="text-xs text-zinc-400 font-medium mb-1">{kpi.label}</div>
                                            <div className="text-2xl font-extrabold text-white">{kpi.val}</div>
                                            <div className="text-[11px] text-emerald-400 mt-2 font-mono">{kpi.detail}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* VERCEL / APPLE / DEFAULT PATTERN */}
                        {benchmark.patternType !== 'linear-table' && benchmark.patternType !== 'stripe-dashboard' && (
                            <div className="p-8 text-center space-y-4">
                                <div className="w-12 h-12 rounded-2xl bg-white/10 text-white flex items-center justify-center mx-auto text-xl font-bold">
                                    {benchmark.product[0]}
                                </div>
                                <h3 className="text-xl font-bold text-white">{benchmark.title}</h3>
                                <p className="text-xs text-zinc-400 max-w-md mx-auto">{benchmark.overview}</p>
                            </div>
                        )}
                    </div>
                </div>
            </main>

            {/* Right Pane: Live Experimentation Controls */}
            <aside className="w-72 border-l border-white/10 bg-[#0a0a0d] flex flex-col shrink-0 p-5 select-none overflow-y-auto">
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-300 mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span>Experimentación en Vivo</span>
                </div>

                <div className="space-y-6 text-xs">
                    {/* Density Control */}
                    <div>
                        <label className="block text-zinc-400 font-medium mb-2">Densidad Visual</label>
                        <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                            {(['compact', 'standard', 'spacious'] as const).map(d => (
                                <button
                                    key={d}
                                    onClick={() => setControls({ ...controls, density: d })}
                                    className={`py-1.5 rounded-lg font-semibold capitalize transition-all ${
                                        controls.density === d ? 'bg-[#36606F] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {d === 'compact' ? 'Alta' : d === 'standard' ? 'Media' : 'Baja'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Contrast Control */}
                    <div>
                        <label className="block text-zinc-400 font-medium mb-2">Contraste de Superficies</label>
                        <div className="grid grid-cols-3 gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                            {(['low', 'balanced', 'high'] as const).map(c => (
                                <button
                                    key={c}
                                    onClick={() => setControls({ ...controls, contrast: c })}
                                    className={`py-1.5 rounded-lg font-semibold capitalize transition-all ${
                                        controls.contrast === c ? 'bg-[#36606F] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {c === 'low' ? 'Bajo' : c === 'balanced' ? 'Medio' : 'Alto'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Hierarchy Control */}
                    <div>
                        <label className="block text-zinc-400 font-medium mb-2">Jerarquía Tipográfica</label>
                        <div className="grid grid-cols-2 gap-1 bg-white/5 p-1 rounded-xl border border-white/10">
                            {(['subtle', 'emphasized'] as const).map(h => (
                                <button
                                    key={h}
                                    onClick={() => setControls({ ...controls, hierarchy: h })}
                                    className={`py-1.5 rounded-lg font-semibold capitalize transition-all ${
                                        controls.hierarchy === h ? 'bg-[#36606F] text-white shadow-sm' : 'text-zinc-400 hover:text-white'
                                    }`}
                                >
                                    {h === 'subtle' ? 'Sutil' : 'Destacada'}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-white/10 text-[11px] text-zinc-400 leading-relaxed">
                    💡 <strong>Observación táctil:</strong> Ajusta los parámetros y nota cómo varía la velocidad de lectura y la carga cognitiva percibida.
                </div>
            </aside>
        </div>
    );
}
