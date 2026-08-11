'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import type { StudioFontOption } from '../font-catalog';
import type { Estetica, SandboxRoute, SelectedVisualElement, StudioFontFamily, VisualOverride, VisualOverrides, VisualTargetKind, ViewportPreset } from '../types';

const TARGET_SELECTOR = 'button, input, textarea, select, table, thead, tbody, tr, nav, header, [role="dialog"], [role="tab"], [class*="rounded"]';

function cleanLabel(value: string): string {
    return value.replace(/\s+/g, ' ').trim().slice(0, 48);
}

function scopeLabel(kind: VisualTargetKind, scope: 'instance' | 'component' | 'global'): string {
    const names: Record<VisualTargetKind, [string, string]> = {
        button: ['Solo este botón', 'Todos los botones de este tipo'],
        card: ['Solo esta tarjeta', 'Todas las tarjetas de este tipo'],
        table: ['Solo esta tabla', 'Todas las tablas de este tipo'],
        row: ['Solo esta fila', 'Todas las filas de este tipo'],
        input: ['Solo este campo', 'Todos los campos de este tipo'],
        select: ['Solo este selector', 'Todos los selectores de este tipo'],
        nav: ['Solo esta navegación', 'Todas las navegaciones de este tipo'],
        header: ['Solo esta cabecera', 'Todas las cabeceras de este tipo'],
        modal: ['Solo este modal', 'Todos los modales de este tipo'],
        text: ['Solo este texto', 'Todos los textos de este tipo'],
        element: ['Solo este elemento', 'Todos los elementos de este tipo'],
    };
    if (scope === 'global') return 'Toda la estética';
    return names[kind][scope === 'instance' ? 0 : 1];
}

function classify(element: HTMLElement): { kind: VisualTargetKind; scope: string; label: string } {
    const tag = element.tagName.toLowerCase();
    const classes = String(element.className ?? '');
    const label = cleanLabel(element.getAttribute('aria-label') ?? element.textContent ?? '') || tag;

    if (tag === 'button' || element.getAttribute('role') === 'button') {
        const primary = classes.includes('bg-[#36606F]') || classes.includes('bg-blue-') || classes.includes('bg-emerald-');
        return { kind: 'button', scope: primary ? 'button:primary' : 'button:secondary', label };
    }
    if (tag === 'input' || tag === 'textarea') return { kind: 'input', scope: 'input:default', label };
    if (tag === 'select') return { kind: 'select', scope: 'select:default', label };
    if (tag === 'table') return { kind: 'table', scope: 'table:default', label: 'Tabla' };
    if (tag === 'tr') return { kind: 'row', scope: 'table:row', label: label || 'Fila' };
    if (tag === 'nav') return { kind: 'nav', scope: 'navigation:main', label: 'Navegación' };
    if (tag === 'header') return { kind: 'header', scope: 'header:main', label: 'Cabecera' };
    if (element.getAttribute('role') === 'dialog') return { kind: 'modal', scope: 'modal:default', label: label || 'Modal' };
    if (classes.includes('rounded') || classes.includes('rounded-')) return { kind: 'card', scope: 'card:default', label: label || 'Superficie' };
    return { kind: 'element', scope: `${tag}:default`, label };
}

function overrideFor(element: HTMLElement, overrides: VisualOverrides): VisualOverride {
    return {
        ...overrides.global,
        ...overrides[`component:${element.dataset.studioComponent ?? ''}`],
        ...overrides[element.dataset.studioNodeKey ?? ''],
    };
}

function applyOverrideAttributes(element: HTMLElement, override: VisualOverride): void {
    const attributes = ['shape', 'radius', 'weight', 'elevation', 'tone', 'padding', 'fontFamily'] as const;
    attributes.forEach(attribute => {
        const value = override[attribute];
        if (value) element.dataset[`studio${attribute[0].toUpperCase()}${attribute.slice(1)}`] = value;
        else delete element.dataset[`studio${attribute[0].toUpperCase()}${attribute.slice(1)}`];
    });
    if (override.fontFamily) element.style.setProperty('--studio-font-family', `'${override.fontFamily}'`);
    else element.style.removeProperty('--studio-font-family');
    if (override.fillColor) {
        element.style.setProperty('--studio-fill-color', override.fillColor);
        element.dataset.studioFillColor = 'true';
    } else {
        element.style.removeProperty('--studio-fill-color');
        delete element.dataset.studioFillColor;
    }
    if (override.fillOpacity !== undefined) element.style.setProperty('--studio-fill-opacity', String(override.fillOpacity));
    else element.style.removeProperty('--studio-fill-opacity');
    if (override.outlineColor) element.style.setProperty('--studio-outline-color', override.outlineColor);
    else element.style.removeProperty('--studio-outline-color');
    if (override.outlineWidth) element.dataset.studioOutlineWidth = override.outlineWidth;
    else delete element.dataset.studioOutlineWidth;
}

