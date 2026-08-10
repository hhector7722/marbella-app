'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { ScreenView } from './ScreenView';
import { BarraIntencion } from './BarraIntencion';
import { SCREEN_REGISTRY } from '../screens/real';
import { MOVIDA_BY_ID } from '../movidas';
import { Recipe, EstadoVersion } from '../types';

// ============================================================
// MODO DECIDIR — original + variante sobre una pantalla real.
// Sin edición de CSS/tokens. La pantalla es la protagonista.
// ============================================================

const ESTADO_ESTILO: Record<EstadoVersion, string> = {
    original: 'bg-zinc-700 text-zinc-200',
    conservada: 'bg-emerald-500/15 text-emerald-400',
    candidata: 'bg-[#36606F]/20 text-[#7FB0C0]',
    descartada: 'bg-rose-500/10 text-rose-400 line-through',
};

export function ModoDecidir() {
    const activeScreen = useStudioStore(s => s.activeScreenKey);
    const setActiveScreen = useStudioStore(s => s.setActiveScreen);
    const viewport = useStudioStore(s => s.viewport);
    const setViewport = useStudioStore(s => s.setViewport);
    const versions = useStudioStore(s => s.versions);
    const activeVariantId = useStudioStore(s => s.activeVariantId);
    const setActiveVariant = useStudioStore(s => s.setActiveVariant);
    const addVariantFromRecipe = useStudioStore(s => s.addVariantFromRecipe);
    const forkVariant = useStudioStore(s => s.forkVariant);
    const fusionarVariantes = useStudioStore(s => s.fusionarVariantes);
    const setVariantState = useStudioStore(s => s.setVariantState);
    const deleteVariant = useStudioStore(s => s.deleteVariant);
    const setPuerta1 = useStudioStore(s => s.setPuerta1);
    const setSegundaPantalla = useStudioStore(s => s.setSegundaPantalla);
    const convertToRegla = useStudioStore(s => s.convertToRegla);
    const activeHipotesisId = useStudioStore(s => s.activeHipotesisId);

    const [verOriginal, setVerOriginal] = useState(true);
    const [enHoja, setEnHoja] = useState(false);
    const [seleccionFusion, setSeleccionFusion] = useState<string[]>([]);
    const [barraAbierta, setBarraAbierta] = useState(true);

    const nodes = versions[activeScreen] || [];
    const original = nodes.find(n => n.parentId === null);
    const activo = nodes.find(n => n.id === activeVariantId);

    const recipeVisible = verOriginal || !activo ? (original?.recipe ?? {}) : activo.recipe;

    const nuevaReceta = (name: string, recipe: Recipe, parentId: string | null) => {
        const id = addVariantFromRecipe(activeScreen, parentId, name, recipe, {
            hipotesisId: activeHipotesisId ?? undefined,
            estado: 'candidata',
        });
        setActiveVariant(id);
        setVerOriginal(false);
    };

    const toggleFusion = (id: string) => {
        setSeleccionFusion(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : prev.length >= 2 ? [prev[1], id] : [...prev, id]
        );
    };

    const aplicarFusion = () => {
        if (seleccionFusion.length !== 2) return;
        const nombre = `Fusión ${seleccionFusion.map(id => {
            const n = nodes.find(x => x.id === id);
            return n ? n.name.replace(/\s*\(.*\)/, '') : id;
        }).join('+')}`;
        const id = fusionarVariantes(activeScreen, seleccionFusion, nombre);
        if (id) {
            setActiveVariant(id);
            setSeleccionFusion([]);
            setVerOriginal(false);
        }
    };

    const resumenReceta = (r: Recipe) =>
        Object.entries(r).length === 0
            ? 'Identidad original'
            : Object.entries(r).map(([k, v]) => `${MOVIDA_BY_ID[k as keyof typeof MOVIDA_BY_ID].nombre}: ${v}`).join(' · ');

    const frameWidth =
        viewport === 'mobile' ? 'w-[390px]' : viewport === 'tablet' ? 'w-full max-w-[768px]' : 'w-full';

    return (
        <div className="flex h-full min-h-0 flex-col">
            {/* Cabecera: la pantalla es la protagonista, la herramienta desaparece */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/70 px-4 py-2">
                <div className="flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Pantalla real</span>
                    <select
                        value={activeScreen}
                        onChange={e => setActiveScreen(e.target.value as typeof activeScreen)}
                        className="min-h-12 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-black text-zinc-200"
                    >
                        {Object.entries(SCREEN_REGISTRY).map(([k, v]) => (
                            <option key={k} value={k}>{v.title} — {v.route}</option>
                        ))}
                    </select>
                    <div className="flex gap-1">
                        {(['mobile', 'tablet', 'desktop'] as const).map(v => (
                            <button
                                key={v}
                                onClick={() => setViewport(v)}
                                style={{ minHeight: 48 }}
                                className={`rounded-xl px-2.5 text-[9px] font-black uppercase tracking-widest ${
                                    viewport === v ? 'bg-[#36606F] text-white' : 'text-zinc-500 hover:text-zinc-200'
                                }`}
                            >
                                {v}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <button
                        onClick={() => setEnHoja(!enHoja)}
                        style={{ minHeight: 48 }}
                        className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${
                            enHoja ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300'
                        }`}
                    >
                        Hoja de contacto
                    </button>
                    <button
                        onClick={() => setBarraAbierta(!barraAbierta)}
                        style={{ minHeight: 48 }}
                        className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300"
                    >
                        {barraAbierta ? 'Ocultar intención' : 'Intención'}
                    </button>
                </div>
            </div>

            {/* Cuerpo: pantalla + panel de versiones */}
            <div className="flex min-h-0 flex-1">
                {/* La pantalla */}
                <div className="flex min-h-0 flex-1 items-start justify-center overflow-auto bg-zinc-950 p-4">
                    {enHoja ? (
                        <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {nodes.map(n => (
                                <div key={n.id} className="overflow-hidden rounded-2xl border border-zinc-800">
                                    <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">{n.name}</span>
                                        <span className={`rounded-lg px-2 py-0.5 text-[8px] font-black uppercase tracking-widest ${ESTADO_ESTILO[n.estado]}`}>
                                            {n.estado}
                                        </span>
                                    </div>
                                    <div className="h-[480px]">
                                        <ScreenView screenKey={activeScreen} recipe={n.recipe} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex h-full flex-col">
                            <div className="mb-2 flex items-center gap-2">
                                <button
                                    onClick={() => setVerOriginal(true)}
                                    style={{ minHeight: 48 }}
                                    className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${verOriginal ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                >
                                    Original
                                </button>
                                {activo && (
                                    <button
                                        onClick={() => setVerOriginal(false)}
                                        style={{ minHeight: 48 }}
                                        className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${!verOriginal ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}
                                    >
                                        {activo.name}
                                    </button>
                                )}
                                {!activo && <span className="text-[10px] text-zinc-600">Selecciona una variante en el panel</span>}
                            </div>
                            <div className={`flex-1 overflow-hidden rounded-[2.5rem] ${frameWidth}`} style={{ height: 'calc(100% - 56px)' }}>
                                <ScreenView screenKey={activeScreen} recipe={recipeVisible} />
                            </div>
                        </div>
                    )}
                </div>

                {/* Panel de versiones */}
                <div className="hidden w-72 shrink-0 flex-col overflow-auto border-l border-zinc-800/70 bg-zinc-950 md:flex">
                    <div className="border-b border-zinc-800/70 px-4 py-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Árbol de versiones</div>
                        <div className="mt-1 text-[11px] text-zinc-400">{SCREEN_REGISTRY[activeScreen].title}</div>
                    </div>

                    <div className="flex flex-1 flex-col gap-2 overflow-auto p-3">
                        {nodes.map(n => {
                            const esOriginal = n.parentId === null;
                            const esSeleccion = seleccionFusion.includes(n.id);
                            return (
                                <div
                                    key={n.id}
                                    onClick={() => !esOriginal && setActiveVariant(n.id)}
                                    className={`rounded-xl border p-2.5 transition-colors ${
                                        !esOriginal && activeVariantId === n.id && !verOriginal
                                            ? 'border-[#36606F] bg-[#36606F]/10'
                                            : esSeleccion
                                            ? 'border-emerald-500/60 bg-emerald-500/10'
                                            : 'border-zinc-800 bg-zinc-900/50'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-black text-zinc-200">{n.name}</span>
                                        <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${ESTADO_ESTILO[n.estado]}`}>
                                            {n.estado}
                                        </span>
                                    </div>
                                    <div className="mt-1 truncate text-[9px] text-zinc-500">{resumenReceta(n.recipe)}</div>

                                    {!esOriginal && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            <button
                                                onClick={e => { e.stopPropagation(); const id = forkVariant(activeScreen, n.id, `${n.name} (rama)`); if (id) setActiveVariant(id); }}
                                                className="rounded-lg bg-zinc-800 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-zinc-300"
                                            >
                                                Rama
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); toggleFusion(n.id); }}
                                                className={`rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${esSeleccion ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}
                                            >
                                                Fusión
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); setVariantState(activeScreen, n.id, n.estado === 'descartada' ? 'candidata' : 'descartada'); }}
                                                className="rounded-lg bg-zinc-800 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-zinc-300"
                                            >
                                                Descartar
                                            </button>
                                            <button
                                                onClick={e => { e.stopPropagation(); deleteVariant(activeScreen, n.id); }}
                                                className="rounded-lg bg-rose-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-rose-400"
                                            >
                                                Borrar
                                            </button>
                                        </div>
                                    )}

                                    {!esOriginal && (
                                        <div className="mt-2 space-y-1.5 border-t border-zinc-800 pt-2">
                                            <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                                <input
                                                    type="checkbox"
                                                    checked={!!n.superaPuerta1}
                                                    onChange={e => setPuerta1(activeScreen, n.id, e.target.checked)}
                                                    className="h-4 w-4 accent-[#36606F]"
                                                />
                                                Puerta 1 — mejor que el original
                                            </label>
                                            <label className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-zinc-400">
                                                Puerta 2
                                                <select
                                                    value={n.segundaPantalla ?? ''}
                                                    onChange={e => setSegundaPantalla(activeScreen, n.id, e.target.value || null)}
                                                    className="min-h-8 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[9px] font-black text-zinc-300"
                                                >
                                                    <option value="">— selecciona —</option>
                                                    {Object.entries(SCREEN_REGISTRY)
                                                        .filter(([k]) => k !== activeScreen)
                                                        .map(([k, v]) => (
                                                            <option key={k} value={k}>{v.title}</option>
                                                        ))}
                                                </select>
                                            </label>
                                            {n.superaPuerta1 && n.segundaPantalla && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); const r = convertToRegla(activeScreen, n.id); if (r) setVerOriginal(true); }}
                                                    className="w-full rounded-lg bg-emerald-500/15 px-2 py-1.5 text-[8px] font-black uppercase tracking-widest text-emerald-400"
                                                >
                                                    Convertir en regla
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {seleccionFusion.length === 2 && (
                        <div className="border-t border-zinc-800 p-3">
                            <button
                                onClick={aplicarFusion}
                                style={{ minHeight: 48 }}
                                className="w-full rounded-xl bg-emerald-500 text-[9px] font-black uppercase tracking-widest text-white"
                            >
                                Fusionar las 2 seleccionadas
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Barra de intención */}
            {barraAbierta && (
                <div className="border-t border-zinc-800/70 bg-zinc-950 px-4 py-2">
                    <BarraIntencion onAplicar={recipe => nuevaReceta('Intención', recipe, activo ? activo.id : (original?.id ?? null))} />
                </div>
            )}
        </div>
    );
}
