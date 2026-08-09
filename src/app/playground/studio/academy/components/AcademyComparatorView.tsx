'use client';

import React from 'react';
import { DESIGN_BENCHMARKS } from '../data';
import { useStudioStore } from '../../store';

export default function AcademyComparatorView() {
    const { comparatorLeftId, comparatorRightId, setComparatorIds, applyBenchmarkToMarbella } = useStudioStore();

    const leftBenchmark = DESIGN_BENCHMARKS.find(b => b.id === comparatorLeftId) || DESIGN_BENCHMARKS[0];
    const rightBenchmark = DESIGN_BENCHMARKS.find(b => b.id === comparatorRightId) || DESIGN_BENCHMARKS[1];

    return (
        <div className="flex-1 bg-[#050507] text-white flex flex-col overflow-hidden">
            {/* Comparator Header Banner */}
            <div className="h-14 bg-[#0a0a0d] border-b border-white/10 px-6 flex items-center justify-between shrink-0 select-none">
                <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-purple-500 shadow-md" />
                    <h2 className="text-sm font-bold tracking-tight text-zinc-100">
                        Comparador de Patrones Lado a Lado
                    </h2>
                    <span className="text-[10px] text-zinc-400 font-mono bg-white/5 px-2 py-0.5 rounded">
                        Entrenamiento Visual
                    </span>
                </div>
            </div>

            {/* Split Screen Comparator Grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-white/10 overflow-hidden">
                {/* Left Pattern Pane */}
                <div className="flex flex-col overflow-y-auto p-6 bg-[#070709]">
                    <div className="flex justify-between items-center mb-4">
                        <select
                            value={leftBenchmark.id}
                            onChange={(e) => setComparatorIds(e.target.value, rightBenchmark.id)}
                            className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                        >
                            {DESIGN_BENCHMARKS.map(b => (
                                <option key={`left-${b.id}`} value={b.id} className="bg-[#121214]">
                                    {b.product}: {b.title}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={() => applyBenchmarkToMarbella(leftBenchmark.id)}
                            className="px-3 py-1 bg-[#36606F] hover:bg-[#407080] text-white text-xs font-semibold rounded-lg shadow transition-all"
                        >
                            Aplicar filosofía {leftBenchmark.product}
                        </button>
                    </div>

                    <div className="p-4 bg-[#0d0d12] border border-white/10 rounded-2xl mb-6">
                        <h3 className="text-lg font-bold text-white mb-1">{leftBenchmark.title}</h3>
                        <p className="text-xs text-zinc-400 mb-4">{leftBenchmark.tagline}</p>
                        
                        <div className="space-y-2 text-xs">
                            {leftBenchmark.principles.map((p, i) => (
                                <div key={i} className="flex items-start gap-2 text-zinc-300">
                                    <span className="text-indigo-400 font-bold">•</span>
                                    <span><strong>{p.title}:</strong> {p.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right Pattern Pane */}
                <div className="flex flex-col overflow-y-auto p-6 bg-[#070709]">
                    <div className="flex justify-between items-center mb-4">
                        <select
                            value={rightBenchmark.id}
                            onChange={(e) => setComparatorIds(leftBenchmark.id, e.target.value)}
                            className="bg-white/10 border border-white/15 rounded-lg px-3 py-1.5 text-xs text-white font-bold focus:outline-none"
                        >
                            {DESIGN_BENCHMARKS.map(b => (
                                <option key={`right-${b.id}`} value={b.id} className="bg-[#121214]">
                                    {b.product}: {b.title}
                                </option>
                            ))}
                        </select>

                        <button
                            onClick={() => applyBenchmarkToMarbella(rightBenchmark.id)}
                            className="px-3 py-1 bg-[#36606F] hover:bg-[#407080] text-white text-xs font-semibold rounded-lg shadow transition-all"
                        >
                            Aplicar filosofía {rightBenchmark.product}
                        </button>
                    </div>

                    <div className="p-4 bg-[#0d0d12] border border-white/10 rounded-2xl mb-6">
                        <h3 className="text-lg font-bold text-white mb-1">{rightBenchmark.title}</h3>
                        <p className="text-xs text-zinc-400 mb-4">{rightBenchmark.tagline}</p>
                        
                        <div className="space-y-2 text-xs">
                            {rightBenchmark.principles.map((p, i) => (
                                <div key={i} className="flex items-start gap-2 text-zinc-300">
                                    <span className="text-[#635BFF] font-bold">•</span>
                                    <span><strong>{p.title}:</strong> {p.description}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