function realElements(root: HTMLElement): HTMLElement[] {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
    document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(dialog => {
        if (dialog.closest('[data-studio-chrome="true"]')) return;
        elements.push(dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>(TARGET_SELECTOR)));
    });
    return Array.from(new Set(elements)).filter(element => !element.closest('[data-studio-chrome="true"]'));
}

export function VisualLabSurface({
    route,
    overrides,
    children,
}: {
    route: SandboxRoute;
    overrides: VisualOverrides;
    children: React.ReactNode;
}) {
    const rootRef = React.useRef<HTMLDivElement>(null);
    const labMode = useSandboxStore(s => s.labMode);
    const selectedElement = useSandboxStore(s => s.selectedElement);
    const setSelectedElement = useSandboxStore(s => s.setSelectedElement);

    React.useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const elements = realElements(root);
        const counts = new Map<string, number>();
        elements.forEach(element => {
            if (element.closest('[data-studio-chrome="true"]')) return;
            const descriptor = classify(element);
            const base = `${route}:${descriptor.kind}:${descriptor.scope}:${descriptor.label}`;
            const index = counts.get(base) ?? 0;
            counts.set(base, index + 1);
            element.dataset.studioNodeKey = `${base}:${index}`;
            element.dataset.studioComponent = descriptor.scope;
            element.dataset.studioKind = descriptor.kind;
            if (!root.contains(element)) {
                element.dataset.studioPortal = 'true';
                element.dataset.marbellaSandbox = 'true';
            }
            applyOverrideAttributes(element, overrideFor(element, overrides));
        });

        return () => {
            elements.forEach(element => {
                delete element.dataset.studioNodeKey;
                delete element.dataset.studioComponent;
                delete element.dataset.studioKind;
                delete element.dataset.studioHover;
                delete element.dataset.studioSelected;
                if (element.dataset.studioPortal === 'true') {
                    delete element.dataset.studioPortal;
                    delete element.dataset.marbellaSandbox;
                }
            });
        };
    }, [route, overrides, children]);

    React.useEffect(() => {
        const root = rootRef.current;
        if (!root) return;

        const findTarget = (eventTarget: EventTarget | null) => {
            const element = eventTarget instanceof HTMLElement ? eventTarget.closest<HTMLElement>('[data-studio-node-key]') : null;
            return element && !element.closest('[data-studio-chrome="true"]') ? element : null;
        };
        const handleOver = (event: MouseEvent) => {
            if (!labMode) return;
            const element = findTarget(event.target);
            if (element) element.dataset.studioHover = 'true';
        };
        const handleOut = (event: MouseEvent) => {
            const element = findTarget(event.target);
            if (element) delete element.dataset.studioHover;
        };
        const handleClick = (event: MouseEvent) => {
            if (!labMode) return;
            const element = findTarget(event.target);
            if (!element) return;
            event.preventDefault();
            event.stopPropagation();
            const descriptor = classify(element);
            const selection: SelectedVisualElement = {
                key: element.dataset.studioNodeKey ?? '',
                route,
                kind: descriptor.kind,
                label: descriptor.label,
                componentScope: descriptor.scope,
                tagName: element.tagName.toLowerCase(),
            };
            setSelectedElement(selection);
            document.querySelectorAll<HTMLElement>('[data-studio-selected="true"]').forEach(node => delete node.dataset.studioSelected);
            element.dataset.studioSelected = 'true';
        };

        document.addEventListener('mouseover', handleOver);
        document.addEventListener('mouseout', handleOut);
        document.addEventListener('click', handleClick, true);
        return () => {
            document.removeEventListener('mouseover', handleOver);
            document.removeEventListener('mouseout', handleOut);
            document.removeEventListener('click', handleClick, true);
        };
    }, [labMode, route, setSelectedElement]);

    React.useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        realElements(root).forEach(element => {
            applyOverrideAttributes(element, overrideFor(element, overrides));
            if (element.dataset.studioNodeKey === selectedElement?.key) element.dataset.studioSelected = 'true';
            else delete element.dataset.studioSelected;
        });
    }, [overrides, selectedElement]);

    return <div ref={rootRef} data-studio-real-app="true" className="relative h-full">{children}</div>;
}

