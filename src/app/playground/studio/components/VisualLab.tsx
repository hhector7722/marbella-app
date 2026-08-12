'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import type { StudioFontOption } from '../font-catalog';
import type { Estetica, SandboxRoute, SelectedVisualElement, StudioFontFamily, VisualOverride, VisualOverrides, VisualTargetKind, ViewportPreset } from '../types';

const TARGET_SELECTOR = 'button, input, textarea, select, table, thead, tbody, tr, th, td, nav, header, [role="dialog"], [role="tab"], [class*="rounded"], svg, span, p, h1, h2, h3, h4, h5, h6, img, a, li, ul, ol';

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
    let rawText = element.getAttribute('aria-label') || element.textContent || '';
    if (tag === 'svg') {
        const parentBtn = element.closest('button');
        if (parentBtn) rawText = parentBtn.getAttribute('aria-label') || parentBtn.textContent || rawText;
    }
    const cleanRaw = cleanLabel(rawText);
    const label = cleanRaw || tag;

    if (tag === 'button' || element.getAttribute('role') === 'button') {
        const primary = classes.includes('bg-[#36606F]') || classes.includes('bg-blue-') || classes.includes('bg-emerald-');
        return { kind: 'button', scope: primary ? 'button:primary' : 'button:secondary', label: cleanRaw ? `BOTÓN · ${cleanRaw}` : 'BOTÓN' };
    }
    if (tag === 'svg') return { kind: 'element', scope: 'icon:svg', label: cleanRaw ? `ICONO · ${cleanRaw}` : 'ICONO' };
    if (tag === 'span' || tag === 'p' || tag.match(/^h[1-6]$/)) return { kind: 'text', scope: `text:${tag}`, label: cleanRaw ? `TEXTO · ${cleanRaw}` : 'TEXTO' };
    if (tag === 'img') return { kind: 'element', scope: 'image:default', label: cleanRaw ? `IMAGEN · ${cleanRaw}` : 'IMAGEN' };
    if (tag === 'a') return { kind: 'element', scope: 'link:default', label: cleanRaw ? `ENLACE · ${cleanRaw}` : 'ENLACE' };
    if (tag === 'input' || tag === 'textarea') return { kind: 'input', scope: 'input:default', label: cleanRaw ? `INPUT · ${cleanRaw}` : 'INPUT' };
    if (tag === 'select') return { kind: 'select', scope: 'select:default', label: cleanRaw ? `SELECTOR · ${cleanRaw}` : 'SELECTOR' };
    if (tag === 'table') return { kind: 'table', scope: 'table:default', label: cleanRaw ? `TABLA · ${cleanRaw}` : 'TABLA' };
    if (tag === 'tr') return { kind: 'row', scope: 'table:row', label: cleanRaw ? `FILA · ${cleanRaw}` : 'FILA' };
    if (tag === 'nav') return { kind: 'nav', scope: 'navigation:main', label: 'NAVEGACIÓN' };
    if (tag === 'header') return { kind: 'header', scope: 'header:main', label: 'CABECERA' };
    if (element.getAttribute('role') === 'dialog') return { kind: 'modal', scope: 'modal:default', label: cleanRaw ? `MODAL · ${cleanRaw}` : 'MODAL' };
    if (classes.includes('rounded') || classes.includes('rounded-')) return { kind: 'card', scope: 'card:default', label: cleanRaw ? `SUPERFICIE · ${cleanRaw}` : 'SUPERFICIE' };
    return { kind: 'element', scope: `${tag}:default`, label };
}

function overrideFor(element: HTMLElement, overrides: VisualOverrides, viewport: ViewportPreset): VisualOverride {
    const merge = (key: string) => {
        const responsive = overrides[key];
        if (!responsive) return {};
        return {
            ...responsive.all,
            ...responsive[viewport],
        };
    };

    return {
        ...merge('global'),
        ...merge(`component:${element.dataset.studioComponent ?? ''}`),
        ...merge(element.dataset.studioNodeKey ?? ''),
    };
}

