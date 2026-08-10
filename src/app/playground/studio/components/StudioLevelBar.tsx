'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { DesignLevel } from '../types';

const LEVELS: { level: DesignLevel; label: string; desc: string; icon: string }[] = [
    { level: 1, label: 'Nivel 1: Intención', desc: 'Propósito Semántico', icon: '🎯' },
    { level: 2, label: 'Nivel 2: Composición', desc: 'Arquitectura Espacial', icon: '📐' },
    { level: 3, label: 'Nivel 3: Componentes', desc: 'Topología de Piezas', icon: '🧩' },
    { level: 4, label: 'Nivel 4: Propiedades', desc: 'Comportamiento Visual', icon: '🎛️' },
    { level: 5, label: 'Nivel 5: Tokens OS', desc: 'Gobernanza del Sistema', icon: '🧬' },
];

export default function StudioLevelBar() {
    const { currentLevel, setCurrentLevel, zoomInLevel, zoomOutLevel } = useStudioStore();

    return (
        <div className="h-10 bg-[#09090c] border-b border-white/10 px-4 flex items-center justify-between text-white shrink-0 select-none z-20">
            {/* Left: Depth Indicator Breadcrumb */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
                <span className="text-[10px] uppercase font-bold tracking-widest text-zinc-500 mr-1 shrink-0">
                    Zoom de Profundidad:
                </span>

                {LEVELS.map((item) => {
                    const isActive = currentLevel === item.level;
                    const isPassed = currentLevel >= item.level;

                    return (
                        <React.Fragment key={item.level}>
                            <button
                                onClick={() => setCurrentLevel(item.level)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 shrink-0 ${
                                    isActive
                                        ? 'bg-[#36606F] text-white shadow-md ring-1 ring-[#5B8FB9]'
                                        : isPassed
                                        ? 'bg-white/10 text-zinc-200 hover:bg-white/15'
                                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/5'
                                }`}
                                title={item.desc}
                            >
                                <span className="text-[11px]">{item.icon}</span>
                                <span>{item.label}</span>
                            </button>
                            {item.level < 5 && (
                                <span className="text-zinc-600 text-xs font-mono font-bold shrink-0">›</span>
                            )}
                        </React.Fragment>
                    );
                })}
            </div>

            {/* Right: Natural Level Navigation (Zoom in / Zoom out) */}
            <div className="flex items-center gap-1">
                <button
                    onClick={zoomOutLevel}
                    disabled={currentLevel <= 1}
                    className="px-2 py-1 bg-white/5 hover:bg-white/10 disabled:opacity-30 rounded-lg text-xs text-zinc-300 transition-colors font-mono flex items-center gap-1"
                    title="Subir nivel de abstracción (Menos detalle)"
                >
                    <span>▲</span>
                    <span className="text-[10px]">Elevación</span>
                </button>
                <button
                    onClick={zoomInLevel}
                    disabled={currentLevel >= 5}
                    className="px-2 py-1 bg-[#36606F]/40 hover:bg-[#36606F] disabled:opacity-30 border border-[#36606F] rounded-lg text-xs text-white transition-colors font-mono flex items-center gap-1 font-bold"
                    title="Profundizar nivel de abstracción (Más detalle)"
                >
                    <span className="text-[10px]">Profundizar</span>
                    <span>▼</span>
                </button>
            </div>
        </div>
    );
}
