'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { DesignLevel } from '../types';

const LEVELS: { level: DesignLevel; label: string; desc: string; icon: string }[] = [
    { level: 1, label: 'Intención', desc: 'Propósito Semántico', icon: '🎯' },
    { level: 2, label: 'Composición', desc: 'Arquitectura Espacial', icon: '📐' },
    { level: 3, label: 'Componentes', desc: 'Topología de Piezas', icon: '🧩' },
    { level: 4, label: 'Propiedades', desc: 'Comportamiento Visual', icon: '🎛️' },
    { level: 5, label: 'Fundamentos', desc: 'Evolucionar Marbella OS', icon: '🧬' },
];

export default function StudioLevelBar() {
    const { 
        currentLevel, 
        setCurrentLevel, 
        zoomInLevel, 
        zoomOutLevel, 
        focusStack, 
        popToFocusIndex, 
        focusOutObject 
    } = useStudioStore();

    return (
        <div className="h-11 bg-[#08080b] border-b border-white/10 px-4 flex items-center justify-between text-white shrink-0 select-none z-20">
            {/* Left: Recursive Object Depth Focus Breadcrumb Stack */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[10px] uppercase font-extrabold tracking-widest text-[#5B8FB9] mr-1 shrink-0 flex items-center gap-1">
                    <span>🔍 Enfoque:</span>
                </span>

                {focusStack.map((node, index) => {
                    const isCurrentFocus = index === focusStack.length - 1;

                    return (
                        <React.Fragment key={`${node.id}-${index}`}>
                            <button
                                onClick={() => popToFocusIndex(index)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                                    isCurrentFocus
                                        ? 'bg-[#36606F] text-white shadow-md ring-1 ring-[#5B8FB9]'
                                        : 'bg-white/5 hover:bg-white/15 text-zinc-300'
                                }`}
                                title={`Volver al objeto: ${node.name}`}
                            >
                                <span className="text-zinc-400 font-mono text-[10px]">
                                    {node.type === 'pantalla' ? '💻' : '📦'}
                                </span>
                                <span>{node.name}</span>
                            </button>
                            {index < focusStack.length - 1 && (
                                <span className="text-zinc-500 font-mono text-xs font-bold shrink-0">›</span>
                            )}
                        </React.Fragment>
                    );
                })}

                {focusStack.length > 1 && (
                    <button
                        onClick={focusOutObject}
                        className="ml-2 px-2 py-0.5 bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white rounded text-[10px] font-bold uppercase transition-colors"
                        title="Salir al nivel de objeto superior"
                    >
                        ← Salir de Objeto
                    </button>
                )}
            </div>

            {/* Right: 5 Facets Zoom Level Breadcrumb */}
            <div className="flex items-center gap-1.5 pl-4 border-l border-white/10">
                <span className="text-[10px] uppercase font-bold text-zinc-500 mr-1 shrink-0">Facetas:</span>
                {LEVELS.map((item) => {
                    const isActive = currentLevel === item.level;
                    if (item.level === 5 && !isActive) {
                        // Level 5 (Fundamentos/Tokens) remains hidden unless active or explicitly selected
                        return (
                            <button
                                key={item.level}
                                onClick={() => setCurrentLevel(5)}
                                className="px-2 py-0.5 text-[10px] text-purple-400/80 hover:text-purple-300 bg-purple-950/30 hover:bg-purple-900/40 rounded border border-purple-800/40 font-mono transition-colors"
                                title="Evolucionar Sistema Marbella OS"
                            >
                                🧬 Evolucionar OS
                            </button>
                        );
                    }

                    return (
                        <button
                            key={item.level}
                            onClick={() => setCurrentLevel(item.level)}
                            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 shrink-0 ${
                                isActive
                                    ? item.level === 5
                                        ? 'bg-purple-700 text-white font-bold ring-1 ring-purple-400'
                                        : 'bg-[#1F5FAF] text-white font-bold ring-1 ring-cyan-400'
                                    : 'text-zinc-400 hover:text-white hover:bg-white/5'
                            }`}
                            title={item.desc}
                        >
                            <span className="text-[11px]">{item.icon}</span>
                            <span>{item.label}</span>
                        </button>
                    );
                })}

                <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-white/10">
                    <button
                        onClick={zoomOutLevel}
                        disabled={currentLevel <= 1}
                        className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-xs text-zinc-300 font-mono"
                        title="Nivel de faceta anterior"
                    >
                        ▲
                    </button>
                    <button
                        onClick={zoomInLevel}
                        disabled={currentLevel >= 5}
                        className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded text-xs text-zinc-300 font-mono"
                        title="Siguiente nivel de faceta"
                    >
                        ▼
                    </button>
                </div>
            </div>
        </div>
    );
}
