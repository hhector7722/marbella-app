'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import { REFERENCIAS, REFERENCIA_BY_ID } from '../referencias';
import { MOVIDA_BY_ID } from '../movidas';
import { Intensidad, MovidaId } from '../types';

// ============================================================
// ABSORBER — referencias como sondas, nunca temas.
// Extraer características de una referencia y convertirlas en
// una NUEVA estética de Marbella. Nunca "aplicar Apple".
// ============================================================

export function ModoAbsorber({ onCreada }: { onCreada?: () => void }) {
    const esteticas = useSandboxStore(s => s.esteticas);
    const activeId = useSandboxStore(s => s.activeEsteticaId);
    const createEstetica = useSandboxStore(s => s.createEstetica);

    const [refActiva, setRefActiva] = React.useState('linear');
    const [seleccion, setSeleccion] = React.useState<Partial<Record<MovidaId, Intensidad>>>({});

    const ref = REFERENCIA_BY_ID[refActiva];
    const activaEnLista = esteticas.find(e => e.id === activeId);

    const toggleMovida = (movidaId: MovidaId, intensidad: Intensidad) => {
        setSeleccion(prev => ({ ...prev, [movidaId]: intensidad }));
    };

    const crearDesdeReferencia = () => {
        const name = `De ${ref.nombre} · ${activaEnLista?.name ?? 'Original'}`;
        createEstetica(name, seleccion, {
            description: `Estética extraída de la sonda ${ref.nombre}. ${ref.descripcion}`,
            parentId: activeId ?? null,
        });
        setSeleccion({});
        onCreada?.();
    };

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1">
                {/* Lista de referencias */}
                <div className="flex w-56 shrink-0 flex-col overflow-auto border-r border-zinc-800/70">
                    {REFERENCIAS.map(r => (
                        <button
                            key={r.id}
                            onClick={() => { setRefActiva(r.id); setSeleccion({}); }}
                            style={{ minHeight: 56 }}
                            className={`flex items-center justify-between border-b border-zinc-800/50 px-4 text-left ${
                                r.id === refActiva ? 'bg-[#36606F]/10' : 'hover:bg-zinc-900'
                            }`}
                        >
                            <div>
                                <div className={`text-[11px] font-black ${r.id === refActiva ? 'text-white' : 'text-zinc-300'}`}>{r.nombre}</div>
                                <div className="text-[9px] text-zinc-500">{r.dominio}</div>
                            </div>
                            {Object.keys(seleccion).length > 0 && r.id === refActiva && (
                                <span className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase text-emerald-400">
                                    {Object.keys(seleccion).length}
                                </span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Ficha de la referencia */}
                <div className="min-h-0 flex-1 overflow-auto p-5">
                    <div className="mx-auto max-w-2xl">
                        <div className="mb-1 text-[9px] font-black uppercase tracking-widest text-zinc-500">{ref.dominio}</div>
                        <h2 className="text-xl font-black tracking-tight text-zinc-100">{ref.nombre}</h2>
                        <p className="mt-1 text-[11px] font-bold text-zinc-400">{ref.descripcion}</p>

                        <div className="mt-5 border-t border-zinc-800 pt-4">
                            <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-zinc-500">
                                Selecciona las movidas que quieres portar a Marbella
                            </div>
                            <p className="mb-3 text-[10px] font-bold text-zinc-500">
                                Marca la casilla y elegir intensidad ordinal. No estás &quot;aplicando {ref.nombre}&quot;; estás
                                extrayendo una característica para reinterpretarla en Marbella.
                            </p>

                            <div className="flex flex-col gap-2">
                                {ref.movidasObservadas.map(m => {
                                    const info = MOVIDA_BY_ID[m.movidaId];
                                    const sel = seleccion[m.movidaId];
                                    const INTENSIDADES: Intensidad[] = ['nada', 'sutil', 'moderado', 'fuerte'];
                                    return (
                                        <div key={m.movidaId} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-3">
                                            <div className="flex items-center justify-between gap-2">
                                                <div>
                                                    <span className="text-[12px] font-black text-zinc-100">{info.nombre}</span>
                                                    <div className="text-[10px] font-bold text-zinc-500">
                                                        En {ref.nombre}: <span className="text-[#7FB0C0]">{m.intensidad}</span>
                                                    </div>
                                                </div>
                                                <div className="flex flex-wrap gap-1 justify-end">
                                                    {INTENSIDADES.map(i => (
                                                        <button
                                                            key={i}
                                                            onClick={() => toggleMovida(m.movidaId, i)}
                                                            style={{ minHeight: 44 }}
                                                            className={`rounded-lg px-2 py-1 text-[8px] font-black uppercase tracking-widest ${
                                                                sel === i
                                                                    ? 'bg-[#36606F] text-white'
                                                                    : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
                                                            }`}
                                                        >
                                                            {i}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="mt-1.5 text-[10px] font-bold text-zinc-500">
                                                Observación: {m.nota}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                            {ref.contraejemplos.length > 0 && (
                                <div className="mt-5">
                                    <div className="mb-2 text-[9px] font-black uppercase tracking-widest text-rose-400">
                                        Contraejemplos (lo que esta sonda rechaza)
                                    </div>
                                    {ref.contraejemplos.map((c, i) => (
                                        <div key={i} className="rounded-xl border border-rose-500/20 bg-rose-500/5 px-3 py-2 text-[10px] font-bold text-rose-300/80">
                                            {c}
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="mt-5 border-t border-zinc-800 pt-4">
                                <button
                                    onClick={crearDesdeReferencia}
                                    disabled={Object.keys(seleccion).length === 0}
                                    style={{ minHeight: 48 }}
                                    className="w-full rounded-xl bg-[#36606F] px-3 text-[9px] font-black uppercase tracking-widest text-white disabled:opacity-40"
                                >
                                    Crear nueva estética de Marbella
                                </button>
                                <p className="mt-1 text-[9px] text-zinc-600">
                                    Se crea una nueva estética derivada de Marbella Original con las movidas seleccionadas. La
                                    actual no se modifica.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
