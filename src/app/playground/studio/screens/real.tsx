'use client';

import React from 'react';
import { useDesign, SurfaceCard, StatKPI, ActionPill, AppTable, AppInput, TinyLabel, marca } from './system';
import { DesignContext } from '../types';

// ============================================================
// PANTALLAS REALES DE MARBELLA (snapshot seguro de datos reales)
// Réplicas visuales de rutas existentes del dashboard.
// Consumen un DesignContext; sin él, muestran la identidad original.
// ============================================================

export type ScreenId = 'movimientos' | 'ventas' | 'insights' | 'fichaje';

function useAppShell() {
    const ctx = useDesign();
    const nav: { label: string; active?: boolean }[] = [
        { label: 'Dashboard', active: false },
        { label: 'Movimientos', active: true },
        { label: 'Ventas' },
        { label: 'Insights' },
    ];
    const navItems =
        ctx.navNoise >= 2
            ? nav.slice(0, 2)
            : ctx.navNoise === 1
            ? nav.filter(n => !n.active)
            : nav;
    const brand = marca(ctx);
    return { ctx, navItems, brand };
}

function AppChrome({ title, children }: { title: string; children: React.ReactNode }) {
    const { ctx, navItems, brand } = useAppShell();
    return (
        <div className="flex h-full flex-col bg-zinc-50" style={{ padding: `calc(14px * var(--dl-space))` }}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-xl" style={{ background: brand }} />
                    <div>
                        <div className="font-black text-[9px] uppercase tracking-widest" style={{ color: ctx.contrast >= 1 ? '#18181b' : '#71717a' }}>
                            Marbella
                        </div>
                        <TinyLabel>{title}</TinyLabel>
                    </div>
                </div>
                {navItems.length > 0 && (
                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map(n => (
                            <button
                                key={n.label}
                                style={{ minHeight: 48 }}
                                className={`px-3 text-[9px] font-black uppercase tracking-widest rounded-xl transition-colors ${
                                    n.active ? 'bg-[#36606F] text-white' : 'text-zinc-500 hover:bg-zinc-100'
                                }`}
                            >
                                {n.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <div className="flex-1 overflow-hidden" style={{ paddingTop: `calc(12px * var(--dl-space))` }}>
                {children}
            </div>
        </div>
    );
}

// ---- Movimientos: tabla densa con saldo (origin: dashboard/movements) ----

const movimientosDatos = [
    { concepto: 'Venta Mesa 12', tipo: 'Entrada', importe: '48,00 €', fecha: 'Hoy 13:40', pos: true },
    { concepto: 'Compra barra — Día', tipo: 'Salida', importe: '— 36,00 €', fecha: 'Hoy 10:15', pos: false },
    { concepto: 'Arqueo 09:00', tipo: 'Arqueo', importe: '300,00 €', fecha: 'Hoy 09:00', pos: true },
    { concepto: 'Venta terraza', tipo: 'Entrada', importe: '72,50 €', fecha: 'Hoy 12:05', pos: true },
    { concepto: 'Proveedor Aceites', tipo: 'Salida', importe: '— 210,00 €', fecha: 'Ayer', pos: false },
    { concepto: 'Caja chica', tipo: 'Salida', importe: '— 20,00 €', fecha: 'Ayer', pos: false },
    { concepto: 'Venta online', tipo: 'Entrada', importe: '39,90 €', fecha: 'Ayer', pos: true },
];

export function ScreenMovimientos() {
    return (
        <AppChrome title="Movimientos">
            <div className="grid h-full grid-rows-[auto_auto_1fr] gap-0" style={{ gap: `calc(10px * var(--dl-space))` }}>
                <SurfaceCard tone="white">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="Ingresos" value="4.312 €" accent="emerald-500" />
                        <StatKPI label="Gastos" value="2.140 €" accent="rose-500" />
                        <StatKPI label="Saldo" value="2.172 €" accent="marca" />
                        <StatKPI label="Diferencia" value="+ 2,1 %" accent="emerald-500" sub="vs ayer" />
                    </div>
                </SurfaceCard>

                <div className="flex gap-2">
                    <ActionPill label="Entrada" kind="success" />
                    <ActionPill label="Salida" kind="danger" />
                    <ActionPill label="Arqueo" kind="brand" />
                </div>

                <div className="min-h-0 overflow-auto">
                    <AppTable
                        idPrefix="mov"
                        head={['Concepto', 'Tipo', 'Importe', 'Fecha']}
                        accents={['', '', 'text-zinc-900', 'text-zinc-400']}
                        rows={movimientosDatos.map(m => [
                            <span key="c" className="text-zinc-900 font-black">{m.concepto}</span>,
                            m.tipo,
                            <span key="i" className={m.pos ? 'text-emerald-600' : 'text-rose-600'}>{m.importe}</span>,
                            m.fecha,
                        ])}
                    />
                </div>
            </div>
        </AppChrome>
    );
}

// ---- Ventas: KPIs + ranking (origin: dashboard/ventas) ----

const ventasDatos = [
    { p: 'Gin Tonic Premium', q: '24', v: '192 €' },
    { p: 'Café con leche', q: '41', v: '164 €' },
    { p: 'Tinto de verano', q: '33', v: '132 €' },
    { p: 'Cerveza local', q: '28', v: '126 €' },
    { p: 'Tabla de quesos', q: '9', v: '108 €' },
    { p: 'Tortilla', q: '12', v: '96 €' },
];

export function ScreenVentas() {
    return (
        <AppChrome title="Ventas">
            <div className="flex h-full flex-col" style={{ gap: `calc(10px * var(--dl-space))` }}>
                <SurfaceCard>
                    <div className="grid grid-cols-3 gap-2">
                        <StatKPI label="Ventas" value="2.483 €" accent="marca" />
                        <StatKPI label="Tickets" value="86" accent="zinc-900" />
                        <StatKPI label="Ticket medio" value="28,8 €" accent="emerald-500" />
                    </div>
                </SurfaceCard>

                <SurfaceCard>
                    <TinyLabel>Productos</TinyLabel>
                    <div className="flex flex-col" style={{ gap: `calc(4px * var(--dl-space))` }}>
                        {ventasDatos.map((r, i) => (
                            <div key={r.p} className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-zinc-50">
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[9px] font-black text-zinc-300">{i + 1}</span>
                                    <span className="text-xs font-black text-zinc-900">{r.p}</span>
                                </div>
                                <span className="flex items-center gap-2.5">
                                    <span className="text-[9px] text-zinc-400">x{r.q}</span>
                                    <span className="text-xs font-black tabular-nums text-zinc-900">{r.v}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>

                <div className="flex gap-2">
                    <ActionPill label="Ventas" kind="brand" />
                    <ActionPill label="Horas" kind="ghost" />
                    <ActionPill label="Ranking" kind="ghost" />
                </div>
            </div>
        </AppChrome>
    );
}

// ---- Insights: analítica de semana con protagonismo de KPIs ----

const barras = [
    { d: 'L', v: 55 }, { d: 'M', v: 40 }, { d: 'X', v: 70 }, { d: 'J', v: 48 }, { d: 'V', v: 92 }, { d: 'S', v: 100 }, { d: 'D', v: 35 },
];

export function ScreenInsights() {
    const ctx = useDesign();
    const brand = marca(ctx);
    return (
        <AppChrome title="Insights">
            <div className="flex h-full flex-col" style={{ gap: `calc(10px * var(--dl-space))` }}>
                <SurfaceCard>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="Ingresos" value="9.410 €" accent="marca" />
                        <StatKPI label="Margen" value="61 %" accent="emerald-500" />
                        <StatKPI label="Tickets" value="312" accent="zinc-900" />
                        <StatKPI label="Ticket medio" value="30,1 €" accent="emerald-500" />
                    </div>
                </SurfaceCard>

                <SurfaceCard>
                    <div className="mb-2 flex items-center justify-between">
                        <TinyLabel>Actividad de la semana</TinyLabel>
                        <span className="text-[9px] font-bold text-zinc-400">+18 % vs anterior</span>
                    </div>
                    <div className="flex items-end justify-between gap-1.5" style={{ height: `calc(110px * var(--dl-space))` }}>
                        {barras.map(b => (
                            <div key={b.d} className="flex flex-1 flex-col items-center gap-1">
                                <div
                                    className="w-full rounded-t-lg"
                                    style={{
                                        height: `${b.v}%`,
                                        background: b.v >= 90 ? brand : `${brand}66`,
                                        borderRadius: ctx.elevation >= 1 ? '12px 12px 4px 4px' : '6px',
                                    }}
                                />
                                <span className="text-[8px] font-black text-zinc-400">{b.d}</span>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>

                <SurfaceCard>
                    <TinyLabel>Top productos</TinyLabel>
                    <div className="mt-1.5 flex flex-col" style={{ gap: `calc(3px * var(--dl-space))` }}>
                        {ventasDatos.slice(0, 3).map(r => (
                            <div key={r.p} className="flex justify-between text-xs">
                                <span className="font-black text-zinc-900">{r.p}</span>
                                <span className="font-black tabular-nums text-zinc-500">{r.v}</span>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>
            </div>
        </AppChrome>
    );
}

// ---- Fichaje: pantalla estructuralmente distinta (formulario) ----

export function ScreenFichaje() {
    const ctx = useDesign();
    const brand = marca(ctx);
    return (
        <AppChrome title="Registro">
            <div className="flex h-full flex-col" style={{ gap: `calc(10px * var(--dl-space))` }}>
                <div className="rounded-2xl p-6 text-center text-white" style={{ background: brand, boxShadow: ctx.elevation >= 2 ? '0 20px 40px -20px rgba(54,96,111,0.5)' : undefined }}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/60">Turno de hoy</div>
                    <div className="text-3xl font-black tracking-tight">08:42</div>
                    <div className="mt-1 text-[10px] font-bold text-white/70">12h 18m registradas</div>
                </div>

                <SurfaceCard>
                    <TinyLabel>Registro de incidencia</TinyLabel>
                    <div className="mt-2 flex flex-col" style={{ gap: `calc(8px * var(--dl-space))` }}>
                        <AppInput label="Tipo" placeholder="Horas extra / Ausencia / Cambio" />
                        <AppInput label="Fecha" placeholder="10/08/2026" />
                        <AppInput label="Observaciones" placeholder="Nota del trabajador…" />
                    </div>
                    <div className="mt-3 flex gap-2">
                        <ActionPill label="Guardar" kind="brand" />
                        <ActionPill label="Descartar" kind="ghost" />
                    </div>
                </SurfaceCard>
            </div>
        </AppChrome>
    );
}

// ---- Registro de pantallas ----

export const SCREEN_REGISTRY: Record<ScreenId, { title: string; route: string; component: React.FC; tipo: 'tabla' | 'listado' | 'analitica' | 'formulario' }> = {
    movimientos: { title: 'Movimientos', route: '/dashboard/movements', component: ScreenMovimientos, tipo: 'tabla' },
    ventas: { title: 'Ventas', route: '/dashboard/ventas', component: ScreenVentas, tipo: 'listado' },
    insights: { title: 'Insights', route: '/dashboard/insights', component: ScreenInsights, tipo: 'analitica' },
    fichaje: { title: 'Registro', route: '/dashboard/staff/registros', component: ScreenFichaje, tipo: 'formulario' },
};

export const SCREEN_IDS = Object.keys(SCREEN_REGISTRY) as ScreenId[];

export type { DesignContext };