const OPTIONS: { key: keyof VisualOverride; title: string; values: string[] }[] = [
    { key: 'shape', title: 'Forma', values: ['recto', 'suave', 'redondo', 'pill'] },
    { key: 'radius', title: 'Radio', values: ['none', 'small', 'medium', 'large'] },
    { key: 'weight', title: 'Peso', values: ['normal', 'medium', 'bold'] },
    { key: 'elevation', title: 'Elevación', values: ['flat', 'subtle', 'strong'] },
    { key: 'tone', title: 'Color', values: ['brand', 'neutral', 'dark'] },
    { key: 'padding', title: 'Padding', values: ['compact', 'standard', 'spacious'] },
    { key: 'fontFamily', title: 'Tipografía', values: ['roboto', 'ea-sports-outline'] },
];

export function VisualLabPanel({
    overrides,
    onOverrideChange,
    fonts,
}: {
    overrides: VisualOverrides;
    onOverrideChange: (key: string, patch: VisualOverride) => void;
    fonts: StudioFontOption[];
}) {
    const labMode = useSandboxStore(s => s.labMode);
    const setLabMode = useSandboxStore(s => s.setLabMode);
    const selected = useSandboxStore(s => s.selectedElement);
    const [scope, setScope] = React.useState<'instance' | 'component' | 'global'>('instance');

    const overrideKey = selected
        ? scope === 'instance'
            ? selected.key
            : scope === 'component'
                ? `component:${selected.componentScope}`
                : 'global'
        : 'global';
    const current = overrides[overrideKey] ?? {};
    const options = [
        ...OPTIONS.filter(option => option.key !== 'fontFamily'),
        { key: 'fontFamily' as const, title: 'Tipografía', values: fonts.map(font => font.family) },
    ];

    return (
        <div data-studio-chrome="true" className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
                <div>
                    <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Laboratorio visual</div>
                    <div className="mt-1 text-sm font-black text-white">{selected ? `${selected.kind} · ${selected.label}` : 'Mira la app y selecciona un elemento'}</div>
                </div>
                <button type="button" onClick={() => setLabMode(!labMode)} style={{ minHeight: 48 }} className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${labMode ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                    {labMode ? 'Seleccionando' : 'Seleccionar'}
                </button>
            </div>

            {selected && (
                <>
                    <div className="mt-3 grid grid-cols-3 gap-1">
                        {(['instance', 'component', 'global'] as const).map(option => (
                            <button key={option} type="button" onClick={() => setScope(option)} style={{ minHeight: 44 }} className={`rounded-lg text-[9px] font-black uppercase tracking-widest ${scope === option ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                                {scopeLabel(selected.kind, option)}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {options.map(option => (
                            <div key={option.key}>
                                <div className="mb-1 text-[8px] font-black uppercase tracking-widest text-zinc-600">{option.title}</div>
                                <div className="flex flex-wrap gap-1">
                                    {option.values.map(value => (
                                        <button key={value} type="button" onClick={() => onOverrideChange(overrideKey, { [option.key]: value } as VisualOverride)} style={{ minHeight: 40 }} className={`rounded-lg px-2 text-[9px] font-black uppercase tracking-widest ${current[option.key] === value ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500 hover:text-zinc-200'}`}>
                                            {fonts.find(font => font.family === value)?.label ?? value}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                        <label className="rounded-lg bg-zinc-900 p-2">
                            <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-600">Relleno del texto</span>
                            <span className="flex items-center gap-2">
                                <input type="color" value={current.fillColor ?? '#36606F'} onChange={event => onOverrideChange(overrideKey, { fillColor: event.target.value })} className="h-10 w-10 rounded border-0 bg-transparent" />
                                <code className="text-[10px] text-zinc-400">{current.fillColor ?? '#36606F'}</code>
                            </span>
                        </label>
                        <label className="rounded-lg bg-zinc-900 p-2">
                            <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-600">Opacidad {Math.round((current.fillOpacity ?? 1) * 100)}%</span>
                            <input type="range" min="0" max="1" step="0.05" value={current.fillOpacity ?? 1} onChange={event => onOverrideChange(overrideKey, { fillOpacity: Number(event.target.value) })} className="min-h-10 w-full accent-[#36606F]" />
                        </label>
                        <label className="rounded-lg bg-zinc-900 p-2">
                            <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-600">Contorno</span>
                            <span className="flex items-center gap-2">
                                <input type="color" value={current.outlineColor ?? '#36606F'} onChange={event => onOverrideChange(overrideKey, { outlineColor: event.target.value })} className="h-10 w-10 rounded border-0 bg-transparent" />
                                <select value={current.outlineWidth ?? 'none'} onChange={event => onOverrideChange(overrideKey, { outlineWidth: event.target.value as VisualOverride['outlineWidth'] })} className="min-h-10 min-w-0 flex-1 rounded bg-zinc-800 px-2 text-[9px] font-black uppercase text-zinc-300">
                                    <option value="none">Ninguno</option>
                                    <option value="thin">Fino</option>
                                    <option value="medium">Medio</option>
                                    <option value="strong">Fuerte</option>
                                </select>
                            </span>
                        </label>
                        <div className="rounded-lg bg-zinc-900 p-2 text-[9px] leading-relaxed text-zinc-500">En una fuente Outline, el relleno controla la geometría que contiene el TTF. CSS no puede reconstruir el interior sólido que el archivo no incluye.</div>
                    </div>
                </>
            )}
        </div>
    );
}

export function GlobalAestheticPanel({
    estetica,
    esteticas,
    viewport,
    onSelect,
    onViewportChange,
    onSave,
    onDuplicate,
    onDelete,
    onRename,
    onCompare,
    fontFamily,
    onFontFamilyChange,
    fonts,
}: {
    estetica: Estetica;
    esteticas: Estetica[];
    viewport: ViewportPreset;
    onSelect: (id: string) => void;
    onViewportChange: (viewport: ViewportPreset) => void;
    onSave: () => void;
    onDuplicate: () => void;
    onDelete: () => void;
    onRename: (name: string) => void;
    onCompare: () => void;
    fontFamily?: StudioFontFamily;
    onFontFamilyChange: (fontFamily?: StudioFontFamily) => void;
    fonts: StudioFontOption[];
}) {
    return (
        <div data-studio-chrome="true" className="border-b border-zinc-800 bg-zinc-950 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
                <span className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Estética global</span>
                <span className="rounded-md bg-emerald-500/10 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-emerald-300">Live</span>
            </div>
            <input value={estetica.name} disabled={Boolean(estetica.isOriginal || estetica.isSystem)} onChange={event => onRename(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base font-black text-white outline-none focus:border-[#36606F] disabled:text-zinc-400" aria-label="Nombre de la estética" />
            <select value={estetica.id} onChange={event => onSelect(event.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-base font-bold text-zinc-200" aria-label="Estética global">
                {esteticas.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <select value={fontFamily ?? ''} onChange={event => onFontFamilyChange((event.target.value || undefined) as StudioFontFamily | undefined)} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-200" aria-label="Tipografía global">
                <option value="">Tipografía de Marbella</option>
                {fonts.map(font => <option key={font.id} value={font.family}>{font.label}</option>)}
            </select>
            <div className="mt-2 grid grid-cols-3 gap-1">
                {(['mobile', 'tablet', 'desktop'] as const).map(option => (
                    <button key={option} type="button" onClick={() => onViewportChange(option)} style={{ minHeight: 44 }} className={`rounded-xl text-[9px] font-black uppercase tracking-widest ${viewport === option ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                        {option === 'mobile' ? '375px' : option === 'tablet' ? '768px' : '1280px+'}
                    </button>
                ))}
            </div>
            <div className="mt-2 flex gap-2">
                <button type="button" onClick={onSave} style={{ minHeight: 48 }} className="flex-1 rounded-xl bg-[#36606F] text-[9px] font-black uppercase tracking-widest text-white">Guardar</button>
                <button type="button" onClick={onDuplicate} style={{ minHeight: 48 }} className="rounded-xl bg-zinc-800 px-3 text-[9px] font-black uppercase tracking-widest text-zinc-300">Duplicar</button>
                <button type="button" onClick={onDelete} disabled={Boolean(estetica.isOriginal || estetica.isSystem)} title={estetica.isSystem ? 'Las estéticas predeterminadas no se pueden eliminar' : undefined} style={{ minHeight: 48 }} className="rounded-xl bg-rose-500/10 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300 disabled:opacity-30">Eliminar</button>
            </div>
            <button type="button" onClick={onCompare} style={{ minHeight: 44 }} className="mt-2 w-full rounded-xl bg-zinc-900 text-[9px] font-black uppercase tracking-widest text-zinc-400">Comparar exploraciones</button>
        </div>
    );
}
