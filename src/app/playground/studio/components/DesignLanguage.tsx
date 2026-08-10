'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import { MOVIDA_BY_ID, INTENSIDAD_FACTOR } from '../movidas';
import { REFERENCIAS } from '../referencias';
import { Recipe } from '../types';

// ============================================================
// DESIGN LANGUAGE VIVO — nace de las estéticas guardadas.
// Cada estética documenta una expresión coherente de Marbella.
// Las movidas observadas en referencias son semillas que alimentan
// las estéticas futuras.
// ============================================================

function resumenRecipe(r: Recipe): string {
    return Object.keys(r).length === 0
        ? 'Identidad original'
        : Object.entries(r).map(([k, v]) => `${MOVIDA_BY_ID[k as keyof typeof MOVIDA_BY_ID]?.nombre ?? k} (${v})`).join(' · ');
}

export function DesignLanguage() {
    const esteticas = useSandboxStore(s => s.esteticas);
    const movidas = useSandboxStore(s => s.movidas);

    const movidasConEvidencia = movidas.map(m => {
        const usos = esteticas
            .map(e => (m.id in e.recipe ? e.recipe[m.id] : null))
            .filter(Boolean) as string[];
        const intensidadPredominante = usos.length
            ? (usos.reduce(
                  (acc, v) => acc + (INTENSIDAD_FACTOR[v as keyof typeof INTENSIDAD_FACTOR] ?? 0),
                  0
              ) / usos.length)
            : 0;
        return { ...m, usos, intensidadPredominante };
    });

    return (
        <div className="h-full overflow-auto p-4">
            <div className="mx-auto max-w-4xl">
                <div className="mb-5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Design Language</div>
                    <h2 className="text-xl font-black tracking-tight text-zinc-100">El lenguaje vivo de Marbella</h2>
                    <p className="mt-1 text-[11px] font-bold text-zinc-500">
                        Cada estética guardada es una expresión documentada. Las movidas observadas en referencias
                        (Absorber) son semillas: se vuelven reglas cuando una estética las combina coherentemente.
                    </p>
                </div>

                {/* Estéticas como expresiones validadas */}
                <section className="mb-6">
                    <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md bg-[#36606F]/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#7FB0C0]">
                            {esteticas.length} estética{esteticas.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Expresiones guardadas</span>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {esteticas.map(e => (
                            <div key={e.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-sm font-black text-zinc-100">{e.name}</span>
                                    <span
                                        className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                            e.isOriginal ? 'bg-zinc-800 text-zinc-300' : 'bg-[#36606F]/20 text-[#7FB0C0]'
                                        }`}
                                    >
                                        {e.isOriginal ? 'base' : 'variedad'}
                                    </span>
                                </div>
                                <div className="mt-1 text-[10px] font-bold text-zinc-400">{resumenRecipe(e.recipe)}</div>
                                {e.description && <div className="mt-1 text-[9px] text-zinc-500">{e.description}</div>}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Referencias: inspiración, nunca plantillas */}
                <section className="mb-6">
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Referencias como sondas — extrae movidas, no apliques temas
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                        {REFERENCIAS.map(r => (
                            <div key={r.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-black text-zinc-100">{r.nombre}</span>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">{r.dominio}</span>
                                </div>
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                    {r.movidasObservadas.map(m => {
                                        const info = MOVIDA_BY_ID[m.movidaId];
                                        return (
                                            <span key={m.movidaId} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-black text-zinc-300">
                                                {info.nombre} · {m.intensidad}
                                            </span>
                                        );
                                    })}
                                </div>
                                {r.contraejemplos.length > 0 && (
                                    <div className="mt-1.5">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-rose-400">Contraejemplos</span>
                                        {r.contraejemplos.map((c, i) => (
                                            <div key={i} className="mt-0.5 text-[9px] font-bold text-rose-400/70">{c}</div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </section>

                {/* Movidas con evidencia de uso */}
                <section>
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Vocabulario de movidas · evidencia de uso
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {movidasConEvidencia.map(m => (
                            <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-black text-zinc-100">{m.nombre}</span>
                                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-600">
                                        {m.madurez} · {m.usos.length} uso{m.usos.length !== 1 ? 's' : ''}
                                    </span>
                                </div>
                                <div className="mt-0.5 text-[9px] text-zinc-500">
                                    {m.usos.length > 0
                                        ? `Predominio: ${m.intensidadPredominante.toFixed(2)}`
                                        : 'Sin uso todavía · semilla'}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
