'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import { DesignProvider } from '../screens/system';
import { SANDBOX_SCREENS } from '../screens/sandbox-screens';

// ============================================================
// HOJA DE CONTACTO — todas las estéticas a la vista.
// Cada miniatura es Marbella con esa estética aplicada a la
// pantalla actual. Seleccionas → "Explorar" y entras con ella.
// ============================================================

export function HojaContacto({ onExplorar }: { onExplorar?: () => void }) {
    const esteticas = useSandboxStore(s => s.esteticas);
    const setActive = useSandboxStore(s => s.setActiveEstetica);
    const setRoute = useSandboxStore(s => s.setRoute);
    const route = useSandboxStore(s => s.route);
    const viewport = useSandboxStore(s => s.viewport);
    const setViewport = useSandboxStore(s => s.setViewport);
    const Screen = SANDBOX_SCREENS[route as keyof typeof SANDBOX_SCREENS];

    if (!Screen) {
        return <div className="p-4 text-sm">Ruta sin miniatura.</div>;
    }

    return (
        <div className="h-full w-full overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-black text-zinc-100">Hoja de contacto</h2>
                    <p className="text-[10px] font-bold text-zinc-500">
                        {esteticas.length} estéticas · pantalla: {route} · viewport {viewport}
                    </p>
                </div>
                <div className="flex gap-2">
                    {(['mobile', 'tablet', 'desktop'] as const).map(v => (
                        <button
                            key={v}
                            onClick={() => setViewport(v)}
                            style={{ minHeight: 44 }}
                            className={`rounded-xl px-2.5 text-[9px] font-black uppercase tracking-widest ${
                                viewport === v ? 'bg-[#36606F]/20 text-[#7FB0C0]' : 'text-zinc-800/60 text-zinc-400 hover:text-white'
                            }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {esteticas.map(e => (
                    <div
                        key={e.id}
                        className="w-full max-w-[360px] rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl"
                    >
                        <div className="mb-2 flex items-center justify-between gap-1">
                            <div>
                                <div className="text-sm font-black text-zinc-100">{e.name}</div>
                                <div className="text-[9px] font-bold text-zinc-500">
                                    {Object.keys(e.recipe).length === 0
                                        ? 'Identidad original'
                                        : Object.entries(e.recipe).map(([k, v]) => `${k} ${v}`).join(' · ')}
                                </div>
                            </div>
                            <span
                                className={`rounded-md px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest ${
                                    e.isOriginal ? 'bg-zinc-800 text-zinc-300' : 'bg-[#36606F]/20 text-[#7FB0C0]'
                                }`}
                            >
                                {e.isOriginal ? 'base' : 'variedad'}
                            </span>
                        </div>
                        <div className="h-[360px] overflow-hidden rounded-xl border border-zinc-800">
                            <DesignProvider recipe={e.recipe}>
                                <div className="h-full">
                                    <Screen />
                                </div>
                            </DesignProvider>
                        </div>
                        <div className="mt-2 flex gap-1.5">
                            <button
                                onClick={() => {
                                    setActive(e.id);
                                    setRoute(route);
                                    onExplorar?.();
                                }}
                                style={{ minHeight: 44 }}
                                className="flex-1 rounded-xl bg-[#36606F] px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-white"
                            >
                                Explorar
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
