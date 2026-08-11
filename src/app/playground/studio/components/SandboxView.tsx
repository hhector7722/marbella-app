'use client';

import React from 'react';
import { useSandboxStore, useActiveEstetica } from '../store';
import { DesignProvider } from '../screens/system';
import { SANDBOX_SCREENS, SANDBOX_ROUTE_META } from '../screens/sandbox-screens';
import { RealAppView, hasRealSandboxPage } from './RealAppView';
import type { SandboxRoute, Estetica, Recipe, VisualOverrides } from '../types';

// ============================================================
// SANDBOX VIEW — Marbella App real como lienzo.
// Renderiza la ruta activa con la ESTÉTICA GLOBAL aplicada.
// El estilo se mantiene al cambiar de ruta.
// ============================================================

export function SandboxView({
    esteticaId,
    recipeOverride,
    overrides,
    label,
}: {
    esteticaId?: string;
    recipeOverride?: Recipe;
    overrides?: VisualOverrides;
    label?: string | null;
}) {
    const route = useSandboxStore(s => s.route);
    const esteticaActiva = useActiveEstetica();
    const esteticaPorId = useSandboxStore(s => esteticaId ? s.esteticas.find(e => e.id === esteticaId) : undefined);
    const Screen = SANDBOX_SCREENS[route as SandboxRoute];

    const estetica: Estetica | undefined = esteticaPorId ?? esteticaActiva;

    if (hasRealSandboxPage(route)) return <RealAppView recipeOverride={recipeOverride} overrides={overrides ?? estetica?.overrides ?? {}} />;

    if (!Screen) {
        return (
            <div className="flex h-full items-center justify-center text-zinc-500">
                <span className="text-[10px] font-black uppercase tracking-widest">{route}</span>
            </div>
        );
    }

    return (
        <DesignProvider recipe={recipeOverride ?? estetica?.recipe ?? {}}>
            <div className="h-full w-full">
                {label && (
                    <div className="pointer-events-none absolute top-2 left-2 z-20 rounded-md bg-zinc-800/60 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-zinc-400">
                        {label}
                    </div>
                )}
                <Screen />
            </div>
        </DesignProvider>
    );
}

export function RutaBadge() {
    const route = useSandboxStore(s => s.route);
    return (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900/60 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-zinc-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            {SANDBOX_ROUTE_META[route]?.title ?? route}
        </span>
    );
}

// Selector de estética + viewport, reutilizable.
export function SelectorEsteticaYViewport() {
    const esteticas = useSandboxStore(s => s.esteticas);
    const activeId = useSandboxStore(s => s.activeEsteticaId);
    const setActive = useSandboxStore(s => s.setActiveEstetica);
    const viewport = useSandboxStore(s => s.viewport);
    const setViewport = useSandboxStore(s => s.setViewport);

    return (
        <div className="flex items-center gap-2">
            <select
                value={activeId}
                onChange={e => setActive(e.target.value)}
                className="min-h-12 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[9px] font-black uppercase tracking-widest text-zinc-200"
            >
                {esteticas.map(e => (
                    <option key={e.id} value={e.id}>
                        {e.name}
                    </option>
                ))}
            </select>
            <div className="flex gap-1">
                {(['mobile', 'tablet', 'desktop'] as const).map(v => (
                    <button
                        key={v}
                        onClick={() => setViewport(v)}
                        style={{ minHeight: 44 }}
                        className={`rounded-lg px-2 text-[9px] font-black uppercase tracking-widest ${
                            viewport === v ? 'bg-[#36606F] text-white' : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                    >
                        {v}
                    </button>
                ))}
            </div>
        </div>
    );
}