function applyOverrideAttributes(element: HTMLElement, override: VisualOverride): void {
    const attributes = ['shape', 'weight', 'elevation', 'tone', 'padding'] as const;
    attributes.forEach(attribute => {
        const value = override[attribute];
        if (value) element.dataset[`studio${attribute[0].toUpperCase()}${attribute.slice(1)}`] = value;
        else delete element.dataset[`studio${attribute[0].toUpperCase()}${attribute.slice(1)}`];
    });
    if (override.fontFamily) element.style.setProperty('--studio-font-family', `'${override.fontFamily}'`);
    else element.style.removeProperty('--studio-font-family');
    if (override.textColor) element.style.setProperty('--studio-text-color', override.textColor);
    else element.style.removeProperty('--studio-text-color');
    if (override.textColor) element.dataset.studioTextColor = 'true';
    else delete element.dataset.studioTextColor;
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

    if (override.tone === 'transparent') {
        element.style.setProperty('background-color', 'transparent', 'important');
        element.style.setProperty('background-image', 'none', 'important');
    } else if (override.tone === 'custom' && override.backgroundColor) {
        element.style.setProperty('background-color', override.backgroundColor, 'important');
        element.style.setProperty('background-image', 'none', 'important');
    } else {
        element.style.removeProperty('background-color');
        element.style.removeProperty('background-image');
    }

    if (override.width) element.style.setProperty('width', override.width, 'important');
    else element.style.removeProperty('width');
    if (override.height) element.style.setProperty('height', override.height, 'important');
    else element.style.removeProperty('height');
    if (override.minWidth) element.style.setProperty('min-width', override.minWidth, 'important');
    else element.style.removeProperty('min-width');
    if (override.maxWidth) element.style.setProperty('max-width', override.maxWidth, 'important');
    else element.style.removeProperty('max-width');
    if (override.minHeight) element.style.setProperty('min-height', override.minHeight, 'important');
    else element.style.removeProperty('min-height');
    if (override.maxHeight) element.style.setProperty('max-height', override.maxHeight, 'important');
    else element.style.removeProperty('max-height');

    // Transform (X, Y)
    if (override.x || override.y) {
        const x = override.x || '0px';
        const y = override.y || '0px';
        element.style.setProperty('transform', `translate(${x}, ${y})`, 'important');
    } else {
        element.style.removeProperty('transform');
    }

    if (override.position) element.style.setProperty('position', override.position, 'important');
    else element.style.removeProperty('position');

    if (override.margin) element.style.setProperty('margin', override.margin, 'important');
    else element.style.removeProperty('margin');
    if (override.marginTop) element.style.setProperty('margin-top', override.marginTop, 'important');
    else element.style.removeProperty('margin-top');
    if (override.marginRight) element.style.setProperty('margin-right', override.marginRight, 'important');
    else element.style.removeProperty('margin-right');
    if (override.marginBottom) element.style.setProperty('margin-bottom', override.marginBottom, 'important');
    else element.style.removeProperty('margin-bottom');
    if (override.marginLeft) element.style.setProperty('margin-left', override.marginLeft, 'important');
    else element.style.removeProperty('margin-left');

    if (override.customPadding) element.style.setProperty('padding', override.customPadding, 'important');
    else element.style.removeProperty('padding');
    if (override.paddingTop) element.style.setProperty('padding-top', override.paddingTop, 'important');
    else element.style.removeProperty('padding-top');
    if (override.paddingRight) element.style.setProperty('padding-right', override.paddingRight, 'important');
    else element.style.removeProperty('padding-right');
    if (override.paddingBottom) element.style.setProperty('padding-bottom', override.paddingBottom, 'important');
    else element.style.removeProperty('padding-bottom');
    if (override.paddingLeft) element.style.setProperty('padding-left', override.paddingLeft, 'important');
    else element.style.removeProperty('padding-left');

    if (override.gap) element.style.setProperty('gap', override.gap, 'important');
    else element.style.removeProperty('gap');

    if (override.display) element.style.setProperty('display', override.display, 'important');
    else element.style.removeProperty('display');
    if (override.flexDirection) element.style.setProperty('flex-direction', override.flexDirection, 'important');
    else element.style.removeProperty('flex-direction');
    if (override.alignItems) element.style.setProperty('align-items', override.alignItems, 'important');
    else element.style.removeProperty('align-items');
    if (override.justifyContent) element.style.setProperty('justify-content', override.justifyContent, 'important');
    else element.style.removeProperty('justify-content');

    if (override.borderWidth) element.style.setProperty('border-width', override.borderWidth, 'important');
    else element.style.removeProperty('border-width');
    if (override.borderColor) element.style.setProperty('border-color', override.borderColor, 'important');
    else element.style.removeProperty('border-color');
    if (override.borderStyle) element.style.setProperty('border-style', override.borderStyle, 'important');
    else element.style.removeProperty('border-style');

    if (override.boxShadow) {
        const shadowMap = {
            none: 'none',
            subtle: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
            medium: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
            strong: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
        };
        element.style.setProperty('box-shadow', shadowMap[override.boxShadow], 'important');
    } else {
        element.style.removeProperty('box-shadow');
    }

    if (override.opacity !== undefined) element.style.setProperty('opacity', String(override.opacity), 'important');
    else element.style.removeProperty('opacity');

    if (override.fontSize) element.style.setProperty('font-size', override.fontSize, 'important');
    else element.style.removeProperty('font-size');

    if (override.fontWeight) element.style.setProperty('font-weight', override.fontWeight, 'important');
    else element.style.removeProperty('font-weight');

    if (override.fontStyle) element.style.setProperty('font-style', override.fontStyle, 'important');
    else element.style.removeProperty('font-style');

    if (override.textAlign) element.style.setProperty('text-align', override.textAlign, 'important');
    else element.style.removeProperty('text-align');
}

