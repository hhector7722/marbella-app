'use client';

import React, { useState } from 'react';
import { useStudioStore } from '../store';
import { REFERENCIAS, REFERENCIA_BY_ID } from '../referencias';
import { MOVIDA_BY_ID } from '../movidas';
import { Intensidad } from '../types';

// ============================================================
// MODO ABSORBER — estudiar referencias como sondas, nunca como
// temas. Extraer movidas → semillas del Design Language.
// ============================================================

const INTENSIDAD_TONO: Record<Intensidad, string> = {
    nada: 'text-zinc-500',
    sutil: 'text-zinc-400',
    moderado: 'text-[#7FB0C0]',
    fuerte: 'text-[#A8D2DF]',
};

export function ModoAbsorber() {
    const observaciones = useStudioStore(s => s.observaciones);
    const recordReadObservation = useStudioStore(s => s.recordReadObservation);
    const movidas = useStudioStore(s => s.movidas);
    const addHipotesis = useStudioStore(s => s.addHipotesis);
    const setActiveHipotesis = useStudioStore(s => s.setActiveHipotesis);

    const [referenciaActiva, setReferenciaActiva] = useState<string>(REFERENCIAS[0].id);

    const ref = REFERENCIA_BY_ID[referenciaActiva];
    const observadas = observaciones.filter(o => o.referenciaId === referenciaActiva);

    const semillasPorMovida = (movidaId: string) => observaciones.filter(o => o.movidaId === movidaId);

    const preguntarAMarbella = (pregunta: string) => {
        const movidasRef = ref.movidasObservadas.map(m => m.movidaId);
        const id = addHipotesis(`Pregunta desde ${ref.nombre}: ${pregunta}`, movidasRef, {
            referencias: [ref.id],
            notas: 'Nace de una sonda (referencia), no de una teoría previa.',
        });
        setActiveHipotesis(id);
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-center justify-between border-b border-zinc-800/70 px-4 py-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">
                    Referencias = sondas, nunca temas. Ningún «Aplicar Apple»: solo movidas.
                </span>
                <span className="rounded-lg bg-[#36606F]/20 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-[#7FB0C0]">
                    Semillas → ingrediente → regla
                </span>
            </div>

            <div className="flex min-h-0 flex-1">
                {/* Lista de referencias */}
                <div className="flex w-56 shrink-0 flex-col overflow-auto border-r border-zinc-800/70">
                    {REFERENCIAS.map(r => {
                        const activa = r.id === referenciaActiva;
                        const cuantas = observaciones.filter(o => o.referenciaId === r.id).length;
                        return (
                            <button
                                key={r.id}
                                onClick={() => setReferenciaActiva(r.id)}
                                style={{ minHeight: 48 }}
                                className={`flex items-center justify-between border-b border-zinc-800/50 px-4 text-left ${
                                    activa ? 'bg-[#36606F]/10' : 'hover:bg-zinc-900'
                                }`}
                            >
                                <div>
                                    <div className={`text-[11px] font-black ${activa ? 'text-white' : 'text-zinc-300'}`}>{r.nombre}</div>
                                    <div className="text-[9px] text-zinc-500">{r.dominio}</div>
                                </div>
                                {cuantas > 0 && (
                                    <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-black text-emerald-400">{cuantas}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Ficha de la referencia */}
                <div className="min-h-0 flex-1 overflow-auto p-4">
                    <div className="mx-auto max-w-3xl">
                        <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">{ref.dominio}</div>
                        <h2 className="text-xl font-black tracking-tight text-zinc-100">{ref.nombre}</h2>
                        <p className="mt-1 text-sm font-bold text-zinc-400">{ref.descripcion}</p>

                        {/* Movidas observadas */}
                        <div className="mt-5">
                            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Movidas que se observan en esta sonda</div>
                            <div className="flex flex-col gap-2">
                                {ref.movidasObservadas.map(m => {
                                    const mInfo = MOVIDA_BY_ID[m.movidaId];
                                    const yaObservada = observadas.some(o => o.movidaId === m.movidaId);
                                    const semillas = semillasPorMovida(m.movidaId).length;
                                    return (
                                        <div key={m.movidaId} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[12px] font-black text-zinc-100">{mInfo.nombre}</span>
                                                        <span className={`text-[9px] font-black uppercase tracking-widest ${INTENSIDAD_TONO[m.intensidad]}`}>
                                                            {m.intensidad}
                                                        </span>
                                                    </div>
                                                    <div className="mt-0.5 text-[11px] font-bold text-zinc-500">{m.nota}</div>
                                                </div>
                                                <button
                                                    onClick={() => recordReadObservation(ref.id, m.movidaId, m.nota)}
                                                    disabled={yaObservada}
                                                    style={{ minHeight: 48 }}
                                                    className={`shrink-0 rounded-xl px-3 text-[8px] font-black uppercase tracking-widest ${
                                                        yaObservada ? 'bg-emerald-500/15 text-emerald-400' : 'bg-[#36606F] text-white'
                                                    }`}
                                                >
                                                    {yaObservada ? `Semilla ×${semillas}` : 'Observar → semilla'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Contraejemplos */}
                        <div className="mt-5">
                            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-rose-400">Contraejemplos (lo que esta sonda rechaza)</div>
                            <div className="flex flex-col gap-1.5">
                                {ref.contraejemplos.map((c, i) => (
                                    <div key={i} className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[11px] font-bold text-rose-300/80">
                                        {c}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Preguntas para Marbella */}
                        <div className="mt-5">
                            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">Preguntas que esta sonda le hace a Marbella</div>
                            <div className="flex flex-col gap-2">
                                {ref.preguntas.map((p, i) => (
                                    <div key={i} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3 py-2">
                                        <span className="text-[11px] font-bold text-zinc-300">{p}</span>
                                        <button
                                            onClick={() => preguntarAMarbella(p)}
                                            style={{ minHeight: 48 }}
                                            className="shrink-0 rounded-xl bg-zinc-800 px-2.5 text-[8px] font-black uppercase tracking-widest text-zinc-300"
                                        >
                                            Convertir en hipótesis
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Panel de semillas */}
                <div className="hidden w-64 shrink-0 flex-col overflow-auto border-l border-zinc-800/70 lg:flex">
                    <div className="border-b border-zinc-800/70 px-4 py-3">
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Semillas del Design Language</div>
                    </div>
                    <div className="flex flex-col gap-2 p-3">
                        {movidas.map(m => {
                            const semillas = semillasPorMovida(m.id).length;
                            if (semillas === 0) return null;
                            return (
                                <div key={m.id} className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-black text-zinc-200">{m.nombre}</span>
                                        <span className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                            m.madurez === 'regla' ? 'bg-emerald-500/15 text-emerald-400' : m.madurez === 'ingrediente' ? 'bg-[#36606F]/25 text-[#7FB0C0]' : 'bg-zinc-800 text-zinc-400'
                                        }`}>
                                            {m.madurez}
                                        </span>
                                    </div>
                                    <div className="mt-1 text-[9px] text-zinc-500">
                                        {semillas} observación{semillas !== 1 ? 'es' : ''} · madurez: {m.madurez}
                                    </div>
                                </div>
                            );
                        })}
                        {movidas.every(m => semillasPorMovida(m.id).length === 0) && (
                            <div className="px-1 py-4 text-center text-[11px] font-bold text-zinc-600">
                                Observa movidas en las sondas para sembrar el Design Language.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
