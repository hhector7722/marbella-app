'use client';

import React, { createContext, useContext } from 'react';
import { DesignContext } from '../types';
import { resolverReceta, cssVarsDelContexto } from '../design-context';
import { Recipe } from '../types';

// ============================================================
// SISTEMA DE PANTALLAS REALES — reproducción fiel de Marbella
// Las pantallas consumen un DesignContext (movidas resueltas).
// Sin contexto activo se renderiza la identidad real original.
// ============================================================

const DesignCtx = createContext<DesignContext | null>(null);

export function useDesign(): DesignContext {
    const ctx = useContext(DesignCtx);
    if (!ctx) return resolverReceta({});
    return ctx;
}

export function DesignProvider({ recipe, children }: { recipe: Recipe; children: React.ReactNode }) {
    const ctx = resolverReceta(recipe);
    const cssVars = cssVarsDelContexto(ctx);
    return (
        <DesignCtx.Provider value={ctx}>
            <div style={{ ...cssVars, fontSize: `calc(16px * var(--dl-type-scale))` } as React.CSSProperties} className="h-full">
                {children}
            </div>
        </DesignCtx.Provider>
    );
}

const sp = (n: number) => `calc(${n * 8}px * var(--dl-space))` as const;

// Marca de Marbella (de TOKENS.md: color.marca #36606F)
const BRAND = '#36606F';
const BRAND_PROFUNDO = '#2F5D6A';

export function marca(ctx: DesignContext, strong = false): string {
    if (ctx.brandPresence >= 2) return BRAND_PROFUNDO;
    if (ctx.brandPresence === 0) return '#27272A';
    return strong ? BRAND_PROFUNDO : BRAND;
}

function shadowClass(elevation: number): string {
    return elevation >= 3 ? 'shadow-2xl' : elevation === 2 ? 'shadow-xl' : elevation === 1 ? 'shadow-sm' : 'shadow-none border border-zinc-200';
}

// ---- Primitivas de Marbella, sensibles a movidas ----

export function TinyLabel({ children, tone = 'zinc-400' }: { children: React.ReactNode; tone?: string }) {
    return (
        <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-[0.12em] text-${tone}`}>
            {children}
        </span>
    );
}

export function SurfaceCard({ children, className = '', tone = 'white' }: { children: React.ReactNode; className?: string; tone?: string }) {
    const ctx = useDesign();
    const flat = ctx.surface >= 2;
    const soft = ctx.surface === 1;
    return (
        <div
            style={{ padding: sp(1.25), marginBottom: sp(1) }}
            className={`rounded-2xl ${shadowClass(ctx.elevation)} ${className} ${
                flat ? 'bg-transparent border-0' : soft ? `bg-${tone} border border-zinc-100` : `bg-${tone}`
            }`}
        >
            {children}
        </div>
    );
}

export function StatKPI({ label, value, accent = 'zinc-900', sub }: { label: string; value: string; accent?: string; sub?: string }) {
    const ctx = useDesign();
    const prominence = ctx.kpiProminence;
    const size = prominence >= 2 ? 'text-2xl md:text-4xl' : prominence === 1 ? 'text-xl md:text-3xl' : 'text-lg md:text-2xl';
    const accentCls = accent === 'marca' ? undefined : accent;
    const color = accent === 'marca' ? marca(ctx, prominence >= 1) : accentCls;
    return (
        <div className="flex flex-col items-center text-center">
            <span
                className={`${size} font-black tabular-nums leading-none tracking-tight ${accentCls ? '' : ''}`}
                style={accent === 'marca' ? { color } : undefined}
            >
                {value}
            </span>
            <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest mt-1 text-${accentCls ? (prominence >= 1 ? 'zinc-500' : 'zinc-400') : 'zinc-400'}`}>
                {label}
            </span>
            {sub && <span className="text-[10px] text-zinc-500 mt-0.5">{sub}</span>}
        </div>
    );
}

export function ActionPill({ label, kind = 'brand', onClick, disabled }: { label: string; kind?: 'brand' | 'success' | 'danger' | 'warning' | 'ghost'; onClick?: () => void; disabled?: boolean }) {
    const ctx = useDesign();
    const colors: Record<string, string> = {
        brand: `bg-[#36606F] text-white`,
        success: 'bg-emerald-500 text-white',
        danger: 'bg-rose-500 text-white',
        warning: 'bg-orange-500 text-white',
        ghost: 'bg-white/10 text-white',
    };
    const silent = ctx.buttonWeight === 'silent';
    const bold = ctx.buttonWeight === 'bold';
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{ minHeight: 48, padding: `0 ${sp(0.8)}` }}
            className={`flex items-center justify-center gap-1.5 rounded-xl font-black uppercase tracking-widest text-[9px] transition-all active:scale-95 disabled:opacity-40 ${
                silent
                    ? `bg-transparent ${kind === 'brand' ? 'text-[#36606F]' : 'text-zinc-500'} border border-zinc-200`
                    : bold
                    ? `${colors[kind]} text-sm px-4`
                    : `${colors[kind]}`
            }`}
        >
            {label}
        </button>
    );
}

export function AppTable({
    head,
    rows,
    accents,
    idPrefix,
}: {
    head: string[];
    rows: (string | React.ReactNode)[][];
    accents?: string[];
    idPrefix: string;
}) {
    const ctx = useDesign();
    const treatment = ctx.tableTreatment;
    const dense = ctx.space < 0.9;
    const rowPad = dense ? 'py-1.5' : 'py-2.5';

    if (treatment === 'flat') {
        return (
            <div className="w-full">
                <div className="flex items-center justify-between px-1 pb-1">
                    {head.map((h, i) => (
                        <span key={i} className="text-[9px] font-black uppercase tracking-widest text-zinc-400">{h}</span>
                    ))}
                </div>
                <div style={{ gap: sp(0.4) }} className="flex flex-col">
                    {rows.map((r, i) => (
                        <div key={`${idPrefix}-${i}`} className="flex items-center justify-between rounded-xl px-2 hover:bg-zinc-50 transition-colors">
                            {r.map((cell, j) => (
                                <span key={j} className={`${rowPad} text-sm font-bold tabular-nums ${accents?.[j] ?? 'text-zinc-900'}`}>
                                    {cell}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    const borderCls = treatment === 'borderless' ? 'border-0' : 'border border-zinc-200';

    return (
        <div className={`w-full overflow-hidden rounded-xl ${borderCls}`}>
            <table className="w-full text-left">
                <thead>
                    <tr className="bg-[#36606F] text-white">
                        {head.map((h, i) => (
                            <th key={i} className={`px-3 ${rowPad} text-[8px] md:text-[9px] font-black uppercase tracking-widest`}>
                                {h}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                    {rows.map((r, i) => (
                        <tr key={`${idPrefix}-${i}`} className="bg-white hover:bg-zinc-50/60 transition-colors">
                            {r.map((cell, j) => (
                                <td key={j} className={`px-3 ${rowPad} text-xs md:text-sm font-bold ${accents?.[j] ?? 'text-zinc-900'} tabular-nums`}>
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function AppInput({ label, placeholder }: { label: string; placeholder?: string }) {
    return (
        <label style={{ gap: sp(0.3) }} className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</span>
            <div
                style={{ minHeight: 48 }}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3.5 flex items-center text-xs text-zinc-400"
            >
                {placeholder || label}
            </div>
        </label>
    );
}