function realElements(root: HTMLElement): HTMLElement[] {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
    document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(dialog => {
        if (dialog.closest('[data-studio-chrome="true"]')) return;
        elements.push(dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>(TARGET_SELECTOR)));
    });
    return Array.from(new Set(elements)).filter(element => {
        if (element.closest('[data-studio-chrome="true"]')) return false;

        const tag = element.tagName.toLowerCase();

        // Descartar SVGs que pertenezcan a Recharts o sean muy grandes (gráficos, no iconos)
        if (tag === 'svg') {
            const isChart = element.classList.contains('recharts-surface') || element.clientWidth > 100;
            if (isChart) return false;
        }

        // Descartar spans internos puramente estructurales (ej. textos dentro de botones sin diseño particular)
        if (tag === 'span') {
            const parentBtn = element.closest('button, [role="button"]');
            if (parentBtn) {
                // Si el span tiene un rol decorativo evidente (fondo o borde), lo mantenemos. Si no, recaerá en el botón.
                if (!element.className.includes('bg-') && !element.className.includes('border')) {
                    return false;
                }
            }
        }

        return true;
    });
}

export function VisualLabSurface({
    route,
    overrides,
    viewport,
    children,
}: {
    route: SandboxRoute;
    overrides: VisualOverrides;
    viewport: ViewportPreset;
    children: React.ReactNode;
}) {
    const rootRef = React.useRef<HTMLDivElement>(null);
    const labMode = useSandboxStore(s => s.labMode);
    const selectedElement = useSandboxStore(s => s.selectedElement);
    const setSelectedElement = useSandboxStore(s => s.setSelectedElement);

    const indexElements = React.useCallback(() => {
        const root = rootRef.current;
        if (!root) return;
        const elements = realElements(root);
        const counts = new Map<string, number>();
        elements.forEach(element => {
            const descriptor = classify(element);
            const base = `${route}:${descriptor.kind}:${descriptor.scope}:${descriptor.label}`;
            const index = counts.get(base) ?? 0;
            counts.set(base, index + 1);

            // Solo regeneramos los keys si no los tienen o si cambiaron (estabilidad)
            const newKey = `${base}:${index}`;
            if (element.dataset.studioNodeKey !== newKey) {
                element.dataset.studioNodeKey = newKey;
            }

            element.dataset.studioComponent = descriptor.scope;
            element.dataset.studioKind = descriptor.kind;
            if (!root.contains(element)) {
                element.dataset.studioPortal = 'true';
                element.dataset.marbellaSandbox = 'true';
            }
            applyOverrideAttributes(element, overrideFor(element, overrides, viewport));

            if (element.dataset.studioNodeKey === selectedElement?.key) {
                element.dataset.studioSelected = 'true';
            }
        });
    }, [route, overrides, selectedElement, viewport]);

    React.useEffect(() => {
        indexElements();

        // Observador de mutaciones para atrapar modales y portales que se abren dinámicamente
        const observer = new MutationObserver((mutations) => {
            let shouldReindex = false;
            for (const mutation of mutations) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    shouldReindex = true;
                    break;
                }
            }
            if (shouldReindex) indexElements();
        });

        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            if (rootRef.current) {
                realElements(rootRef.current).forEach(element => {
                    delete element.dataset.studioNodeKey;
                    delete element.dataset.studioComponent;
                    delete element.dataset.studioKind;
                    delete element.dataset.studioHover;
                    delete element.dataset.studioSelected;
                    delete element.dataset.studioTextColor;
                    delete element.dataset.studioFillColor;
                    if (element.dataset.studioPortal === 'true') {
                        delete element.dataset.studioPortal;
                        delete element.dataset.marbellaSandbox;
                    }
                });
            }
        };
    }, [indexElements]);

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
        let dragInfo: {
            element: HTMLElement;
            key: string;
            startX: number;
            startY: number;
            initialX: number;
            initialY: number;
            moved: boolean;
        } | null = null;

        const handleMouseDown = (event: MouseEvent) => {
            if (!labMode) return;
            const path = event.composedPath() as HTMLElement[];
            let element: HTMLElement | null = null;
            for (const node of path) {
                if (node instanceof HTMLElement && node.hasAttribute('data-studio-node-key') && !node.closest('[data-studio-chrome="true"]')) {
                    element = node;
                    break;
                }
            }
            if (!element) return;

            // Calculate current translation
            const transform = window.getComputedStyle(element).transform;
            let initialX = 0;
            let initialY = 0;
            if (transform !== 'none') {
                try {
                    const matrix = new DOMMatrixReadOnly(transform);
                    initialX = matrix.m41;
                    initialY = matrix.m42;
                } catch (e) {
                    // Fallback if DOMMatrix fails
                }
            }

            dragInfo = {
                element,
                key: element.dataset.studioNodeKey!,
                startX: event.clientX,
                startY: event.clientY,
                initialX,
                initialY,
                moved: false,
            };
        };

        const handleMouseMove = (event: MouseEvent) => {
            if (!dragInfo) return;
            const dx = event.clientX - dragInfo.startX;
            const dy = event.clientY - dragInfo.startY;
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                dragInfo.moved = true;
            }
            if (dragInfo.moved) {
                dragInfo.element.style.setProperty('transform', `translate(${dragInfo.initialX + dx}px, ${dragInfo.initialY + dy}px)`, 'important');
            }
        };

        const handleClick = (event: MouseEvent) => {
            if (!labMode) return;

            if (dragInfo?.moved) {
                // If it was a drag, handle in MouseUp and prevent click
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            const path = event.composedPath() as HTMLElement[];
            let element: HTMLElement | null = null;

            for (const node of path) {
                if (node instanceof HTMLElement && node.hasAttribute('data-studio-node-key') && !node.closest('[data-studio-chrome="true"]')) {
                    element = node;
                    break;
                }
            }

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

            if (window !== window.parent) {
                window.parent.postMessage({ type: 'MARBELLA_STUDIO_CLICK', payload: selection }, '*');
            }
        };

        const handleMouseUp = (event: MouseEvent) => {
            if (!dragInfo) return;
            const info = dragInfo;
            // Delay clearing to allow click event to be blocked if needed
            setTimeout(() => { dragInfo = null; }, 0);

            if (info.moved) {
                const dx = event.clientX - info.startX;
                const dy = event.clientY - info.startY;
                if (window !== window.parent) {
                    window.parent.postMessage({
                        type: 'MARBELLA_STUDIO_DRAG_END',
                        payload: {
                            key: info.key,
                            x: `${info.initialX + dx}px`,
                            y: `${info.initialY + dy}px`
                        }
                    }, '*');
                }

                // Keep element selected
                const descriptor = classify(info.element);
                const selection: SelectedVisualElement = {
                    key: info.element.dataset.studioNodeKey ?? '',
                    route,
                    kind: descriptor.kind,
                    label: descriptor.label,
                    componentScope: descriptor.scope,
                    tagName: info.element.tagName.toLowerCase(),
                };
                setSelectedElement(selection);
                document.querySelectorAll<HTMLElement>('[data-studio-selected="true"]').forEach(node => delete node.dataset.studioSelected);
                info.element.dataset.studioSelected = 'true';
            }
        };

        document.addEventListener('mouseover', handleOver);
        document.addEventListener('mouseout', handleOut);
        document.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('mousemove', handleMouseMove, true);
        document.addEventListener('mouseup', handleMouseUp, true);
        document.addEventListener('click', handleClick, true);
        return () => {
            document.removeEventListener('mouseover', handleOver);
            document.removeEventListener('mouseout', handleOut);
            document.removeEventListener('mousedown', handleMouseDown, true);
            document.removeEventListener('mousemove', handleMouseMove, true);
            document.removeEventListener('mouseup', handleMouseUp, true);
            document.removeEventListener('click', handleClick, true);
        };
    }, [labMode, route, setSelectedElement]);

    // El efecto applyOverrideAttributes es manejado por indexElements y el observer.

    return <div ref={rootRef} data-studio-real-app="true" className="relative h-full">{children}</div>;
}

