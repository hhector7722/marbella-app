'use client';

import React, { useState } from 'react';
import {
    useDesign,
    SurfaceCard,
    StatKPI,
    ActionPill,
    AppTable,
    AppInput,
    TinyLabel,
    marca,
} from './system';
import type { DesignContext } from '../types';
import type { SandboxRoute } from '../types';
import { SANDBOX_ROUTES, useSandboxStore } from '../store';
import { toast } from 'sonner';

// ============================================================
// PANTALLAS DEL SANDBOX — representaciones fieles de Marbella
// Navegación simulada entre ellas. WRITE SIMULADO (toasts).
// READ REAL: datos realistas.
// ============================================================

export const SANDBOX_ROUTE_META: Record<
    SandboxRoute,
    { title: string; subtitle: string; grupo: string }
> = {
    '/master/dashboard': { title: 'Inicio', subtitle: 'Panel principal', grupo: 'Inicio' },
    '/dashboard': { title: 'Dashboard', subtitle: 'Panel principal', grupo: 'Inicio' },
    '/staff/dashboard': { title: 'Dashboard Staff', subtitle: 'Operativa diaria', grupo: 'Inicio' },
    '/recipes': { title: 'Recetas', subtitle: 'Carta y escandallos', grupo: 'Operación' },
    '/ingredients': { title: 'Ingredientes', subtitle: 'Precios y stock', grupo: 'Operación' },
    '/suppliers': { title: 'Proveedores', subtitle: 'Compras', grupo: 'Operación' },
    '/dashboard/ventas': { title: 'Ventas', subtitle: 'Ranking y tickets', grupo: 'Dashboard' },
    '/dashboard/history': { title: 'Cierres', subtitle: 'Historial de caja', grupo: 'Dashboard' },
    '/dashboard/movements': { title: 'Movimientos', subtitle: 'Entradas y salidas', grupo: 'Dashboard' },
    '/dashboard/labor': { title: 'Coste Laboral', subtitle: 'Personal y nóminas', grupo: 'Dashboard' },
    '/dashboard/insights': { title: 'Insights', subtitle: 'Análisis semanal', grupo: 'Dashboard' },
    '/dashboard/sala': { title: 'Radar de Sala', subtitle: 'Estado en vivo', grupo: 'Dashboard' },
    '/staff/history': { title: 'Mi Historial', subtitle: 'Horas y asistencias', grupo: 'Personal' },
    '/registros': { title: 'Fichar', subtitle: 'Registro de jornada', grupo: 'Personal' },
};

function simularEscritura(accion: string) {
    toast.info(`Modo sandbox · ${accion} simulada`, {
        description: 'Ningún dato real se ha modificado.',
        duration: 3200,
    });
}

// ============================================================
// NAVEGACIÓN GLOBAL DEL SANDBOX
// ============================================================

function useAppShell() {
    const ctx = useDesign();
    const route = useSandboxStore(s => s.route);
    const setRoute = useSandboxStore(s => s.setRoute);
    const goBack = useSandboxStore(s => s.goBack);
    const routeHistory = useSandboxStore(s => s.routeHistory);
    const brand = marca(ctx);

    const dashRoutes = SANDBOX_ROUTES.filter(r => r.grupo === 'Dashboard').map(r => r.id);
    const activeGroup = SANDBOX_ROUTES.find(r => r.id === route)?.grupo ?? 'Dashboard';

    return { ctx, route, setRoute, goBack, routeHistory, brand, dashRoutes, activeGroup };
}

