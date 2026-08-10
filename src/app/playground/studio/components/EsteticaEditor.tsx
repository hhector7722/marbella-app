'use client';

import React from 'react';
import { BarraIntencion } from './BarraIntencion';
import { MOVIDAS_CATALOGO } from '../movidas';
import { REFERENCIAS } from '../referencias';
import type { Estetica, Intensidad, MovidaId, Recipe } from '../types';

const INTENSIDADES: Intensidad[] = ['nada', 'sutil', 'moderado', 'fuerte'];

export function EsteticaEditor({
    estetica,
    esteticas,
    recipe,
    viewport,
    onRecipeChange,
    onSelect,
    onViewportChange,
    onSave,
    onDuplicate,
    onRename,
    onDelete,
    onReference,
    onSecondary,
}: {
    estetica: Estetica;
    esteticas: Estetica[];
    recipe: Recipe;
    viewport: 'mobile' | 'tablet' | 'desktop';
    onRecipeChange: (recipe: Recipe) => void;
    onSelect: (id: string) => void;
    onViewportChange: (viewport: 'mobile' | 'tablet' | 'desktop') => void;
    onSave: () => void;
    onDuplicate: () => void;
    onRename: (name: string) => void;
    onDelete: () => void;
    onReference: (referenceId: string) => void;
    onSecondary: (view: 'comparar' | 'contacto' | 'lenguaje' | 'absorber') => void;
}) {
    const changeMove = (id: MovidaId, intensity: Intensidad) => {
        onRecipeChange({ ...recipe, [id]: intensity });
    };

    return (
        <aside className="flex max-h-[48vh] min-h-0 w-full shrink-0 flex-col border-b border-zinc-800 bg-zinc-950 lg:max-h-none lg:w-[360px] lg:border-b-0 lg:border-r">
            <div className="border-b border-zinc-800 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Editor de estética</span>
                    <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-300">Live</span>
                </div>
                <input
                    value={estetica.name}
                    disabled={Boolean(estetica.isOriginal)}
                    onChange={event => onRename(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base font-black text-white outline-none focus:border-[#36606F] disabled:text-zinc-400"
                    aria-label="Nombre de la estética"
                />
                <select
                    value={estetica.id}
                    onChange={event => onSelect(event.target.value)}
                    className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base font-bold text-zinc-200"
                    aria-label="Estética activa"
                >
                    {esteticas.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
                </select>
                <div className="mt-2 flex gap-2">
                    <button onClick={onSave} style={{ minHeight: 48 }} className="flex-1 rounded-xl bg-[#36606F] text-[9px] font-black uppercase tracking-widest text-white">
                        {estetica.isOriginal ? 'Guardar como nueva' : 'Guardar'}
                    </button>
                    <button onClick={onDuplicate} style={{ minHeight: 48 }} className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300">
                        Duplicar
                    </button>
                    <button onClick={onDelete} disabled={Boolean(estetica.isOriginal)} style={{ minHeight: 48 }} className="rounded-xl bg-rose-500/10 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300 disabled:opacity-30">
                        Eliminar
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                <div className="mb-4">
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Viewport de prueba</div>
                    <div className="grid grid-cols-3 gap-1">
                        {(['mobile', 'tablet', 'desktop'] as const).map(option => (
                            <button key={option} onClick={() => onViewportChange(option)} style={{ minHeight: 48 }} className={`rounded-xl text-[9px] font-black uppercase tracking-widest ${viewport === option ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                                {option === 'mobile' ? '375px' : option === 'tablet' ? '768px' : '1280px+'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Sondear referencia</div>
                    <select
                        defaultValue=""
                        onChange={event => { if (event.target.value) onReference(event.target.value); }}
                        className="mt-2 min-h-12 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 text-base font-bold text-zinc-200"
                    >
                        <option value="">Extraer una característica…</option>
                        {REFERENCIAS.map(reference => <option key={reference.id} value={reference.id}>{reference.nombre} · {reference.dominio}</option>)}
                    </select>
                    <p className="mt-2 text-[10px] font-bold text-zinc-500">La selección cambia la prueba en vivo. No aplica una skin ni modifica la estética guardada.</p>
                </div>

                <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Movidas visuales</span>
                        <span className="text-[9px] font-bold text-zinc-600">sin porcentajes</span>
                    </div>
                    <div className="space-y-2">
                        {MOVIDAS_CATALOGO.map(move => (
                            <div key={move.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-black text-zinc-200">{move.nombre}</span>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{move.madurez}</span>
                                </div>
                                <div className="mt-1 text-[9px] font-bold text-zinc-500">{move.descripcion}</div>
                                <div className="mt-2 grid grid-cols-4 gap-1">
                                    {INTENSIDADES.map(intensity => (
                                        <button
                                            key={intensity}
                                            onClick={() => changeMove(move.id, intensity)}
                                            style={{ minHeight: 48 }}
                                            className={`rounded-lg text-[8px] font-black uppercase tracking-widest ${recipe[move.id] === intensity ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-500 hover:text-zinc-200'}`}
                                        >
                                            {intensity}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <BarraIntencion
                    placeholder="Cambiar la expresión… «Quiero más aire»"
                    onAplicar={patch => onRecipeChange({ ...recipe, ...patch })}
                />

                <details className="mt-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                    <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-zinc-400">Herramientas secundarias</summary>
                    <div className="mt-2 grid grid-cols-2 gap-1">
                        <button onClick={() => onSecondary('comparar')} style={{ minHeight: 48 }} className="rounded-lg bg-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-400">Comparar</button>
                        <button onClick={() => onSecondary('contacto')} style={{ minHeight: 48 }} className="rounded-lg bg-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-400">Hoja de contacto</button>
                        <button onClick={() => onSecondary('lenguaje')} style={{ minHeight: 48 }} className="rounded-lg bg-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-400">Design Language</button>
                        <button onClick={() => onSecondary('absorber')} style={{ minHeight: 48 }} className="rounded-lg bg-zinc-800 text-[8px] font-black uppercase tracking-widest text-zinc-400">Referencias</button>
                    </div>
                </details>
            </div>
        </aside>
    );
}