export function VisualLabPanel({
    overrides,
    onOverrideChange,
    fonts,
    viewport,
}: {
    overrides: VisualOverrides;
    onOverrideChange: (key: string, vp: 'all' | 'mobile' | 'tablet' | 'desktop', patch: VisualOverride) => void;
    fonts: StudioFontOption[];
    viewport: ViewportPreset;
}) {
    const labMode = useSandboxStore(s => s.labMode);
    const setLabMode = useSandboxStore(s => s.setLabMode);
    const selected = useSandboxStore(s => s.selectedElement);
    const [scope, setScope] = React.useState<'instance' | 'component' | 'global'>('instance');
    const [openSection, setOpenSection] = React.useState<string>('apariencia');

    const overrideKey = selected
        ? scope === 'instance'
            ? selected.key
            : scope === 'component'
                ? `component:${selected.componentScope}`
                : 'global'
        : 'global';

    const currentResponsive = overrides[overrideKey] ?? {};
    const current = { ...currentResponsive.all, ...currentResponsive[viewport] };

    const update = (patch: VisualOverride) => {
        onOverrideChange(overrideKey, scope === 'global' ? 'all' : viewport, patch);
    };

    const reset = (keys: (keyof VisualOverride)[]) => {
        const patch: any = {};
        keys.forEach(k => patch[k] = undefined);
        update(patch);
    };

    const resetAll = () => {
        onOverrideChange(overrideKey, scope === 'global' ? 'all' : viewport, null as any);
    };

    const Section = ({ id, title, children }: { id: string, title: string, children: React.ReactNode }) => {
        const isOpen = openSection === id;
        return (
            <div className="border-b border-zinc-800/50">
                <button type="button" onClick={() => setOpenSection(isOpen ? '' : id)} className="flex w-full items-center justify-between py-3 px-1 text-[10px] font-black uppercase tracking-widest text-zinc-400 hover:text-white">
                    {title}
                    <span className="text-zinc-600">{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && <div className="pb-4 pt-1">{children}</div>}
            </div>
        );
    };

    const [paddingUnlocked, setPaddingUnlocked] = React.useState(false);
    const [marginUnlocked, setMarginUnlocked] = React.useState(false);

    return (
        <div data-studio-chrome="true" className="flex h-full flex-col bg-zinc-950">
            <div className="border-b border-zinc-800 px-4 py-3 shrink-0">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <div className="text-[9px] font-black uppercase tracking-widest text-zinc-500">Inspector Visual</div>
                        <div className="mt-1 text-sm font-black text-white">{selected ? selected.label : 'Nada seleccionado'}</div>
                    </div>
                    <button type="button" onClick={() => setLabMode(!labMode)} style={{ minHeight: 48 }} className={`rounded-xl px-3 text-[9px] font-black uppercase tracking-widest ${labMode ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-300'}`}>
                        {labMode ? 'Seleccionando' : 'Seleccionar'}
                    </button>
                </div>

                {selected && (
                    <div className="mt-3 flex gap-2 items-center">
                        <div className="flex-1 grid grid-cols-3 gap-1">
                            {(['instance', 'component', 'global'] as const).map(option => (
                                <button key={option} type="button" onClick={() => setScope(option)} style={{ minHeight: 44 }} className={`rounded-lg text-[9px] font-black uppercase tracking-widest leading-tight ${scope === option ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800'}`}>
                                    {scopeLabel(selected.kind, option)}
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={resetAll} style={{ minHeight: 44 }} className="shrink-0 rounded-lg bg-rose-500/10 px-3 text-[9px] font-black uppercase tracking-widest text-rose-300 hover:bg-rose-500/20" title="Restablecer este elemento al original">
                            Reset
                        </button>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
                {!selected && (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                        Activa el modo <strong>Seleccionar</strong> y haz click en cualquier elemento del preview para editarlo.
                    </div>
                )}

                {selected && (
                    <>
                        <Section id="apariencia" title="Apariencia">
                            <div className="grid gap-3">
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Fuente {current.fontFamily && <button onClick={() => reset(['fontFamily'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <select value={current.fontFamily ?? ''} onChange={e => update({ fontFamily: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none">
                                        <option value="">Heredada</option>
                                        {fonts.map(font => <option key={font.id} value={font.family} style={{ fontFamily: font.family }}>{font.label}</option>)}
                                    </select>
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block">
                                        <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Tamaño {current.fontSize && <button onClick={() => reset(['fontSize'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                        <input type="text" placeholder="ej. 16px, 1.5rem" value={current.fontSize ?? ''} onChange={e => update({ fontSize: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                    </label>
                                    <label className="block">
                                        <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Peso {current.fontWeight && <button onClick={() => reset(['fontWeight'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                        <select value={current.fontWeight ?? ''} onChange={e => update({ fontWeight: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none">
                                            <option value="">Heredado</option>
                                            <option value="400">Normal</option>
                                            <option value="500">Medium</option>
                                            <option value="600">Semibold</option>
                                            <option value="700">Bold</option>
                                            <option value="900">Black</option>
                                        </select>
                                    </label>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block rounded-lg bg-zinc-900 p-2">
                                        <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                                            Color Texto
                                            {current.textColor && <button onClick={() => reset(['textColor'])} className="text-zinc-600 hover:text-white">✕</button>}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={current.textColor ?? '#ffffff'} onChange={e => update({ textColor: e.target.value })} className="h-6 w-6 rounded border-0 bg-transparent p-0" />
                                            <span className="text-[10px] text-zinc-300 font-mono">{current.textColor ?? 'Auto'}</span>
                                        </div>
                                    </label>
                                    <label className="block rounded-lg bg-zinc-900 p-2">
                                        <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                                            Fondo
                                            {(current.backgroundColor || current.fillColor) && <button onClick={() => reset(['backgroundColor', 'fillColor', 'tone'])} className="text-zinc-600 hover:text-white">✕</button>}
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <input type="color" value={current.backgroundColor ?? current.fillColor ?? '#000000'} onChange={e => update({ tone: 'custom', backgroundColor: e.target.value, fillColor: e.target.value })} className="h-6 w-6 rounded border-0 bg-transparent p-0" />
                                            <span className="text-[10px] text-zinc-300 font-mono">{current.backgroundColor ?? current.fillColor ?? 'Auto'}</span>
                                        </div>
                                        <button onClick={() => update({ tone: 'transparent' })} className="mt-2 w-full rounded bg-zinc-800 py-1 text-[8px] font-black uppercase text-zinc-400 hover:bg-zinc-700 hover:text-white">Transparente</button>
                                    </label>
                                </div>
                            </div>
                        </Section>

                        <Section id="tamano" title="Tamaño">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Ancho {current.width && <button onClick={() => reset(['width'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <input type="text" placeholder="auto, 100%, 200px" value={current.width ?? ''} onChange={e => update({ width: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Alto {current.height && <button onClick={() => reset(['height'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <input type="text" placeholder="auto, 100%, 200px" value={current.height ?? ''} onChange={e => update({ height: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                </label>
                            </div>
                        </Section>

                        <Section id="posicion" title="Posición Visual">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Eje X <button onClick={() => reset(['x'])} className="text-zinc-600 hover:text-white">✕</button></span>
                                    <input type="text" placeholder="0px, 50%, 2rem" value={current.x ?? ''} onChange={e => update({ x: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none mb-1" />
                                    <input type="range" min="-100" max="100" value={parseInt(current.x || '0')} onChange={e => update({ x: `${e.target.value}px` })} className="w-full accent-[#36606F]" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Eje Y <button onClick={() => reset(['y'])} className="text-zinc-600 hover:text-white">✕</button></span>
                                    <input type="text" placeholder="0px, 50%, 2rem" value={current.y ?? ''} onChange={e => update({ y: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none mb-1" />
                                    <input type="range" min="-100" max="100" value={parseInt(current.y || '0')} onChange={e => update({ y: `${e.target.value}px` })} className="w-full accent-[#36606F]" />
                                </label>
                            </div>
                        </Section>

                        <Section id="espaciado" title="Espaciado (Margin, Padding, Gap)">
                            <div className="grid gap-4">
                                <label className="block">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Gap (Espacio entre hijos)</span>
                                    <input type="text" placeholder="1rem, 16px" value={current.gap ?? ''} onChange={e => update({ gap: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                </label>

                                <div className="rounded-lg bg-zinc-900/50 p-2 border border-zinc-800">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Padding</span>
                                        <button onClick={() => { setPaddingUnlocked(!paddingUnlocked); if (paddingUnlocked) { update({ paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined }); } }} className="text-zinc-500 hover:text-white" title={paddingUnlocked ? 'Bloquear y usar valor único' : 'Desbloquear lados'}>
                                            {paddingUnlocked ? '🔓' : '🔒'}
                                        </button>
                                    </div>
                                    {!paddingUnlocked ? (
                                        <input type="text" placeholder="ej. 16px" value={current.customPadding ?? ''} onChange={e => update({ customPadding: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" placeholder="Top" value={current.paddingTop ?? ''} onChange={e => update({ paddingTop: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Top" />
                                            <input type="text" placeholder="Right" value={current.paddingRight ?? ''} onChange={e => update({ paddingRight: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Right" />
                                            <input type="text" placeholder="Bottom" value={current.paddingBottom ?? ''} onChange={e => update({ paddingBottom: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Bottom" />
                                            <input type="text" placeholder="Left" value={current.paddingLeft ?? ''} onChange={e => update({ paddingLeft: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Left" />
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-lg bg-zinc-900/50 p-2 border border-zinc-800">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Margin</span>
                                        <button onClick={() => { setMarginUnlocked(!marginUnlocked); if (marginUnlocked) { update({ marginTop: undefined, marginRight: undefined, marginBottom: undefined, marginLeft: undefined }); } }} className="text-zinc-500 hover:text-white" title={marginUnlocked ? 'Bloquear y usar valor único' : 'Desbloquear lados'}>
                                            {marginUnlocked ? '🔓' : '🔒'}
                                        </button>
                                    </div>
                                    {!marginUnlocked ? (
                                        <input type="text" placeholder="ej. 0px" value={current.margin ?? ''} onChange={e => update({ margin: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <input type="text" placeholder="Top" value={current.marginTop ?? ''} onChange={e => update({ marginTop: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Top" />
                                            <input type="text" placeholder="Right" value={current.marginRight ?? ''} onChange={e => update({ marginRight: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Right" />
                                            <input type="text" placeholder="Bottom" value={current.marginBottom ?? ''} onChange={e => update({ marginBottom: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Bottom" />
                                            <input type="text" placeholder="Left" value={current.marginLeft ?? ''} onChange={e => update({ marginLeft: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-[10px] text-white outline-none" title="Left" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Section>

                        <Section id="avanzado" title="Avanzado">
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Opacidad {current.opacity !== undefined && <button onClick={() => reset(['opacity'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <div className="flex items-center gap-2">
                                        <input type="range" min="0" max="1" step="0.05" value={current.opacity ?? 1} onChange={e => update({ opacity: Number(e.target.value) })} className="w-full accent-[#36606F]" />
                                        <span className="text-[10px] text-zinc-400">{Math.round((current.opacity ?? 1) * 100)}%</span>
                                    </div>
                                </label>
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Alineación {current.textAlign && <button onClick={() => reset(['textAlign'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <select value={current.textAlign ?? ''} onChange={e => update({ textAlign: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="left">Izquierda</option>
                                        <option value="center">Centro</option>
                                        <option value="right">Derecha</option>
                                    </select>
                                </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block rounded-lg bg-zinc-900 p-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Color Borde</span>
                                    <input type="color" value={current.borderColor ?? '#000000'} onChange={e => update({ borderColor: e.target.value })} className="h-6 w-full rounded border-0 bg-transparent p-0" />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Grosor</span>
                                    <input type="text" placeholder="1px" value={current.borderWidth ?? ''} onChange={e => update({ borderWidth: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none" />
                                </label>
                                <label className="block col-span-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Estilo</span>
                                    <select value={current.borderStyle ?? ''} onChange={e => update({ borderStyle: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="solid">Sólido</option>
                                        <option value="dashed">Discontinuo</option>
                                        <option value="dotted">Punteado</option>
                                    </select>
                                </label>
                                <div className="col-span-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Sombra</span>
                                    <div className="grid grid-cols-4 gap-1">
                                        {(['none', 'subtle', 'medium', 'strong'] as const).map(s => (
                                            <button key={s} onClick={() => update({ boxShadow: s })} className={`rounded py-1 text-[9px] font-black uppercase tracking-widest ${current.boxShadow === s ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>{s === 'none' ? 'Sin' : s}</button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </Section>

                        <Section id="avanzado" title="Avanzado (Layout)">
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Display</span>
                                    <select value={current.display ?? ''} onChange={e => update({ display: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="block">Block</option>
                                        <option value="flex">Flex</option>
                                        <option value="grid">Grid</option>
                                        <option value="inline-block">Inline Block</option>
                                        <option value="none">None</option>
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Position</span>
                                    <select value={current.position ?? ''} onChange={e => update({ position: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="static">Static</option>
                                        <option value="relative">Relative</option>
                                        <option value="absolute">Absolute</option>
                                        <option value="fixed">Fixed</option>
                                    </select>
                                </label>
                                <label className="block col-span-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Flex Direction</span>
                                    <div className="flex gap-1">
                                        {(['row', 'column', 'row-reverse', 'column-reverse'] as const).map(d => (
                                            <button key={d} onClick={() => update({ flexDirection: d })} className={`flex-1 rounded py-1 text-[8px] font-black uppercase tracking-widest ${current.flexDirection === d ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>{d.split('-')[0]}</button>
                                        ))}
                                    </div>
                                </label>
                                <label className="block col-span-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Align Items</span>
                                    <select value={current.alignItems ?? ''} onChange={e => update({ alignItems: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="center">Center</option>
                                        <option value="flex-start">Start</option>
                                        <option value="flex-end">End</option>
                                        <option value="stretch">Stretch</option>
                                    </select>
                                </label>
                                <label className="block col-span-2">
                                    <span className="mb-1 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Justify Content</span>
                                    <select value={current.justifyContent ?? ''} onChange={e => update({ justifyContent: e.target.value as any })} className="w-full rounded bg-zinc-900 p-2 text-[10px] uppercase font-black text-white outline-none">
                                        <option value="">Auto</option>
                                        <option value="center">Center</option>
                                        <option value="flex-start">Start</option>
                                        <option value="flex-end">End</option>
                                        <option value="space-between">Space Between</option>
                                    </select>
                                </label>
                            </div>
                        </Section>

                        <div className="mt-4 border-t border-zinc-800 pt-4">
                            <button onClick={resetAll} className="w-full rounded-xl bg-red-500/10 py-3 text-[9px] font-black uppercase tracking-widest text-red-400 hover:bg-red-500/20">
                                Restablecer todo en este ámbito
                            </button>
                        </div>
                    </>
                )}
            </div>
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
    globalScale,
    onGlobalScaleChange,
    fonts,
    background,
    onBackgroundChange,
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
    globalScale?: string;
    onGlobalScaleChange?: (scale?: string) => void;
    fonts: StudioFontOption[];
    background?: NonNullable<Estetica['background']>;
    onBackgroundChange?: (bg: NonNullable<Estetica['background']>) => void;
}) {
    // Usar el background pasado (draft) o el de la estética guardada como fallback
    const activeBackground = background ?? estetica.background;
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
            <select value={globalScale ?? ''} onChange={event => onGlobalScaleChange?.(event.target.value || undefined)} className="mt-2 min-h-12 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-sm font-bold text-zinc-200" aria-label="Escala global">
                <option value="">Escala por defecto (100%)</option>
                <option value="80%">80% (Extra compacto)</option>
                <option value="90%">90% (Compacto)</option>
                <option value="110%">110% (Amplio)</option>
                <option value="120%">120% (Muy amplio)</option>
            </select>
            <div className="mt-2 grid grid-cols-3 gap-1">
                {(['mobile', 'tablet', 'desktop'] as const).map(option => (
                    <button key={option} type="button" onClick={() => onViewportChange(option)} style={{ minHeight: 44 }} className={`rounded-xl text-[9px] font-black uppercase tracking-widest ${viewport === option ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-500'}`}>
                        {option === 'mobile' ? '375px' : option === 'tablet' ? '768px' : '1280px+'}
                    </button>
                ))}
            </div>

            <div className="mt-2 rounded-xl bg-zinc-900 p-3">
                <span className="mb-2 block text-[8px] font-black uppercase tracking-widest text-zinc-500">Fondo Global de App</span>
                <div className="grid grid-cols-3 gap-1 mb-2">
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'solid', color1: '#000000', opacity: 1 })} style={{ minHeight: 36 }} className={`rounded-lg text-[9px] font-black uppercase tracking-widest ${activeBackground?.type === 'solid' ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}>Sólido</button>
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'gradient', gradientType: 'linear', color1: '#111827', color2: '#000000', gradientDirection: 'to bottom' })} style={{ minHeight: 36 }} className={`rounded-lg text-[9px] font-black uppercase tracking-widest ${activeBackground?.type === 'gradient' ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}>Degradado</button>
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'none' })} style={{ minHeight: 36 }} className={`rounded-lg text-[9px] font-black uppercase tracking-widest ${activeBackground?.type === 'none' || !activeBackground ? 'bg-[#36606F] text-white' : 'bg-zinc-800 text-zinc-400'}`}>Por defecto</button>
                </div>
                {activeBackground && activeBackground.type !== 'none' && (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="flex items-center gap-2">
                            <input type="color" value={activeBackground.color1 ?? '#000000'} onChange={e => onBackgroundChange?.({ ...activeBackground, color1: e.target.value })} className="h-8 w-8 rounded border-0 bg-transparent" />
                            <span className="text-[9px] text-zinc-400 font-bold uppercase">Color {activeBackground.type === 'gradient' ? '1' : ''}</span>
                        </label>
                        {activeBackground.type === 'gradient' && (
                            <label className="flex items-center gap-2">
                                <input type="color" value={activeBackground.color2 ?? '#000000'} onChange={e => onBackgroundChange?.({ ...activeBackground, color2: e.target.value })} className="h-8 w-8 rounded border-0 bg-transparent" />
                                <span className="text-[9px] text-zinc-400 font-bold uppercase">Color 2</span>
                            </label>
                        )}
                        {activeBackground.type === 'gradient' && (
                            <select value={activeBackground.gradientType ?? 'linear'} onChange={e => onBackgroundChange?.({ ...activeBackground, gradientType: e.target.value as any })} className="col-span-2 min-h-8 rounded bg-zinc-800 px-2 text-[9px] font-black uppercase text-zinc-300">
                                <option value="linear">Lineal</option>
                                <option value="radial">Radial</option>
                                <option value="conic">Cónico</option>
                            </select>
                        )}
                        <div className="col-span-2 flex gap-1 mt-1">
                            <button onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, blur: (activeBackground.effects?.blur || 0) ? 0 : 20 } })} className={`flex-1 rounded p-1 text-[8px] font-bold uppercase ${activeBackground.effects?.blur ? 'bg-indigo-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Blur</button>
                            <button onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, grain: !activeBackground.effects?.grain } })} className={`flex-1 rounded p-1 text-[8px] font-bold uppercase ${activeBackground.effects?.grain ? 'bg-amber-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Ruido</button>
                            <button onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, vignette: !activeBackground.effects?.vignette } })} className={`flex-1 rounded p-1 text-[8px] font-bold uppercase ${activeBackground.effects?.vignette ? 'bg-rose-500 text-white' : 'bg-zinc-800 text-zinc-400'}`}>Viñeta</button>
                        </div>
                    </div>
                )}
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
