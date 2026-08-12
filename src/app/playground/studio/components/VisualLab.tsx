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
    // Composition routing
    if (override.composition) {
        element.dataset.studioCompositionHost = 'true';
        element.dataset.studioComposition = override.composition;
    } else {
        delete element.dataset.studioCompositionHost;
        delete element.dataset.studioComposition;
    }

    let targetBg = element;
    const targetIcon = element.querySelector<HTMLElement>('[data-studio-target="icon"]');
    const targetText = element.querySelector<HTMLElement>('[data-studio-target="text"]');

    if (override.composition === 'outside') {
        const innerBg = element.querySelector<HTMLElement>('[data-studio-target="bg"]');
        if (innerBg) {
            targetBg = innerBg;
            // Clear outer element styles so it becomes purely a wrapper
            element.style.setProperty('background-color', 'transparent', 'important');
            element.style.setProperty('background-image', 'none', 'important');
            element.style.removeProperty('padding');
            element.style.removeProperty('padding-top');
            element.style.removeProperty('padding-right');
            element.style.removeProperty('padding-bottom');
            element.style.removeProperty('padding-left');
        }
    }

    if (override.composition === 'icon-only' && targetText) {
        targetText.style.setProperty('display', 'none', 'important');
    } else if (targetText) {
        targetText.style.removeProperty('display');
    }

    if (override.composition === 'text-only' && targetIcon) {
        targetIcon.style.setProperty('display', 'none', 'important');
        const innerBg = element.querySelector<HTMLElement>('[data-studio-target="bg"]');
        if (innerBg) innerBg.style.setProperty('display', 'none', 'important');
    } else if (targetIcon) {
        targetIcon.style.removeProperty('display');
        const innerBg = element.querySelector<HTMLElement>('[data-studio-target="bg"]');
        if (innerBg) innerBg.style.removeProperty('display');
    }

    if (override.fontFamily) {
        element.dataset.studioHasFontFamily = 'true';
        element.style.setProperty('--studio-font-family', `"${override.fontFamily}"`);
    } else {
        delete element.dataset.studioHasFontFamily;
        element.style.removeProperty('--studio-font-family');
    }

    if (override.textColor) {
        element.dataset.studioHasTextColor = 'true';
        element.style.setProperty('--studio-text-color', override.textColor);
    } else {
        delete element.dataset.studioHasTextColor;
        element.style.removeProperty('--studio-text-color');
    }

    if (override.fontSize) {
        element.dataset.studioHasFontSize = 'true';
        element.style.setProperty('--studio-font-size', override.fontSize);
    } else {
        delete element.dataset.studioHasFontSize;
        element.style.removeProperty('--studio-font-size');
    }

    if (override.fontWeight) {
        element.dataset.studioHasFontWeight = 'true';
        element.style.setProperty('--studio-font-weight', override.fontWeight);
    } else {
        delete element.dataset.studioHasFontWeight;
        element.style.removeProperty('--studio-font-weight');
    }

    if (override.tone === 'transparent') {
        targetBg.style.setProperty('background-color', 'transparent', 'important');
        targetBg.style.setProperty('background-image', 'none', 'important');
    } else if (override.tone === 'custom' && override.backgroundColor) {
        targetBg.style.setProperty('background-color', override.backgroundColor, 'important');
        targetBg.style.setProperty('background-image', 'none', 'important');
    } else {
        targetBg.style.removeProperty('background-color');
        targetBg.style.removeProperty('background-image');
    }

    if (override.opacity !== undefined) element.style.setProperty('opacity', String(override.opacity), 'important');
    else element.style.removeProperty('opacity');

    if (override.fontSize) element.style.setProperty('font-size', override.fontSize, 'important');
    else element.style.removeProperty('font-size');

    if (override.fontWeight) element.style.setProperty('font-weight', override.fontWeight, 'important');
    else element.style.removeProperty('font-weight');

    if (override.width) element.style.setProperty('width', override.width, 'important');
    else element.style.removeProperty('width');
    if (override.height) element.style.setProperty('height', override.height, 'important');
    else element.style.removeProperty('height');

    if (override.x || override.y) {
        const x = override.x || '0px';
        const y = override.y || '0px';
        element.style.setProperty('transform', `translate(${x}, ${y})`, 'important');
    } else {
        element.style.removeProperty('transform');
    }

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

    if (override.customPadding) targetBg.style.setProperty('padding', override.customPadding, 'important');
    else targetBg.style.removeProperty('padding');
    if (override.paddingTop) targetBg.style.setProperty('padding-top', override.paddingTop, 'important');
    else targetBg.style.removeProperty('padding-top');
    if (override.paddingRight) targetBg.style.setProperty('padding-right', override.paddingRight, 'important');
    else targetBg.style.removeProperty('padding-right');
    if (override.paddingBottom) targetBg.style.setProperty('padding-bottom', override.paddingBottom, 'important');
    else targetBg.style.removeProperty('padding-bottom');
    if (override.paddingLeft) targetBg.style.setProperty('padding-left', override.paddingLeft, 'important');
    else targetBg.style.removeProperty('padding-left');

    if (override.gap) element.style.setProperty('gap', override.gap, 'important');
    else element.style.removeProperty('gap');
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

