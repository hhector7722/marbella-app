'use client';

import React from 'react';
import { toast, Toaster } from 'sonner';
import { useSandboxStore } from './store';
import { SandboxView, RutaBadge } from './components/SandboxView';
import { BarraIntencion } from './components/BarraIntencion';
import { DesignLanguage } from './components/DesignLanguage';
import { ModoAbsorber } from './components/ModoAbsorber';
import { HojaContacto } from './components/HojaContacto';
import { Recipe } from './types';
import { disableSandboxRuntime } from '@/lib/sandbox/client';
import { ValidationPanel } from './components/ValidationPanel';

// ============================================================
// MARBELLA DESIGN STUDIO — SANDBOX VISUAL DE MARBELLA APP
// El lienzo es Marbella App real. La estética es global.
// Navegas, pruebas, comparas, guardas: sin tocar producción.
// ============================================================

export default function StudioPage() {
    const esteticas = useSandboxStore(s => s.esteticas);
    const activeId = useSandboxStore(s => s.activeEsteticaId);
    const esteticaActiva = esteticas.find(e => e.id === activeId);
    const viewport = useSandboxStore(s => s.viewport);
    const setViewport = useSandboxStore(s => s.setViewport);
    const setActiveEstetica = useSandboxStore(s => s.setActiveEstetica);
    const duplicateEstetica = useSandboxStore(s => s.duplicateEstetica);
    const createEstetica = useSandboxStore(s => s.createEstetica);
    const deleteEstetica = useSandboxStore(s => s.deleteEstetica);
    const renameEstetica = useSandboxStore(s => s.renameEstetica);

    const [vista, setVista] = React.useState<'sandbox' | 'comparar' | 'contacto' | 'lenguaje' | 'absorber'>('sandbox');
    const [panelAbierto, setPanelAbierto] = React.useState(false);
    const [esteticaB, setEsteticaB] = React.useState<string>('est-editorial-v1');
    const [editandoId, setEditandoId] = React.useState<string | null>(null);
    const [editNombre, setEditNombre] = React.useState('');
    const [frasePending, setFrasePending] = React.useState<{ recipe: Recipe; texto: string } | null>(null);
    const [diagnosticoAbierto, setDiagnosticoAbierto] = React.useState(false);

    React.useEffect(() => {
        document.cookie = 'marbella-sandbox=1; path=/; SameSite=Lax';

        const handleSandboxWrite = (event: Event) => {
            const detail = (event as CustomEvent<{ operation?: string; resource?: string }>).detail;
            const target = detail?.resource ? ` · ${detail.resource}` : '';
            toast.info('Acción simulada: no se ha modificado Marbella real', {
                description: `${detail?.operation ?? 'Escritura'}${target}`,
            });
        };

        window.addEventListener('marbella-sandbox-write', handleSandboxWrite);
        return () => {
            window.removeEventListener('marbella-sandbox-write', handleSandboxWrite);
            document.cookie = 'marbella-sandbox=; Max-Age=0; path=/; SameSite=Lax';
            disableSandboxRuntime();
        };
    }, []);

    const nombreActivo = esteticaActiva?.name ?? 'Marbella Original';

    const crearDesdeFrase = (recipe: Recipe, texto: string) => {
        const base = esteticaActiva ?? esteticas[0];
        const recipeCompleta: Recipe = { ...(base?.recipe ?? {}), ...recipe };
        createEstetica(
            `${base.name} · ${texto.slice(0, 32) || 'variación'}`,
            recipeCompleta,
            { description: `Variación generada desde: «${texto}»`, parentId: base.id }
        );
    };

    const openRename = (id: string, name: string) => {
        setEditandoId(id);
        setEditNombre(name);
    };
    const confirmarRename = () => {
        if (editandoId && editNombre.trim()) renameEstetica(editandoId, editNombre.trim());
        setEditandoId(null);
    };

    const frameClass =
        viewport === 'mobile'
            ? 'mx-auto w-[390px]'
            : viewport === 'tablet'
            ? 'mx-auto w-full max-w-[768px]'
            : 'w-full';

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-white">
            <Toaster position="top-center" richColors closeButton />

            {/* Top bar microscópica — la app es lo protagonista */}
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 px-3 py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
                    <button
                        onClick={() => setPanelAbierto(true)}
                        style={{ minHeight: 44 }}
                        className="max-w-[42vw] shrink-0 truncate rounded-xl bg-zinc-800/70 px-2.5 text-[9px] font-black uppercase tracking-widest text-zinc-300 hover:text-white"
                    >
                        {nombreActivo}
                    </button>
                    <span className="hidden rounded-lg bg-orange-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-orange-300 sm:inline">
                        Exploración · escritura bloqueada
                    </span>
                    <span className="shrink-0"><RutaBadge /></span>
                    {vista === 'comparar' && (
                        <>
                            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">vs</span>
                            <select
                                value={esteticaB}
                                onChange={e => setEsteticaB(e.target.value)}
                                className="min-h-11 rounded-xl border border-zinc-800 bg-zinc-900 px-2 text-[9px] font-black uppercase tracking-widest text-zinc-300"
                            >
                                {esteticas.map(e => (
                                    <option key={e.id} value={e.id}>{e.name}</option>
                                ))}
                            </select>
                        </>
                    )}
                    {vista === 'contacto' && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Hoja de contacto</span>
                    )}
                    {vista === 'lenguaje' && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Design Language</span>
                    )}
                    {vista === 'absorber' && (
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Inspiración</span>
                    )}
                </div>
                <div className="flex max-w-[68vw] shrink-0 items-center gap-1 overflow-x-auto">
                    {(vista === 'sandbox' || vista === 'comparar') && (
                        <div className="flex items-center gap-1">
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
                    )}
                    <button
                        onClick={() => setVista(vista === 'lenguaje' ? 'sandbox' : 'lenguaje')}
                        style={{ minHeight: 44 }}
                        className="rounded-lg bg-zinc-800/60 px-2.5 text-[9px] font-black uppercase tracking-widest text-zinc-400 hover:text-white"
                    >
                        {vista === 'lenguaje' ? 'Sandbox' : 'Design Language'}
                    </button>
                    <button
                        onClick={() => setVista(vista === 'comparar' ? 'sandbox' : 'comparar')}
                        style={{ minHeight: 44 }}
                        className={`rounded-lg bg-zinc-800/60 px-2.5 text-[9px] font-black uppercase tracking-widest ${vista === 'comparar' ? 'bg-[#36606F] text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                        {vista === 'comparar' ? 'Sandbox' : 'Comparar'}
                    </button>
                    <button
                        onClick={() => setVista(vista === 'contacto' ? 'sandbox' : 'contacto')}
                        style={{ minHeight: 44 }}
                        className={`rounded-lg bg-zinc-800/60 px-2.5 text-[9px] font-black uppercase tracking-widest ${vista === 'contacto' ? 'bg-[#36606F] text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                        {vista === 'contacto' ? 'Sandbox' : 'Hoja de contacto'}
                    </button>
                    <button
                        onClick={() => setVista(vista === 'absorber' ? 'sandbox' : 'absorber')}
                        style={{ minHeight: 44 }}
                        className={`rounded-lg bg-zinc-800/60 px-2.5 text-[9px] font-black uppercase tracking-widest ${vista === 'absorber' ? 'bg-[#36606F] text-white' : 'text-zinc-400 hover:text-white'}`}
                    >
                        {vista === 'absorber' ? 'Sandbox' : 'Inspiración'}
                    </button>
                    <button
                        onClick={() => setDiagnosticoAbierto(true)}
                        style={{ minHeight: 44 }}
                        className="rounded-lg bg-amber-500/10 px-2.5 text-[9px] font-black uppercase tracking-widest text-amber-300 hover:text-amber-200"
                    >
                        Validación
                    </button>
                    <a
                        href="/dashboard/ventas"
                        style={{ minHeight: 44 }}
                        className="rounded-lg bg-red-500/10 px-2.5 text-[9px] font-black uppercase tracking-widest text-red-300 hover:text-red-200"
                    >
                        Salir
                    </a>
                </div>
            </div>

            {/* Canvas */}
            <main className="relative flex-1 overflow-auto bg-zinc-900/30">
                {vista === 'sandbox' && (
                    <div className={`${frameClass} h-full`}>
                        <SandboxView esteticaId={activeId} label={null} />
                    </div>
                )}
                {vista === 'comparar' && (
                    <div className="flex h-full w-full gap-0.5 p-0.5">
                        <div className="flex-1 overflow-auto">
                            <div className={viewport === 'mobile' ? 'mx-auto h-full w-[380px]' : 'h-full w-full'}>
                                <SandboxView esteticaId={activeId} label="A" />
                            </div>
                        </div>
                        <div className="flex-1 overflow-auto">
                            <div className={viewport === 'mobile' ? 'mx-auto h-full w-[380px]' : 'h-full w-full'}>
                                <SandboxView esteticaId={esteticaB} label="B" />
                            </div>
                        </div>
                    </div>
                )}
                {vista === 'contacto' && <HojaContacto onExplorar={() => setVista('sandbox')} />}
                {vista === 'lenguaje' && <DesignLanguage />}
                {vista === 'absorber' && <ModoAbsorber onCreada={() => setVista('sandbox')} />}
            </main>

            {/* Overlay: barra de intención (modificar con frases → nueva estética) */}
            {vista === 'sandbox' && (
                <div className="border-t border-zinc-800/60 bg-zinc-950/95 p-2.5">
                    <BarraIntencion
                        placeholder="Modificar la estética con una frase… «Quiero que respire»"
                        onAplicar={(recipe, texto) => setFrasePending({ recipe, texto })}
                    />
                </div>
            )}

            {frasePending && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60" onClick={() => setFrasePending(null)}>
                    <div className="w-full max-w-lg rounded-t-2xl border border-zinc-800 bg-zinc-900 p-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-sm font-black text-zinc-100">Frase traducida</h3>
                        <div className="mt-2 text-[11px] text-zinc-400">
                            {Object.entries(frasePending.recipe).length === 0
                                ? 'No reconocí una movida clara. Prueba aire, superficies, densidad, contraste, navegación o KPIs.'
                                : Object.entries(frasePending.recipe).map(([k, v]) => `${k}: ${v}`).join(' · ')}
                        </div>
                        <p className="mt-1 text-[10px] text-zinc-500">Se creará una NUEVA estética. La actual se conserva.</p>
                        <div className="mt-4 flex justify-end gap-2">
                            <button onClick={() => setFrasePending(null)} className="rounded-xl bg-zinc-800 px-3 py-2 text-[9px] font-black uppercase text-zinc-300">
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    crearDesdeFrase(frasePending.recipe, frasePending.texto || 'variación');
                                    setFrasePending(null);
                                }}
                                className="rounded-xl bg-[#36606F] px-3 py-2 text-[9px] font-black uppercase text-white"
                            >
                                Crear nueva estética
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Panel de estéticas: slide-over */}
            {panelAbierto && (
                <div className="fixed inset-0 z-50 flex" onClick={() => setPanelAbierto(false)} role="button">
                    <div
                        className="h-full w-80 border-l border-zinc-800 bg-zinc-950 p-3 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-3 flex items-center justify-between">
                            <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Estéticas guardadas</span>
                            <button
                                onClick={() => {
                                    const name = `Variedad ${esteticas.length}`;
                                    createEstetica(name, { ...esteticaActiva?.recipe }, { parentId: activeId });
                                    setPanelAbierto(false);
                                }}
                                title="Nueva desde actual"
                                className="rounded-lg bg-[#36606F]/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-[#7FB0C0]"
                            >
                                +
                            </button>
                        </div>
                        <div className="flex flex-col gap-1.5 overflow-y-auto">
                            {esteticas.map(e => (
                                <div
                                    key={e.id}
                                    className={`group rounded-xl border p-2.5 transition-all ${
                                        e.id === activeId ? 'border-[#36606F] bg-[#36606F]/10' : 'border-zinc-800 bg-zinc-900/60'
                                    }`}
                                >
                                    <div className="flex items-center justify-between gap-1">
                                        {editandoId === e.id ? (
                                            <input
                                                autoFocus
                                                value={editNombre}
                                                onChange={e2 => setEditNombre(e2.target.value)}
                                                onKeyDown={ev => ev.key === 'Enter' && confirmarRename()}
                                                className="flex-1 bg-transparent text-sm font-black text-zinc-100 focus:outline-none"
                                            />
                                        ) : (
                                            <span className="text-sm font-black text-zinc-100">{e.name}</span>
                                        )}
                                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                                            {!e.isOriginal && (
                                                <button
                                                    onClick={() => openRename(e.id, e.name)}
                                                    title="Renombrar"
                                                    className="rounded-lg p-0.5 text-zinc-400 hover:text-white"
                                                >
                                                    ✏
                                                </button>
                                            )}
                                            {!e.isOriginal && (
                                                <button
                                                    onClick={() => duplicateEstetica(e.id, `${e.name} (copia)`)}
                                                    title="Duplicar"
                                                    className="rounded-lg p-0.5 text-zinc-400 hover:text-white"
                                                >
                                                    📋
                                                </button>
                                            )}
                                            {!e.isOriginal && (
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('Eliminar estética?')) deleteEstetica(e.id);
                                                    }}
                                                    title="Eliminar"
                                                    className="rounded-lg p-0.5 text-zinc-400 hover:text-rose-400"
                                                >
                                                    🗑
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    <div className="mt-1 truncate text-[9px] text-zinc-500">
                                        {Object.keys(e.recipe).length === 0
                                            ? 'Identidad original'
                                            : Object.entries(e.recipe).map(([k, v]) => `${k} ${v}`).join(' · ')}
                                    </div>
                                    {editandoId === e.id && (
                                        <div className="mt-1 flex gap-1.5">
                                            <button onClick={confirmarRename} className="rounded-lg bg-zinc-800 px-2 py-1 text-[8px] font-black text-zinc-300">
                                                OK
                                            </button>
                                            <button onClick={() => setEditandoId(null)} className="rounded-lg bg-zinc-800 px-2 py-1 text-[8px] font-black text-zinc-500">
                                                X
                                            </button>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => {
                                            setActiveEstetica(e.id);
                                            setVista('sandbox');
                                            setPanelAbierto(false);
                                        }}
                                        style={{ minHeight: 44 }}
                                        className={`mt-2 w-full rounded-xl px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest ${
                                            e.id === activeId ? 'bg-[#36606F] text-white' : 'bg-zinc-800/60 text-zinc-400 hover:text-white'
                                        }`}
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {diagnosticoAbierto && <ValidationPanel onClose={() => setDiagnosticoAbierto(false)} />}
        </div>
    );
}