// ---- Top Nav (escritorio) ----
function TopNav() {
    const { ctx, route, setRoute, goBack, routeHistory, dashRoutes, brand } = useAppShell();
    const items =
        ctx.navNoise >= 2 ? dashRoutes.slice(0, 3) : ctx.navNoise === 1 ? dashRoutes.slice(0, 4) : dashRoutes;

    return (
        <div className="hidden md:flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2.5">
                {routeHistory.length > 0 && (
                    <button
                        onClick={goBack}
                        style={{ minHeight: 48, minWidth: 48 }}
                        className="rounded-xl text-lg font-black text-zinc-500 hover:bg-zinc-100"
                        aria-label="Volver a la pantalla anterior"
                    >
                        ←
                    </button>
                )}
                <div className="h-9 w-9 rounded-2xl" style={{ background: brand }} />
                <div>
                    <div
                        className="font-black text-[10px] uppercase tracking-[0.18em]"
                        style={{ color: ctx.contrast >= 1 ? '#18181b' : '#71717a' }}
                    >
                        Marbella
                    </div>
                    <TinyLabel>{SANDBOX_ROUTE_META[route].title}</TinyLabel>
                </div>
            </div>
            {items.length > 0 && (
                <nav className="flex items-center gap-1.5">
                    {items.map(r => (
                        <button
                            key={r}
                            onClick={() => setRoute(r)}
                            style={{ minHeight: 48 }}
                            className={`px-4 rounded-2xl text-[9px] font-black uppercase tracking-[0.14em] transition-colors ${
                                route === r
                                    ? 'bg-[#36606F] text-white'
                                    : 'text-zinc-500 hover:bg-zinc-100'
                            }`}
                        >
                            {SANDBOX_ROUTE_META[r].title}
                        </button>
                    ))}
                </nav>
            )}
        </div>
    );
}