function StepperControl({ label, value, onChange, onReset, step = 1, unit = 'px', min = -9999, max = 9999 }: { label: React.ReactNode, value: string | number | undefined, onChange: (val: string | number) => void, onReset?: () => void, step?: number, unit?: string, min?: number, max?: number }) {
    const handleIncrement = () => {
        const current = value !== undefined ? parseFloat(String(value)) || 0 : 0;
        const next = Math.min(current + step, max);
        onChange(unit ? `${next}${unit}` : next);
    };
    
    const handleDecrement = () => {
        const current = value !== undefined ? parseFloat(String(value)) || 0 : 0;
        const next = Math.max(current - step, min);
        onChange(unit ? `${next}${unit}` : next);
    };
    
    return (
        <label className="block">
            <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">
                {label} {value !== undefined && onReset && <button type="button" onClick={onReset} className="text-zinc-600 hover:text-white">✕</button>}
            </span>
            <div className="flex items-center justify-between rounded bg-zinc-900 p-1">
                <button type="button" onClick={handleDecrement} className="h-6 w-6 rounded bg-zinc-800 text-white hover:bg-zinc-700 flex items-center justify-center font-bold text-xs">-</button>
                <span className="text-xs font-mono text-white text-center flex-1">{value === undefined ? 'Auto' : value}</span>
                <button type="button" onClick={handleIncrement} className="h-6 w-6 rounded bg-zinc-800 text-white hover:bg-zinc-700 flex items-center justify-center font-bold text-xs">+</button>
            </div>
        </label>
    );
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

    const renderSection = (id: string, title: string, children: React.ReactNode) => {
        const isOpen = openSection === id;
        return (
            <div className="border-t border-zinc-800">
                <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? '' : id)}
                    className="flex w-full items-center justify-between p-4 text-left font-bold text-white hover:bg-zinc-800"
                >
                    <span className="text-[10px] uppercase tracking-widest">{title}</span>
                    <span className="text-zinc-500">{isOpen ? '▼' : '▶'}</span>
                </button>
                {isOpen && <div className="p-4 pt-0">{children}</div>}
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

            <div className="flex-1 overflow-y-auto">
                {!selected && (
                    <div className="py-8 text-center text-zinc-500 text-xs">
                        Activa el modo <strong>Seleccionar</strong> y haz click en cualquier elemento del preview para editarlo.
                    </div>
                )}

                {selected && (
                    <>
                        {selected.tagName === 'button' && renderSection("composicion", "Composición", (
                            <div className="grid grid-cols-2 gap-2">
                                <button type="button" onClick={() => update({ composition: 'inside' })} className={`rounded p-2 text-xs font-bold ${(!current.composition || current.composition === 'inside') ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Icono + Texto Dentro</button>
                                <button type="button" onClick={() => update({ composition: 'outside' })} className={`rounded p-2 text-xs font-bold ${current.composition === 'outside' ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Icono Arriba + Texto Fuera</button>
                                <button type="button" onClick={() => update({ composition: 'icon-only' })} className={`rounded p-2 text-xs font-bold ${current.composition === 'icon-only' ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Solo Icono</button>
                                <button type="button" onClick={() => update({ composition: 'text-only' })} className={`rounded p-2 text-xs font-bold ${current.composition === 'text-only' ? 'bg-[#36606F] text-white' : 'bg-zinc-900 text-zinc-400 hover:text-white'}`}>Solo Texto</button>
                            </div>
                        ))}

                        {renderSection("apariencia", "Apariencia", (
                            <div className="grid gap-3">
                                <label className="block">
                                    <span className="mb-1 flex justify-between text-[8px] font-black uppercase tracking-widest text-zinc-500">Fuente {current.fontFamily && <button onClick={() => reset(['fontFamily'])} className="text-zinc-600 hover:text-white">✕</button>}</span>
                                    <select value={current.fontFamily ?? ''} onChange={e => update({ fontFamily: e.target.value })} className="w-full rounded bg-zinc-900 p-2 text-xs text-white outline-none">
                                        <option value="">Heredada</option>
                                        {fonts.map(font => <option key={font.id} value={font.family} style={{ fontFamily: font.family }}>{font.label}</option>)}
                                    </select>
                                </label>
                                <div className="grid grid-cols-2 gap-2">
                                    <StepperControl label="Tamaño" value={current.fontSize} onChange={v => update({ fontSize: String(v) })} onReset={() => reset(['fontSize'])} min={8} max={120} />
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
                                <StepperControl label="Opacidad" value={current.opacity !== undefined ? `${Math.round(current.opacity * 100)}%` : undefined} onChange={v => update({ opacity: parseFloat(String(v)) / 100 })} onReset={() => reset(['opacity'])} step={1} unit="%" min={0} max={100} />
                            </div>
                        ))}

                        {renderSection("tamano", "Tamaño", (
                            <div className="grid grid-cols-2 gap-2">
                                <StepperControl label="Ancho" value={current.width} onChange={v => update({ width: String(v) })} onReset={() => reset(['width'])} min={0} />
                                <StepperControl label="Alto" value={current.height} onChange={v => update({ height: String(v) })} onReset={() => reset(['height'])} min={0} />
                            </div>
                        ))}

                        {renderSection("posicion", "Posición Visual", (
                            <div className="grid grid-cols-2 gap-2">
                                <StepperControl label="Eje X" value={current.x} onChange={v => update({ x: String(v) })} onReset={() => reset(['x'])} />
                                <StepperControl label="Eje Y" value={current.y} onChange={v => update({ y: String(v) })} onReset={() => reset(['y'])} />
                            </div>
                        ))}

                        {renderSection("espaciado", "Espaciado (Margin, Padding, Gap)", (
                            <div className="grid gap-4">
                                <StepperControl label="Gap (Espacio entre hijos)" value={current.gap} onChange={v => update({ gap: String(v) })} onReset={() => reset(['gap'])} min={0} />

                                <div className="rounded-lg bg-zinc-900/50 p-2 border border-zinc-800">
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">Padding</span>
                                        <button onClick={() => { setPaddingUnlocked(!paddingUnlocked); if (paddingUnlocked) { update({ paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined }); } }} className="text-zinc-500 hover:text-white" title={paddingUnlocked ? 'Bloquear y usar valor único' : 'Desbloquear lados'}>
                                            {paddingUnlocked ? '🔓' : '🔒'}
                                        </button>
                                    </div>
                                    {!paddingUnlocked ? (
                                        <StepperControl label="Padding" value={current.customPadding} onChange={v => update({ customPadding: String(v) })} min={0} />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <StepperControl label="Top" value={current.paddingTop} onChange={v => update({ paddingTop: String(v) })} min={0} />
                                            <StepperControl label="Right" value={current.paddingRight} onChange={v => update({ paddingRight: String(v) })} min={0} />
                                            <StepperControl label="Bottom" value={current.paddingBottom} onChange={v => update({ paddingBottom: String(v) })} min={0} />
                                            <StepperControl label="Left" value={current.paddingLeft} onChange={v => update({ paddingLeft: String(v) })} min={0} />
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
                                        <StepperControl label="Margin" value={current.margin} onChange={v => update({ margin: String(v) })} />
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <StepperControl label="Top" value={current.marginTop} onChange={v => update({ marginTop: String(v) })} />
                                            <StepperControl label="Right" value={current.marginRight} onChange={v => update({ marginRight: String(v) })} />
                                            <StepperControl label="Bottom" value={current.marginBottom} onChange={v => update({ marginBottom: String(v) })} />
                                            <StepperControl label="Left" value={current.marginLeft} onChange={v => update({ marginLeft: String(v) })} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}

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
