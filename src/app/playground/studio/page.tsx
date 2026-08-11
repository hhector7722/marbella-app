'use client';

import React from 'react';
import { toast, Toaster } from 'sonner';
import { SANDBOX_ROUTES, START_REAL_ROUTE, useSandboxStore } from './store';
import { SandboxView, RutaBadge } from './components/SandboxView';
import { GlobalAestheticPanel, VisualLabPanel } from './components/VisualLab';
import { DesignLanguage } from './components/DesignLanguage';
import { ModoAbsorber } from './components/ModoAbsorber';
import { HojaContacto } from './components/HojaContacto';
import { ValidationPanel } from './components/ValidationPanel';
import type { Recipe, StudioFontFamily, VisualOverride, VisualOverrides } from './types';
import { disableSandboxRuntime } from '@/lib/sandbox/client';
import type { StudioFontOption } from './font-catalog';

type SecondaryView = 'comparar' | 'contacto' | 'lenguaje' | 'absorber' | null;

export default function StudioPage() {
    const esteticas = useSandboxStore(s => s.esteticas);
    const activeId = useSandboxStore(s => s.activeEsteticaId);
    const activeEstetica = esteticas.find(e => e.id === activeId) ?? esteticas[0];
    const viewport = useSandboxStore(s => s.viewport);
    const setViewport = useSandboxStore(s => s.setViewport);
    const setRouteFromBrowser = useSandboxStore(s => s.setRouteFromBrowser);
    const setActiveEstetica = useSandboxStore(s => s.setActiveEstetica);
    const createEstetica = useSandboxStore(s => s.createEstetica);
    const updateEsteticaRecipe = useSandboxStore(s => s.updateEsteticaRecipe);
    const updateEsteticaOverrides = useSandboxStore(s => s.updateEsteticaOverrides);
    const updateEsteticaFontFamily = useSandboxStore(s => s.updateEsteticaFontFamily);
    const renameEstetica = useSandboxStore(s => s.renameEstetica);
    const deleteEstetica = useSandboxStore(s => s.deleteEstetica);

    const [draft, setDraft] = React.useState<{ id: string; recipe: Recipe; overrides: VisualOverrides; fontFamily?: StudioFontFamily } | null>(null);
    const [editorVisible, setEditorVisible] = React.useState(true);
    const [secondaryView, setSecondaryView] = React.useState<SecondaryView>(null);
    const [comparisonId, setComparisonId] = React.useState('est-editorial-v1');
    const [diagnosticVisible, setDiagnosticVisible] = React.useState(false);
    const [fonts, setFonts] = React.useState<StudioFontOption[]>([]);

    React.useEffect(() => {
        document.cookie = 'marbella-sandbox=1; path=/; SameSite=Lax';
        const handleSandboxWrite = (event: Event) => {
            const detail = (event as CustomEvent<{ operation?: string; resource?: string }>).detail;
            toast.info('Acción simulada: no se ha modificado Marbella real', {
                description: `${detail?.operation ?? 'Escritura'}${detail?.resource ? ` · ${detail.resource}` : ''}`,
            });
        };
        window.addEventListener('marbella-sandbox-write', handleSandboxWrite);
        return () => {
            window.removeEventListener('marbella-sandbox-write', handleSandboxWrite);
            document.cookie = 'marbella-sandbox=; Max-Age=0; path=/; SameSite=Lax';
            disableSandboxRuntime();
        };
    }, []);

    React.useEffect(() => {
        const syncRouteFromUrl = () => {
            const value = new URLSearchParams(window.location.search).get('route');
            const route = value && SANDBOX_ROUTES.some(candidate => candidate.id === value)
                ? value as Parameters<typeof setRouteFromBrowser>[0]
                : START_REAL_ROUTE;
            setRouteFromBrowser(route);
        };
        syncRouteFromUrl();
        window.addEventListener('popstate', syncRouteFromUrl);
        return () => window.removeEventListener('popstate', syncRouteFromUrl);
    }, [setRouteFromBrowser]);

    React.useEffect(() => {
        let cancelled = false;
        void fetch('/playground/studio/fonts')
            .then(response => response.ok ? response.json() as Promise<StudioFontOption[]> : [])
            .then(available => {
                if (cancelled) return;
                setFonts(available);
                available.forEach(font => {
                    const face = new FontFace(font.family, `url("${font.url}") format("${font.format}")`);
                    document.fonts.add(face);
                    void face.load();
                });
            })
            .catch(() => { if (!cancelled) setFonts([]); });
        return () => { cancelled = true; };
    }, []);

    const draftRecipe = draft?.id === activeEstetica.id ? draft.recipe : activeEstetica.recipe;
    const draftOverrides = draft?.id === activeEstetica.id ? draft.overrides : activeEstetica.overrides ?? {};
    const draftFontFamily = draft?.id === activeEstetica.id ? draft.fontFamily : activeEstetica.fontFamily;
    const setDraftOverride = (key: string, patch: VisualOverride) => setDraft({
        id: activeEstetica.id,
        recipe: draftRecipe,
        overrides: { ...draftOverrides, [key]: { ...draftOverrides[key], ...patch } },
        fontFamily: draftFontFamily,
    });

    const saveDraft = () => {
        if (activeEstetica.isOriginal || activeEstetica.isSystem) {
            createEstetica(`${activeEstetica.name} · prueba`, draftRecipe, {
                description: 'Expresión guardada desde una prueba en vivo.',
                parentId: activeEstetica.id,
                overrides: draftOverrides,
                fontFamily: draftFontFamily,
            });
        } else {
            updateEsteticaRecipe(activeEstetica.id, draftRecipe);
            updateEsteticaOverrides(activeEstetica.id, draftOverrides);
            updateEsteticaFontFamily(activeEstetica.id, draftFontFamily);
        }
        toast.success('Estética guardada');
    };

    const duplicateActive = () => {
        const id = createEstetica(`${activeEstetica.name} (copia)`, draftRecipe, {
            description: activeEstetica.description,
            parentId: activeEstetica.id,
            overrides: draftOverrides,
            fontFamily: draftFontFamily,
        });
        if (id) toast.success('Copia creada y activa');
    };

    const deleteActive = () => {
        if (activeEstetica.isOriginal || activeEstetica.isSystem) return;
        if (window.confirm(`¿Eliminar «${activeEstetica.name}»?`)) {
            deleteEstetica(activeEstetica.id);
            toast.success('Estética eliminada');
        }
    };

    const frameClass = viewport === 'mobile' ? 'mx-auto w-[375px]' : viewport === 'tablet' ? 'mx-auto w-[768px]' : 'w-full';

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 font-sans text-white">
            <Toaster position="top-center" richColors closeButton />

            <header className="flex min-h-[58px] items-center justify-between gap-3 border-b border-zinc-800/70 px-3 py-1.5">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <div className="h-6 w-6 shrink-0 rounded-lg bg-[#36606F]" />
                    <div className="min-w-0">
                        <div className="truncate text-[9px] font-black uppercase tracking-widest text-zinc-300">{activeEstetica.name}</div>
                        <div className="flex items-center gap-2"><RutaBadge /><span className="hidden text-[8px] font-black uppercase tracking-widest text-emerald-300 sm:inline">cambios en vivo</span></div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setEditorVisible(value => !value)} style={{ minHeight: 48 }} className="rounded-xl bg-[#36606F] px-3 text-[9px] font-black uppercase tracking-widest text-white">
                        {editorVisible ? 'Ocultar editor' : 'Editar estética'}
                    </button>
                    <button onClick={() => setDiagnosticVisible(true)} style={{ minHeight: 48 }} className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300">
                        Validación
                    </button>
                    <a href="/dashboard/ventas" style={{ minHeight: 48 }} className="rounded-xl bg-red-500/10 px-3 text-[9px] font-black uppercase tracking-widest text-red-300">Salir</a>
                </div>
            </header>

            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
                {editorVisible && (
                    <aside className="flex max-h-[48vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-b border-zinc-800 bg-zinc-950 lg:max-h-none lg:w-[520px] lg:border-b-0 lg:border-r">
                    <GlobalAestheticPanel
                        estetica={activeEstetica}
                        esteticas={esteticas}
                        viewport={viewport}
                        onSelect={setActiveEstetica}
                        onViewportChange={setViewport}
                        onSave={saveDraft}
                        onDuplicate={duplicateActive}
                        onRename={name => { if (name.trim()) renameEstetica(activeEstetica.id, name.trim()); }}
                        onDelete={deleteActive}
                        onCompare={() => setSecondaryView('comparar')}
                        fontFamily={draftFontFamily}
                        onFontFamilyChange={fontFamily => setDraft({ id: activeEstetica.id, recipe: draftRecipe, overrides: draftOverrides, fontFamily })}
                        fonts={fonts}
                    />
                        <VisualLabPanel overrides={draftOverrides} onOverrideChange={setDraftOverride} fonts={fonts} />
                    </aside>
                )}

                <section className="min-h-0 min-w-0 flex-1 overflow-auto bg-zinc-900/30">
                    <div className={`${frameClass} h-full`}>
                        <SandboxView esteticaId={activeId} recipeOverride={draftRecipe} overrides={draftOverrides} fontFamily={draftFontFamily} />
                    </div>
                </section>
            </main>

            {secondaryView && (
                <div className="fixed inset-0 z-[150] flex flex-col bg-zinc-950">
                    <div className="flex min-h-[58px] items-center justify-between border-b border-zinc-800 px-3">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">Herramienta secundaria</span>
                        <button onClick={() => setSecondaryView(null)} style={{ minHeight: 48 }} className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300">Volver a editor + Marbella</button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                        {secondaryView === 'comparar' && (
                            <div className="flex h-full min-w-0 flex-col gap-1 p-1 lg:flex-row">
                                <div className="min-h-0 min-w-0 flex-1 overflow-auto"><SandboxView esteticaId={activeId} recipeOverride={draftRecipe} label="A" /></div>
                                <div className="min-h-0 min-w-0 flex-1 overflow-auto"><SandboxView esteticaId={comparisonId} label="B" /></div>
                                <select value={comparisonId} onChange={event => setComparisonId(event.target.value)} className="absolute right-3 top-2 min-h-12 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-[9px] font-black uppercase text-zinc-200">
                                    {esteticas.map(estetica => <option key={estetica.id} value={estetica.id}>{estetica.name}</option>)}
                                </select>
                            </div>
                        )}
                        {secondaryView === 'contacto' && <HojaContacto onExplorar={() => setSecondaryView(null)} />}
                        {secondaryView === 'lenguaje' && <DesignLanguage />}
                        {secondaryView === 'absorber' && <ModoAbsorber onCreada={() => setSecondaryView(null)} />}
                    </div>
                </div>
            )}

            {diagnosticVisible && <ValidationPanel onClose={() => setDiagnosticVisible(false)} />}
        </div>
    );
}