// ---- Bottom Nav (mobile) ----
function BottomNav() {
    const { route, setRoute, brand } = useAppShell();
    const tabs: SandboxRoute[] = ['/dashboard/ventas', '/dashboard/sala', '/registros', '/staff/history'];

    return (
        <div className="md:hidden absolute bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur pb-[max(8px,env(safe-area-inset-bottom))]">
            <div className="flex items-stretch justify-around px-1">
                {tabs.map(r => {
                    const active = route === r;
                    const label = SANDBOX_ROUTE_META[r].title;
                    return (
                        <button
                            key={r}
                            onClick={() => setRoute(r)}
                            style={{ minHeight: 64 }}
                            className="flex flex-1 flex-col items-center justify-center gap-0.5"
                        >
                            <div
                                className={`h-1.5 w-8 rounded-full transition-all ${
                                    active ? '' : 'bg-transparent'
                                }`}
                                style={active ? { background: brand } : undefined}
                            />
                            <span
                                className={`text-[9px] font-black uppercase tracking-[0.12em] ${
                                    active ? 'text-zinc-900' : 'text-zinc-400'
                                }`}
                            >
                                {label}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ---- Mobile Header ----
function MobileHeader() {
    const { ctx, route, goBack, routeHistory, brand, setRoute } = useAppShell();

    return (
        <div className="md:hidden flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 border-b border-zinc-100">
            <div className="flex items-center gap-2">
                {routeHistory.length > 0 && (
                    <button
                        onClick={goBack}
                        style={{ minHeight: 48, minWidth: 48 }}
                        className="rounded-xl text-zinc-500 text-lg font-black"
                    >
                        ←
                    </button>
                )}
                <div className="h-8 w-8 rounded-xl" style={{ background: brand }} />
                <div>
                    <div
                        className="font-black text-[9px] uppercase tracking-[0.16em]"
                        style={{ color: ctx.contrast >= 1 ? '#18181b' : '#71717a' }}
                    >
                        Marbella
                    </div>
                    <TinyLabel>{SANDBOX_ROUTE_META[route].title}</TinyLabel>
                </div>
            </div>
            <div className="flex items-center gap-1">
                <button
                    onClick={() => setRoute('/dashboard/insights')}
                    style={{ minHeight: 48, minWidth: 48 }}
                    className="rounded-xl text-zinc-500 text-[9px] font-black uppercase tracking-widest"
                >
                    ···
                </button>
            </div>
        </div>
    );
}

// ---- Shell principal ----
function SandboxShell({ children }: { children: React.ReactNode }) {
    const ctx = useDesign();
    return (
        <div className="flex h-full w-full flex-col bg-zinc-50 relative"
             style={{ paddingTop: 0 }}>
            <MobileHeader />
            <TopNav />
            <div className="min-h-0 flex-1 overflow-auto pb-24 md:pb-0">
                <div
                    className="h-full w-full"
                    style={{ padding: ctx.navNoise >= 2 ? 'calc(14px * var(--dl-space))' : undefined }}
                >
                    {children}
                </div>
            </div>
            <BottomNav />
        </div>
    );
}

// ============================================================
// DATOS SIMULADOS (READ REAL — realistas pero hardcodeados)
// ============================================================

const ventasProductos = [
    { p: 'Gin Tonic Premium', q: '24', v: '192 €' },
    { p: 'Café con leche', q: '41', v: '164 €' },
    { p: 'Tinto de verano', q: '33', v: '132 €' },
    { p: 'Cerveza local', q: '28', v: '126 €' },
    { p: 'Tabla de quesos', q: '9', v: '108 €' },
    { p: 'Tortilla', q: '12', v: '96 €' },
];

const movimientosDatos = [
    { concepto: 'Venta Mesa 12', tipo: 'Entrada', importe: '48,00 €', fecha: 'Hoy 13:40', pos: true },
    { concepto: 'Compra barra — Día', tipo: 'Salida', importe: '— 36,00 €', fecha: 'Hoy 10:15', pos: false },
    { concepto: 'Arqueo 09:00', tipo: 'Arqueo', importe: '300,00 €', fecha: 'Hoy 09:00', pos: true },
    { concepto: 'Venta terraza', tipo: 'Entrada', importe: '72,50 €', fecha: 'Hoy 12:05', pos: true },
    { concepto: 'Proveedor Aceites', tipo: 'Salida', importe: '— 210,00 €', fecha: 'Ayer', pos: false },
    { concepto: 'Caja chica', tipo: 'Salida', importe: '— 20,00 €', fecha: 'Ayer', pos: false },
    { concepto: 'Venta online', tipo: 'Entrada', importe: '39,90 €', fecha: 'Ayer', pos: true },
];

const cierresDatos = [
    { d: 'Ayer 9 Ago', ventas: '2.483 €', neta: '2.310 €', tm: '28,8 €', cash: '862 €', dif: '+ 4 €' },
    { d: '8 Ago', ventas: '1.920 €', neta: '1.780 €', tm: '26,2 €', cash: '612 €', dif: '0 €' },
    { d: '7 Ago', ventas: '3.014 €', neta: '2.802 €', tm: '31,4 €', cash: '1.040 €', dif: '— 8 €' },
    { d: '6 Ago', ventas: '2.210 €', neta: '2.060 €', tm: '27,9 €', cash: '740 €', dif: '+ 2 €' },
    { d: '5 Ago', ventas: '1.580 €', neta: '1.470 €', tm: '25,5 €', cash: '520 €', dif: '0 €' },
];

const laborTrabajadores = [
    { n: 'Marta López', hor: '164h', extra: '6h', coste: '2.410 €', rol: 'Barra' },
    { n: 'Carlos Ruiz', hor: '152h', extra: '4h', coste: '2.180 €', rol: 'Sala' },
    { n: 'Ana García', hor: '120h', extra: '0h', coste: '1.620 €', rol: 'Cocina' },
    { n: 'Pedro Martín', hor: '148h', extra: '8h', coste: '2.290 €', rol: 'Sala' },
    { n: 'Lucía Fernández', hor: '80h', extra: '2h', coste: '1.040 €', rol: 'Barra' },
];

const barrasSemana = [
    { d: 'L', v: 55 }, { d: 'M', v: 40 }, { d: 'X', v: 70 }, { d: 'J', v: 48 },
    { d: 'V', v: 92 }, { d: 'S', v: 100 }, { d: 'D', v: 35 },
];

const salaMesas = [
    { n: 1, estado: 'ocupada', tiempo: 18 },
    { n: 2, estado: 'ocupada', tiempo: 42 },
    { n: 3, estado: 'libre', tiempo: 0 },
    { n: 4, estado: 'ocupada', tiempo: 8 },
    { n: 5, estado: 'cerrando', tiempo: 62 },
    { n: 6, estado: 'libre', tiempo: 0 },
    { n: 7, estado: 'ocupada', tiempo: 25 },
    { n: 8, estado: 'ocupada', tiempo: 33 },
    { n: 9, estado: 'libre', tiempo: 0 },
    { n: 10, estado: 'reservada', tiempo: 0 },
    { n: 11, estado: 'ocupada', tiempo: 14 },
    { n: 12, estado: 'ocupada', tiempo: 51 },
];

const staffDias = [
    { d: 'Lun 4', e: '08:32', s: '17:10', h: '8h 38m', extra: '—' },
    { d: 'Mar 5', e: '08:40', s: '17:05', h: '8h 25m', extra: '—' },
    { d: 'Mié 6', e: '09:02', s: '—', h: '—', extra: 'Ausencia' },
    { d: 'Jue 7', e: '08:28', s: '18:12', h: '9h 44m', extra: '+1h 14m' },
    { d: 'Vie 8', e: '08:35', s: '17:30', h: '8h 55m', extra: '+25m' },
    { d: 'Sáb 9', e: '10:15', s: '22:40', h: '11h 25m', extra: '+2h 55m' },
];

// ============================================================
// PANTALLAS INDIVIDUALES
// ============================================================

function ScreenVentas() {
    const setRoute = useSandboxStore(s => s.setRoute);
    const [tab, setTab] = useState<'ventas' | 'productos' | 'horas'>('ventas');
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <SurfaceCard>
                    <div className="grid grid-cols-3 gap-2">
                        <StatKPI label="Ventas" value="2.483 €" accent="marca" />
                        <StatKPI label="Tickets" value="86" accent="zinc-900" />
                        <StatKPI label="Ticket medio" value="28,8 €" accent="emerald-500" />
                    </div>
                </SurfaceCard>

                <div className="flex flex-wrap gap-2 px-1">
                    <ActionPill label="Ventas" kind={tab === 'ventas' ? 'brand' : 'ghost'} onClick={() => setTab('ventas')} />
                    <ActionPill label="Productos" kind={tab === 'productos' ? 'brand' : 'ghost'} onClick={() => setTab('productos')} />
                    <ActionPill label="Horas" kind={tab === 'horas' ? 'brand' : 'ghost'} onClick={() => { setTab('horas'); setRoute('/dashboard/labor'); }} />
                    <ActionPill label="Exportar" kind="ghost" onClick={() => simularEscritura('Exportación XLSX')} />
                </div>

                <SurfaceCard>
                    <TinyLabel>{tab === 'horas' ? 'Horas · hoy' : tab === 'productos' ? 'Productos · hoy' : 'Ventas · hoy'}</TinyLabel>
                    <div className="flex flex-col" style={{ gap: 'calc(4px * var(--dl-space))' }}>
                        {ventasProductos.map((r, i) => (
                            <div
                                key={r.p}
                                className="flex items-center justify-between rounded-xl px-2 py-1.5 hover:bg-zinc-50"
                            >
                                <div className="flex items-center gap-2.5">
                                    <span className="text-[9px] font-black text-zinc-300">{i + 1}</span>
                                    <span className="text-xs font-black text-zinc-900">{r.p}</span>
                                </div>
                                <span className="flex items-center gap-2.5">
                                    <span className="text-[9px] text-zinc-400">×{r.q}</span>
                                    <span className="text-xs font-black tabular-nums text-zinc-900">{r.v}</span>
                                </span>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>
            </div>
        </SandboxShell>
    );
}

function ScreenMovements() {
    const [tipo, setTipo] = useState<'todos' | 'Entrada' | 'Salida' | 'Arqueo'>('todos');
    const filas = tipo === 'todos' ? movimientosDatos : movimientosDatos.filter(m => m.tipo === tipo);
    return (
        <SandboxShell>
            <div className="grid h-full grid-rows-[auto_auto_1fr] gap-0 md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <SurfaceCard tone="white">
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="Ingresos" value="4.312 €" accent="emerald-500" />
                        <StatKPI label="Gastos" value="2.140 €" accent="rose-500" />
                        <StatKPI label="Saldo" value="2.172 €" accent="marca" />
                        <StatKPI label="Diferencia" value="+ 2,1 %" accent="emerald-500" sub="vs ayer" />
                    </div>
                </SurfaceCard>

                <div className="flex gap-2 px-1">
                    <ActionPill label="Todas" kind={tipo === 'todos' ? 'brand' : 'ghost'} onClick={() => setTipo('todos')} />
                    <ActionPill label="Entrada" kind={tipo === 'Entrada' ? 'success' : 'ghost'} onClick={() => setTipo('Entrada')} />
                    <ActionPill label="Salida" kind={tipo === 'Salida' ? 'danger' : 'ghost'} onClick={() => setTipo('Salida')} />
                    <ActionPill label="Arqueo" kind={tipo === 'Arqueo' ? 'brand' : 'ghost'} onClick={() => setTipo('Arqueo')} />
                    <ActionPill label="Nuevo" kind="ghost" onClick={() => simularEscritura('Nuevo movimiento')} />
                </div>

                <div className="min-h-0 overflow-auto">
                    <AppTable
                        idPrefix="mov"
                        head={['Concepto', 'Tipo', 'Importe', 'Fecha']}
                        accents={['', '', 'text-zinc-900', 'text-zinc-400']}
                        rows={filas.map(m => [
                            <span key="c" className="text-zinc-900 font-black">{m.concepto}</span>,
                            m.tipo,
                            <span key="i" className={m.pos ? 'text-emerald-600' : 'text-rose-600'}>{m.importe}</span>,
                            m.fecha,
                        ])}
                    />
                </div>
            </div>
        </SandboxShell>
    );
}

function ScreenInsights() {
    const ctx = useDesign();
    const brand = marca(ctx);
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
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
                        {barrasSemana.map(b => (
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
                    <div className="mt-1.5 flex flex-col" style={{ gap: 'calc(3px * var(--dl-space))' }}>
                        {ventasProductos.slice(0, 3).map(r => (
                            <div key={r.p} className="flex justify-between text-xs">
                                <span className="font-black text-zinc-900">{r.p}</span>
                                <span className="font-black tabular-nums text-zinc-500">{r.v}</span>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>
            </div>
        </SandboxShell>
    );
}

function ScreenHistory() {
    const ctx = useDesign();
    const brand = marca(ctx);
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <SurfaceCard>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="Ventas (semana)" value="11.207 €" accent="marca" />
                        <StatKPI label="Cierres" value="5" accent="zinc-900" />
                        <StatKPI label="Descuadre" value="— 2 €" accent="rose-500" />
                        <StatKPI label="Cierre hoy" value="pendiente" accent="zinc-500" />
                    </div>
                </SurfaceCard>

                <div className="flex gap-2 px-1">
                    <ActionPill label="Julio 2026" kind="brand" />
                    <ActionPill label="Exportar" kind="ghost" onClick={() => simularEscritura('Exportar historial')} />
                    <ActionPill label="Cerrar caja" kind="success" onClick={() => simularEscritura('Cierre de caja')} />
                </div>

                <div className="min-h-0 overflow-auto">
                    <AppTable
                        idPrefix="cierres"
                        head={['Día', 'Ventas', 'Neta', 'T. Medio', 'Efectivo', 'Descuadre']}
                        accents={['text-zinc-900', 'text-zinc-900', '', '', '', '']}
                        rows={cierresDatos.map(c => [
                            <span key="d" className="font-black text-zinc-900">{c.d}</span>,
                            <span key="v" className="font-black tabular-nums">{c.ventas}</span>,
                            c.neta,
                            c.tm,
                            c.cash,
                            <span
                                key="dif"
                                className={`font-black tabular-nums ${
                                    c.dif.startsWith('—') ? 'text-rose-500' : c.dif.startsWith('+') ? 'text-emerald-600' : 'text-zinc-500'
                                }`}
                            >
                                {c.dif}
                            </span>,
                        ])}
                    />
                </div>

                <div className="rounded-2xl p-5 text-center text-white md:mx-1" style={{ background: brand, boxShadow: ctx.elevation >= 2 ? '0 20px 40px -20px rgba(54,96,111,0.45)' : undefined }}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/60">Cierre pendiente · Hoy</div>
                    <div className="text-3xl font-black tracking-tight mt-1">1.824,30 €</div>
                    <div className="mt-3 flex justify-center gap-2">
                        <button
                            onClick={() => simularEscritura('Cierre de caja')}
                            style={{ minHeight: 48 }}
                            className="rounded-xl bg-white px-4 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-900"
                        >
                            Iniciar recuento
                        </button>
                    </div>
                </div>
            </div>
        </SandboxShell>
    );
}

function ScreenLabor() {
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <SurfaceCard>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="Coste laboral" value="9.540 €" accent="marca" />
                        <StatKPI label="Personal" value="5" accent="zinc-900" />
                        <StatKPI label="Horas extras" value="20h" accent="rose-500" />
                        <StatKPI label="% sobre venta" value="26,8 %" accent="zinc-500" />
                    </div>
                </SurfaceCard>

                <div className="flex gap-2 px-1">
                    <ActionPill label="Agosto 2026" kind="brand" />
                    <ActionPill label="Semana" kind="ghost" />
                    <ActionPill label="Simular" kind="ghost" onClick={() => simularEscritura('Simulación de nómina')} />
                </div>

                <div className="min-h-0 overflow-auto">
                    <AppTable
                        idPrefix="labor"
                        head={['Trabajador', 'Rol', 'Horas', 'Extras', 'Coste']}
                        accents={['text-zinc-900', 'text-zinc-500', 'text-zinc-900', '', 'text-zinc-900']}
                        rows={laborTrabajadores.map(t => [
                            <span key="n" className="font-black text-zinc-900">{t.n}</span>,
                            t.rol,
                            <span key="h" className="font-black tabular-nums">{t.hor}</span>,
                            <span key="e" className={t.extra !== '0h' ? 'text-rose-500 font-bold tabular-nums' : 'text-zinc-400'}>{t.extra}</span>,
                            <span key="c" className="font-black tabular-nums">{t.coste}</span>,
                        ])}
                    />
                </div>
            </div>
        </SandboxShell>
    );
}

function ScreenSala() {
    const ctx = useDesign();
    const estadoColor: Record<string, string> = {
        libre: '#22c55e',
        ocupada: '#3b82f6',
        cerrando: '#f59e0b',
        reservada: '#8b5cf6',
    };
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <SurfaceCard>
                    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                        <StatKPI label="En sala" value="47" accent="marca" />
                        <StatKPI label="Ocupadas" value="8 / 12" accent="zinc-900" />
                        <StatKPI label="Pendientes" value="3" accent="rose-500" />
                        <StatKPI label="T. espera" value="6 min" accent="zinc-500" />
                    </div>
                </SurfaceCard>

                <div className="flex flex-wrap gap-2 px-1">
                    <ActionPill label="Interior" kind="brand" />
                    <ActionPill label="Terraza" kind="ghost" />
                    <ActionPill label="Eventos" kind="ghost" />
                    <ActionPill label="Aviso" kind="warning" onClick={() => simularEscritura('Aviso a cocina')} />
                </div>

                <SurfaceCard>
                    <TinyLabel>Mapa de sala</TinyLabel>
                    <div className="mt-2 grid grid-cols-4 gap-2">
                        {salaMesas.map(m => (
                            <div
                                key={m.n}
                                className="relative aspect-square rounded-2xl border-2 flex flex-col items-center justify-center cursor-pointer transition-transform hover:scale-[1.02]"
                                style={{
                                    borderColor: estadoColor[m.estado],
                                    background: m.estado === 'libre' ? 'white' : `${estadoColor[m.estado]}10`,
                                    boxShadow: ctx.elevation >= 1 ? '0 4px 12px -4px rgba(0,0,0,0.1)' : undefined,
                                }}
                                onClick={() => simularEscritura(`Abrir mesa ${m.n}`)}
                            >
                                <div
                                    className="h-2 w-2 rounded-full absolute top-2 right-2"
                                    style={{ background: estadoColor[m.estado] }}
                                />
                                <span className="text-sm font-black text-zinc-900">M{m.n}</span>
                                {m.tiempo > 0 && (
                                    <span className="text-[9px] font-bold text-zinc-500 mt-0.5">{m.tiempo}m</span>
                                )}
                                {m.estado === 'reservada' && (
                                    <span className="text-[8px] font-black uppercase tracking-widest text-violet-500">RESV</span>
                                )}
                            </div>
                        ))}
                    </div>
                </SurfaceCard>
            </div>
        </SandboxShell>
    );
}

function ScreenStaffHistory() {
    const setRoute = useSandboxStore(s => s.setRoute);
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <div className="rounded-2xl p-6 text-center" style={{ background: marca(useDesign()), color: 'white' }}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/60">Julio 2026</div>
                    <div className="text-3xl font-black tracking-tight mt-1">168h 32m</div>
                    <div className="mt-1 text-[10px] font-bold text-white/70">Saldo: + 3h 12m</div>
                </div>

                <div className="flex gap-2 px-1">
                    <ActionPill label="Julio 2026" kind="brand" />
                    <ActionPill label="Semana" kind="ghost" />
                    <ActionPill label="Incidencia" kind="ghost" onClick={() => simularEscritura('Incidencia')} />
                </div>

                <SurfaceCard>
                    <TinyLabel>Esta semana</TinyLabel>
                    <div className="mt-2 flex flex-col" style={{ gap: 'calc(4px * var(--dl-space))' }}>
                        {staffDias.map(d => (
                            <div
                                key={d.d}
                                className="flex items-center justify-between rounded-xl px-3 py-2 hover:bg-zinc-50"
                                onClick={() => simularEscritura('Ver detalle día')}
                            >
                                <div className="flex flex-col">
                                    <span className="text-xs font-black text-zinc-900">{d.d}</span>
                                    <span className="text-[9px] font-bold text-zinc-500">
                                        Entrada {d.e} · Salida {d.s}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end">
                                    <span className="text-xs font-black tabular-nums text-zinc-900">{d.h}</span>
                                    <span
                                        className={`text-[9px] font-black tabular-nums ${
                                            d.extra.startsWith('+')
                                                ? 'text-emerald-600'
                                                : d.extra === 'Ausencia'
                                                ? 'text-rose-500'
                                                : 'text-zinc-400'
                                        }`}
                                    >
                                        {d.extra}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </SurfaceCard>

                <div className="px-1">
                    <ActionPill label="Ir a Registros (fichar)" kind="brand" onClick={() => setRoute('/registros')} />
                </div>
            </div>
        </SandboxShell>
    );
}

function ScreenRegistros() {
    const ctx = useDesign();
    const brand = marca(ctx);
    const [tipo, setTipo] = useState('');
    const [fecha, setFecha] = useState('10/08/2026');
    const [observaciones, setObservaciones] = useState('');
    return (
        <SandboxShell>
            <div className="flex h-full flex-col md:px-4" style={{ gap: 'calc(10px * var(--dl-space))' }}>
                <div
                    className="rounded-2xl p-6 text-center text-white"
                    style={{
                        background: brand,
                        boxShadow: ctx.elevation >= 2 ? '0 20px 40px -20px rgba(54,96,111,0.5)' : undefined,
                    }}
                >
                    <div className="text-[8px] font-black uppercase tracking-widest text-white/60">
                        Turno de hoy · viernes
                    </div>
                    <div className="text-4xl font-black tracking-tight mt-2">08:42</div>
                    <div className="mt-2 text-[10px] font-bold text-white/70">
                        Única entrada registrada hoy
                    </div>
                    <div className="mt-4 flex justify-center gap-2">
                        <button
                            onClick={() => simularEscritura('Fichaje de SALIDA')}
                            style={{ minHeight: 48 }}
                            className="rounded-xl bg-white px-6 text-[9px] font-black uppercase tracking-[0.14em] text-zinc-900"
                        >
                            Fichar salida
                        </button>
                        <button
                            onClick={() => simularEscritura('Pausa')}
                            style={{ minHeight: 48 }}
                            className="rounded-xl bg-white/15 px-4 text-[9px] font-black uppercase tracking-[0.14em] text-white"
                        >
                            Pausa
                        </button>
                    </div>
                </div>

                <SurfaceCard>
                    <TinyLabel>Registrar incidencia</TinyLabel>
                    <div className="mt-2 flex flex-col" style={{ gap: 'calc(8px * var(--dl-space))' }}>
                        <AppInput label="Tipo" placeholder="Horas extra / Ausencia / Cambio" value={tipo} onChange={setTipo} />
                        <AppInput label="Fecha" placeholder="10/08/2026" value={fecha} onChange={setFecha} />
                        <AppInput label="Observaciones" placeholder="Nota del trabajador…" value={observaciones} onChange={setObservaciones} multiline />
                    </div>
                    <div className="mt-3 flex gap-2">
                        <button
                            onClick={() => simularEscritura('Guardar incidencia')}
                            style={{ minHeight: 48 }}
                            className="rounded-xl bg-[#36606F] px-4 text-[9px] font-black uppercase tracking-widest text-white"
                        >
                            Guardar
                        </button>
                        <ActionPill label="Descartar" kind="ghost" />
                    </div>
                </SurfaceCard>
            </div>
        </SandboxShell>
    );
}

// ============================================================
// REGISTRO DE RUTAS → COMPONENTE
// ============================================================

export const SANDBOX_SCREENS: Partial<Record<SandboxRoute, React.FC>> = {
    '/dashboard/ventas': ScreenVentas,
    '/dashboard/history': ScreenHistory,
    '/dashboard/movements': ScreenMovements,
    '/dashboard/labor': ScreenLabor,
    '/dashboard/insights': ScreenInsights,
    '/dashboard/sala': ScreenSala,
    '/staff/history': ScreenStaffHistory,
    '/registros': ScreenRegistros,
};

export type { DesignContext };
