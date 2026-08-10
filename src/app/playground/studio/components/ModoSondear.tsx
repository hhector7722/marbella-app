'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { ScreenView } from './ScreenView';
import { BarraIntencion, SelectorIntensidad } from './BarraIntencion';
import { SCREEN_REGISTRY } from '../screens/real';
import { MOVIDAS_CATALOGO, MOVIDA_BY_ID } from '../movidas';
import { Recipe, Intensidad, MovidaId } from '../types';

// ============================================================
// MODO SONDEAR — recetas desechables en un sandbox con
// escritura bloqueada. El laboratorio jamás toca datos reales.
// ============================================================

export function ModoSondear() {
    const activeScreen = useStudioStore(s => s.activeScreenKey);
    const setActiveScreen = useStudioStore(s => s.setActiveScreen);
    const viewport = useStudioStore(s => s.viewport);
    const setViewport = useStudioStore(s => s.setViewport);
    const saveSondaNota = useStudioStore(s => s.saveSondaNota);
    const addHipotesis = useStudioStore(s => s.addHipotesis);
    const setActiveHipotesis = useStudioStore(s => s.setActiveHipotesis);

    const [recipe, setRecipe] = useState<Recipe>({});
    const [nota, setNota] = useState('');

    const setMovida = (id: MovidaId, intensidad: Intensidad) =>
        setRecipe(prev => ({ ...prev, [id]: intensidad }));

    const limpiar = () => {
        setRecipe({});
    };

    const aplicarFrase = (r: Recipe) => {
        setRecipe(prev => ({ ...prev, ...r }));
    };

    const guardarNota = () => {
        if (!nota.trim()) return;
        saveSondaNota(activeScreen, recipe, nota.trim());
        setNota('');
    };

    const guardarComoHipotesis = () => {
        const movidas = (Object.keys(recipe) as MovidaId[]).filter(k => recipe[k] !== 'nada');
        if (movidas.length === 0) return;
        const id = addHipotesis(
            `Sonda en ${SCREEN_REGISTRY[activeScreen].title}: ${Object.entries(recipe)
                .filter(([, v]) => v !== 'nada')
                .map(([k, v]) => `${MOVIDA_BY_ID[k as MovidaId].nombre} ${v}`)
                .join(', ')}`,
            movidas,
            { pantallas: [activeScreen], notas: nota.trim() }
        );
        setActiveHipotesis(id);
    };

    const frameWidth =
        viewport === 'mobile' ? 'w-[390px]' : viewport === 'tablet' ? 'w-full max-w-[768px]' : 'w-full';

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 px-4 py-2">
                <div className="flex items-center gap-2">
                    <span className="rounded-lg bg-orange-500/15 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-orange-400">
                        Sandbox — escritura bloqueada
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Recetas desechables</span>
                </div>
                <div className="flex gap-1.5">
                    <button onClick={limpiar} style={{ minHeight: 48 }} className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300">
                        Limpiar
                    </button>
                    <button onClick={guardarComoHipotesis} style={{ minHeight: 48 }} className="rounded-xl bg-[#36606F] px-3 text-[9px] font-black uppercase tracking-widest text-white">
                        Guardar como hipótesis
                    </button>
                </div>
            </div>

            <div className="flex min-h-0 flex-1">
                {/* La pantalla, navegable */}
                <div className="flex min-h-0 flex-1 flex-col items-center overflow-auto bg-zinc-950 p-4">
                    <div className="mb-2 flex items-center gap-2 self-start">
                        <select
                            value={activeScreen}
                            onChange={e => setActiveScreen(e.target.value as typeof activeScreen)}
                            className="min-h-12 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-black text-zinc-200"
                        >
                            {Object.entries(SCREEN_REGISTRY).map(([k, v]) => (
                                <option key={k} value={k}>{v.title}</option>
                            ))}
                        </select>
                        <div className="flex gap-1">
                            {(['mobile', 'tablet', 'desktop'] as const).map(v => (
                                <button
                                    key={v}
                                    onClick={() => setViewport(v)}
                                    style={{ minHeight: 48 }}
                                    className={`rounded-xl px-2.5 text-[9px] font-black uppercase tracking-widest ${viewport === v ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                >
                                    {v}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={`flex-1 overflow-hidden rounded-[2.5rem] ${frameWidth}`} style={{ height: 'calc(100% - 56px)' }}>
                        <ScreenView screenKey={activeScreen} recipe={recipe} />
                    </div>
                </div>

                {/* Panel de movidas */}
                <div className="hidden w-80 shrink-0 flex-col overflow-auto border-l border-zinc-800/70 bg-zinc-950 md:flex">
                    <div className="border-b border-zinc-800/70 px-4 py-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Receta</div>
                        <div className="mt-1 text-[11px] text-zinc-400">Intensidad ordinal, nunca porcentajes</div>
                    </div>

                    <div className="flex flex-col gap-3 overflow-auto p-3">
                        {MOVIDAS_CATALOGO.map(m => (
                            <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-zinc-200">{m.nombre}</span>
                                    {recipe[m.id] && recipe[m.id] !== 'nada' && (
                                        <span className="rounded-md bg-[#36606F]/20 px-1.5 py-0.5 text-[8px] font-black uppercase text-[#7FB0C0]">
                                            {recipe[m.id]}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2">
                                    <SelectorIntensidad value={recipe[m.id] ?? 'nada'} onChange={v => setMovida(m.id, v)} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col gap-2 border-t border-zinc-800 p-3">
                        <textarea
                            value={nota}
                            onChange={e => setNota(e.target.value)}
                            placeholder="Nota de sonda: ¿qué observas en esta receta?"
                            className="min-h-20 resize-none rounded-xl border border-zinc-800 bg-zinc-900 p-2.5 text-xs font-bold text-zinc-200 placeholder:text-zinc-600 focus:outline-none"
                        />
                        <button
                            onClick={guardarNota}
                            style={{ minHeight: 48 }}
                            className="rounded-xl bg-emerald-500 text-[9px] font-black uppercase tracking-widest text-white"
                        >
                            Guardar nota de sonda
                        </button>
                    </div>
                </div>
            </div>

            <div className="border-t border-zinc-800/70 bg-zinc-950 px-4 py-2">
                <BarraIntencion onAplicar={aplicarFrase} placeholder="«Que la navegación desaparezca casi por completo»" />
            </div>
        </div>
    );
}
