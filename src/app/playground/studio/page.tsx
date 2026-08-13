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
import type { Estetica, GlobalBackground, Recipe, StudioFontFamily, VisualOverride, VisualOverrides } from './types';
import { disableSandboxRuntime } from '@/lib/sandbox/client';
import type { StudioFontOption } from './font-catalog';
import {
    canRedo,
    canUndo,
    createHistory,
    isNativeTextEditingTarget,
    pushHistory,
    redoHistory,
    resetHistory,
    undoHistory,
    type HistoryState,
} from './history';

type SecondaryView = 'comparar' | 'contacto' | 'lenguaje' | 'absorber' | null;

type DraftState = {
    id: string;
    recipe: Recipe;
    overrides: VisualOverrides;
    fontFamily?: StudioFontFamily;
    globalScale?: string;
    background?: GlobalBackground;
};

function snapshotFromEstetica(estetica: Estetica): DraftState {
    return {
        id: estetica.id,
        recipe: estetica.recipe,
        overrides: estetica.overrides ?? {},
        fontFamily: estetica.fontFamily,
        globalScale: estetica.globalScale,
        background: estetica.background,
    };
}

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

    const [history, setHistory] = React.useState<HistoryState<DraftState>>(() => createHistory(snapshotFromEstetica(activeEstetica)));
    const [editorVisible, setEditorVisible] = React.useState(true);
    const [secondaryView, setSecondaryView] = React.useState<SecondaryView>(null);
    const [comparisonId, setComparisonId] = React.useState('est-editorial-v1');
    const [diagnosticVisible, setDiagnosticVisible] = React.useState(false);
    const [fonts, setFonts] = React.useState<StudioFontOption[]>([]);

    // Si el historial no pertenece a la estética activa (cambio de estética),
    // usamos el snapshot de la estética como base de lectura hasta alinear.
    const editing: DraftState = history.present.id === activeEstetica.id
        ? history.present
        : snapshotFromEstetica(activeEstetica);

    const draftRecipe = editing.recipe;
    const draftOverrides = editing.overrides;
    const draftFontFamily = editing.fontFamily;
    const draftBackground = editing.background;
    const draftGlobalScale = editing.globalScale;

    const commitDraft = React.useCallback((next: DraftState) => {
        setHistory(current => pushHistory(current, next));
    }, []);

    const selectEstetica = React.useCallback((id: string) => {
        setActiveEstetica(id);
        const next = useSandboxStore.getState().esteticas.find(e => e.id === id);
        if (next) setHistory(resetHistory(snapshotFromEstetica(next)));
    }, [setActiveEstetica]);

    const undo = React.useCallback(() => {
        setHistory(current => (canUndo(current) ? undoHistory(current) : current));
    }, []);

    const redo = React.useCallback(() => {
        setHistory(current => (canRedo(current) ? redoHistory(current) : current));
    }, []);

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

    React.useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const mod = event.metaKey || event.ctrlKey;
            if (!mod || event.key.toLowerCase() !== 'z') return;
            if (isNativeTextEditingTarget(event.target)) return;
            event.preventDefault();
            if (event.shiftKey) redo();
            else undo();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [undo, redo]);

    const setDraftOverride = (key: string, vp: 'all' | 'mobile' | 'tablet' | 'desktop', patch: VisualOverride | null) => {
        const currentOverride = draftOverrides[key] || {};
        let newViewportData: VisualOverride | undefined = undefined;

        if (patch !== null) {
            newViewportData = { ...currentOverride[vp], ...patch };
            Object.keys(newViewportData).forEach(k => {
                if (newViewportData![k as keyof VisualOverride] === undefined) {
                    delete newViewportData![k as keyof VisualOverride];
                }
            });
            if (Object.keys(newViewportData).length === 0) {
                newViewportData = undefined;
            }
        }

        const newOverride = {
            ...currentOverride,
            [vp]: newViewportData,
        };

        if (newViewportData === undefined) {
            delete newOverride[vp];
        }

        const newOverrides = { ...draftOverrides, [key]: newOverride };

        if (Object.keys(newOverride).length === 0) {
            delete newOverrides[key];
        }

        commitDraft({
            id: activeEstetica.id,
            recipe: draftRecipe,
            overrides: newOverrides,
            fontFamily: draftFontFamily,
            globalScale: draftGlobalScale,
            background: draftBackground,
        });
    };

    const saveDraft = () => {
        if (activeEstetica.isOriginal || activeEstetica.isSystem) {
            const id = createEstetica(`${activeEstetica.name} · prueba`, draftRecipe, {
                description: 'Expresión guardada desde una prueba en vivo.',
                parentId: activeEstetica.id,
                overrides: draftOverrides,
                fontFamily: draftFontFamily,
                globalScale: draftGlobalScale,
                background: draftBackground,
            });
            const created = useSandboxStore.getState().esteticas.find(e => e.id === id);
            if (created) setHistory(resetHistory(snapshotFromEstetica(created)));
        } else {
            updateEsteticaRecipe(activeEstetica.id, draftRecipe);
            updateEsteticaOverrides(activeEstetica.id, draftOverrides);
            updateEsteticaFontFamily(activeEstetica.id, draftFontFamily);
            useSandboxStore.getState().updateEsteticaGlobalScale?.(activeEstetica.id, draftGlobalScale);
            useSandboxStore.getState().updateEsteticaBackground?.(activeEstetica.id, draftBackground);
        }
        toast.success('Estética guardada');
    };

    const duplicateActive = () => {
        const id = createEstetica(`${activeEstetica.name} (copia)`, draftRecipe, {
            description: activeEstetica.description,
            parentId: activeEstetica.id,
            overrides: draftOverrides,
            fontFamily: draftFontFamily,
            globalScale: draftGlobalScale,
            background: draftBackground,
        });
        if (id) {
            const created = useSandboxStore.getState().esteticas.find(e => e.id === id);
            if (created) setHistory(resetHistory(snapshotFromEstetica(created)));
            toast.success('Copia creada y activa');
        }
    };

    const deleteActive = () => {
        if (activeEstetica.isOriginal || activeEstetica.isSystem) return;
        if (window.confirm(`¿Eliminar «${activeEstetica.name}»?`)) {
            deleteEstetica(activeEstetica.id);
            const next = useSandboxStore.getState().esteticas.find(e => e.id === useSandboxStore.getState().activeEsteticaId);
            if (next) setHistory(resetHistory(snapshotFromEstetica(next)));
            toast.success('Estética eliminada');
        }
    };

    const undoEnabled = canUndo(history) && history.present.id === activeEstetica.id;
    const redoEnabled = canRedo(history) && history.present.id === activeEstetica.id;

    const isMobileViewport = viewport === 'mobile';
    const frameClass = viewport === 'mobile'
        ? 'w-[375px] shrink-0'
        : viewport === 'tablet'
            ? 'mx-auto w-[768px] max-w-full'
            : 'w-full max-w-full';

    const globalPanel = (
        <GlobalAestheticPanel
            estetica={activeEstetica}
            esteticas={esteticas}
            viewport={viewport}
            onSelect={selectEstetica}
            onViewportChange={setViewport}
            onSave={saveDraft}
            onDuplicate={duplicateActive}
            onRename={name => { if (name.trim()) renameEstetica(activeEstetica.id, name.trim()); }}
            onDelete={deleteActive}
            onCompare={() => setSecondaryView('comparar')}
            fontFamily={draftFontFamily}
            onFontFamilyChange={fontFamily => commitDraft({ id: activeEstetica.id, recipe: draftRecipe, overrides: draftOverrides, fontFamily, globalScale: draftGlobalScale, background: draftBackground })}
            globalScale={draftGlobalScale}
            onGlobalScaleChange={globalScale => commitDraft({ id: activeEstetica.id, recipe: draftRecipe, overrides: draftOverrides, fontFamily: draftFontFamily, globalScale, background: draftBackground })}
            fonts={fonts}
            background={draftBackground}
            onBackgroundChange={background => commitDraft({ id: activeEstetica.id, recipe: draftRecipe, overrides: draftOverrides, fontFamily: draftFontFamily, globalScale: draftGlobalScale, background })}
        />
    );

    const inspectorPanel = (
        <VisualLabPanel overrides={draftOverrides} onOverrideChange={setDraftOverride} fonts={fonts} viewport={viewport} />
    );

    const preview = (
        <SandboxView
            esteticaId={activeId}
            recipeOverride={draftRecipe}
            overrides={draftOverrides}
            fontFamily={draftFontFamily}
            globalScale={draftGlobalScale}
            background={draftBackground}
            onDragEnd={(key, x, y) => setDraftOverride(key, viewport, { x, y })}
        />
    );

    return (
        <div className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-100 font-sans text-zinc-900">
            <Toaster position="top-center" richColors closeButton />

            <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-zinc-200 bg-white px-3">
                <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                    <div className="h-5 w-5 shrink-0 rounded-md bg-[#36606F]" />
                    <div className="min-w-0">
                        <div className="truncate text-[11px] font-semibold text-zinc-800">{activeEstetica.name}</div>
                        <div className="flex items-center gap-2"><RutaBadge /><span className="hidden text-[9px] font-medium uppercase tracking-wide text-zinc-400 sm:inline">en vivo</span></div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <div className="flex overflow-hidden rounded-md border border-zinc-200">
                        <button
                            type="button"
                            title="Deshacer (Ctrl/⌘ Z)"
                            aria-label="Deshacer"
                            disabled={!undoEnabled}
                            onClick={undo}
                            className="flex h-8 w-8 items-center justify-center text-[14px] text-zinc-600 hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 disabled:hover:bg-transparent"
                        >
                            ↶
                        </button>
                        <button
                            type="button"
                            title="Rehacer (Ctrl/⌘ Shift Z)"
                            aria-label="Rehacer"
                            disabled={!redoEnabled}
                            onClick={redo}
                            className="flex h-8 w-8 items-center justify-center border-l border-zinc-200 text-[14px] text-zinc-600 hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 disabled:hover:bg-transparent"
                        >
                            ↷
                        </button>
                    </div>
                    <button type="button" onClick={() => setEditorVisible(value => !value)} className="h-8 rounded-md bg-[#36606F] px-2.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        {editorVisible ? 'Ocultar editor' : 'Editar estética'}
                    </button>
                    <button type="button" onClick={() => setDiagnosticVisible(true)} className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600 hover:bg-zinc-50">
                        Validación
                    </button>
                    <a href="/dashboard/ventas" className="inline-flex h-8 items-center rounded-md border border-rose-100 bg-rose-50 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">Salir</a>
                </div>
            </header>

            <main className="relative flex min-h-0 flex-1 overflow-hidden">
                {editorVisible && isMobileViewport ? (
                    <>
                        <aside className="flex min-h-0 min-w-[220px] max-w-[340px] flex-1 flex-col overflow-y-auto border-r border-zinc-200 bg-white">
                            {globalPanel}
                        </aside>
                        <section data-studio-viewport={viewport} className="flex min-h-0 shrink-0 items-center justify-center overflow-hidden bg-zinc-200/70 px-3">
                            <div className={`${frameClass} h-[min(100%,812px)] max-h-full overflow-hidden rounded-[28px] border border-zinc-300 bg-white shadow-[0_18px_50px_rgba(24,24,27,0.12)]`}>
                                {preview}
                            </div>
                        </section>
                        <aside className="flex min-h-0 min-w-[220px] max-w-[360px] flex-1 flex-col overflow-hidden border-l border-zinc-200 bg-white">
                            {inspectorPanel}
                        </aside>
                    </>
                ) : (
                    <>
                        {editorVisible && (
                            <aside className="flex max-h-[42vh] min-h-0 w-full shrink-0 flex-col overflow-y-auto border-b border-zinc-200 bg-white lg:max-h-none lg:w-[320px] lg:border-b-0 lg:border-r">
                                {globalPanel}
                                {inspectorPanel}
                            </aside>
                        )}
                        <section data-studio-viewport={viewport} className="flex min-h-0 min-w-0 flex-1 items-stretch justify-center overflow-auto bg-zinc-200/70 p-3">
                            <div className={`${frameClass} h-full overflow-hidden rounded-xl border border-zinc-300 bg-white shadow-sm`}>
                                {preview}
                            </div>
                        </section>
                    </>
                )}
            </main>

            {secondaryView && (
                <div className="fixed inset-0 z-[150] flex flex-col bg-white">
                    <div className="flex h-11 items-center justify-between border-b border-zinc-200 px-3">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Herramienta secundaria</span>
                        <button type="button" onClick={() => setSecondaryView(null)} className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Volver al editor</button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto">
                        {secondaryView === 'comparar' && (
                            <div className="flex h-full min-w-0 flex-col gap-1 p-1 lg:flex-row">
                                <div className="min-h-0 min-w-0 flex-1 overflow-auto"><SandboxView esteticaId={activeId} recipeOverride={draftRecipe} label="A" /></div>
                                <div className="min-h-0 min-w-0 flex-1 overflow-auto"><SandboxView esteticaId={comparisonId} label="B" /></div>
                                <select value={comparisonId} onChange={event => setComparisonId(event.target.value)} className="absolute right-3 top-2 h-8 rounded-md border border-zinc-200 bg-white px-2 text-[10px] font-semibold uppercase text-zinc-700">
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
