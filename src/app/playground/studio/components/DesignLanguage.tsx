'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MOVIDA_BY_ID } from '../movidas';
import { SCREEN_REGISTRY } from '../screens/real';

// ============================================================
// DESIGN LANGUAGE VIVO — nace del trabajo, nunca de teoría.
// Reglas validadas por doble puerta, movidas con su madurez,
// ejemplos/contraejemplos y pantallas de origen.
// ============================================================

export function DesignLanguage() {
    const reglas = useStudioStore(s => s.reglas);
    const movidas = useStudioStore(s => s.movidas);
    const hipotesis = useStudioStore(s => s.hipotesis);
    const observaciones = useStudioStore(s => s.observaciones);
    const sondaNotas = useStudioStore(s => s.sondaNotas);

    const reglasMovida = reglas.filter(r => r.movidaId);
    const movidasEnRegla = new Set(reglasMovida.map(r => r.movidaId));

    return (
        <div className="h-full overflow-auto p-4">
            <div className="mx-auto max-w-4xl">
                <div className="mb-4">
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Design Language</div>
                    <h2 className="text-xl font-black tracking-tight text-zinc-100">El lenguaje vivo de Marbella</h2>
                    <p className="mt-1 text-[11px] font-bold text-zinc-500">
                        Nace de la evidencia: reglas que superaron la doble puerta, movidas sembradas desde sondas,
                        contraejemplos que delimitan qué no es Marbella.
                    </p>
                </div>

                {/* Reglas validadas */}
                <section className="mb-6">
                    <div className="mb-2 flex items-center gap-2">
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-emerald-400">
                            {reglas.length} regla{reglas.length !== 1 ? 's' : ''}
                        </span>
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Validada por doble puerta</span>
                    </div>
                    {reglas.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-[11px] font-bold text-zinc-600">
                            Aún no hay reglas. En el modo Decidir, una variante que supere la Puerta 1 (mejor que el original)
                            y la Puerta 2 (funciona en otra pantalla estructuralmente distinta) se convierte en regla.
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        {reglas.map(r => {
                            const m = MOVIDA_BY_ID[r.movidaId];
                            return (
                                <div key={r.id} className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[12px] font-black text-emerald-300">{m.nombre}</span>
                                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{r.id}</span>
                                    </div>
                                    <div className="mt-1 text-[11px] font-bold text-zinc-300">{r.resumen}</div>
                                    <div className="mt-2 grid gap-1 text-[10px] font-bold md:grid-cols-2">
                                        <div className="rounded-lg bg-zinc-900/60 px-2 py-1 text-emerald-400/90">Ejemplo: {r.ejemplo}</div>
                                        <div className="rounded-lg bg-zinc-900/60 px-2 py-1 text-rose-400/80">Contraejemplo: {r.contraejemplo}</div>
                                    </div>
                                    <div className="mt-2 text-[9px] text-zinc-500">
                                        Origen: {SCREEN_REGISTRY[r.pantallaOrigen as keyof typeof SCREEN_REGISTRY]?.title ?? r.pantallaOrigen} ·
                                        Validada en: {SCREEN_REGISTRY[r.pantallaValidacion as keyof typeof SCREEN_REGISTRY]?.title ?? r.pantallaValidacion}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Movidas con madurez */}
                <section className="mb-6">
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Movidas del vocabulario · semilla → ingrediente → regla
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {movidas.map(m => {
                            const enRegla = movidasEnRegla.has(m.id);
                            const semillas = observaciones.filter(o => o.movidaId === m.id).length;
                            return (
                                <div key={m.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-black text-zinc-100">{m.nombre}</span>
                                        <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                            enRegla ? 'bg-emerald-500/15 text-emerald-400' : m.madurez === 'ingrediente' ? 'bg-[#36606F]/25 text-[#7FB0C0]' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {m.madurez}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[10px] font-bold text-zinc-500">{m.descripcion}</div>
                                    <div className="mt-1.5 grid gap-1 text-[9px] font-bold">
                                        <div className="text-emerald-400/80">Ejemplo: {m.ejemplo}</div>
                                        <div className="text-rose-400/70">Contraejemplo: {m.contraejemplo}</div>
                                    </div>
                                    <div className="mt-1.5 flex flex-wrap gap-1">
                                        {m.referenciasOrigen.map(r => (
                                            <span key={r} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-500">{r}</span>
                                        ))}
                                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[8px] font-black text-zinc-400">{semillas} semillas</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </section>

                {/* Hipótesis */}
                <section className="mb-6">
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Hipótesis ({hipotesis.length})
                    </div>
                    {hipotesis.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-[11px] font-bold text-zinc-600">
                            Las hipótesis nacen de las sondas (Absorber) o del trabajo en Decidir. Son el centro de gravedad del Studio.
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        {hipotesis.map(h => (
                            <div key={h.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                                <div className="flex items-center justify-between gap-2">
                                    <span className="text-[11px] font-black text-zinc-200">{h.texto}</span>
                                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                        h.estado === 'convertida_en_regla' ? 'bg-emerald-500/15 text-emerald-400'
                                        : h.estado === 'descartada' ? 'bg-rose-500/10 text-rose-400'
                                        : h.estado === 'validada' ? 'bg-emerald-500/10 text-emerald-400'
                                        : 'bg-zinc-800 text-zinc-400'
                                    }`}>
                                        {h.estado}
                                    </span>
                                </div>
                                {h.notas && <div className="mt-1 text-[10px] font-bold text-zinc-500">{h.notas}</div>}
                                <div className="mt-1.5 text-[9px] text-zinc-600">
                                    Movidas: {h.movidas.map(m => MOVIDA_BY_ID[m].nombre).join(', ') || '—'} ·
                                    Timeline: {h.timeline.map(t => t.estado).join(' → ')}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Notas de sonda */}
                <section>
                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                        Notas de sonda ({sondaNotas.length})
                    </div>
                    {sondaNotas.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-zinc-800 p-4 text-[11px] font-bold text-zinc-600">
                            Las notas de sonda registran lo que se observa al probar recetas desechables en el sandbox.
                        </div>
                    )}
                    <div className="flex flex-col gap-2">
                        {[...sondaNotas].reverse().map(n => (
                            <div key={n.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                                <div className="text-[10px] font-bold text-zinc-300">{n.texto}</div>
                                <div className="mt-1 text-[9px] text-zinc-500">
                                    {SCREEN_REGISTRY[n.screenKey as keyof typeof SCREEN_REGISTRY]?.title ?? n.screenKey} ·{' '}
                                    {Object.entries(n.recipe).map(([k, v]) => `${MOVIDA_BY_ID[k as keyof typeof MOVIDA_BY_ID].nombre}:${v}`).join(' · ') || 'identidad original'}
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            </div>
        </div>
    );
}
