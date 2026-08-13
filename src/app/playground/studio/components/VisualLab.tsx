'use client';

import React from 'react';
import { useSandboxStore } from '../store';
import { compositionAttributes, compositionPresetPatches, detectCompositionPreset, expandLegacyComposition, type CompositionPresetId } from '../composition';
import type { StudioFontOption } from '../font-catalog';
import type { Estetica, SandboxRoute, SelectedVisualElement, StudioFontFamily, VisualOverride, VisualOverrides, VisualTargetKind, ViewportPreset } from '../types';

const TARGET_SELECTOR = 'button, input, textarea, select, table, thead, tbody, tr, th, td, nav, header, [role="dialog"], [role="tab"], [class*="rounded"], svg, span, p, h1, h2, h3, h4, h5, h6, img, a, li, ul, ol, [data-studio-target="icon"], [data-studio-target="text"], [data-studio-target="bg"], [data-studio-target="asset"]';

const BOX_SHADOWS: Record<NonNullable<VisualOverride['boxShadow']>, string> = {
    none: 'none',
    subtle: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    medium: '0 4px 14px rgba(24, 24, 27, 0.12)',
    strong: '0 18px 35px rgba(24, 24, 27, 0.2)',
};

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
    const studioTarget = element.getAttribute('data-studio-target');
    if (studioTarget === 'asset') return { kind: 'element', scope: 'icon-asset:default', label: 'ASSET' };
    if (studioTarget === 'text') return { kind: 'text', scope: 'text:default', label: 'TEXTO' };
    if (studioTarget === 'bg' || studioTarget === 'icon') return { kind: 'element', scope: 'icon-box:default', label: 'CAJA ICONO' };

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

    return expandLegacyComposition({
        ...merge(`component:${element.dataset.studioComponent ?? ''}`),
        ...merge(element.dataset.studioNodeKey ?? ''),
    });
}

function applyOverrideAttributes(element: HTMLElement, override: VisualOverride): void {
    // Composición: cada atributo es independiente del resto.
    const composition = compositionAttributes(override);
    const setAttribute = (name: string, value: string | undefined) => {
        if (value) element.dataset[name] = value;
        else delete element.dataset[name];
    };
    setAttribute('studioLayout', composition.layout);
    setAttribute('studioOrder', composition.order);
    setAttribute('studioAlign', composition.align);
    setAttribute('studioHideText', composition.hideText ? 'true' : undefined);
    setAttribute('studioHideIcon', composition.hideIcon ? 'true' : undefined);
    setAttribute('studioIconBox', composition.iconBox);

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
        element.style.setProperty('background-color', 'transparent', 'important');
        element.style.setProperty('background-image', 'none', 'important');
    } else if (override.tone === 'custom' && override.backgroundColor) {
        element.style.setProperty('background-color', override.backgroundColor, 'important');
        element.style.setProperty('background-image', 'none', 'important');
    } else {
        element.style.removeProperty('background-color');
        element.style.removeProperty('background-image');
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

    const transforms: string[] = [];
    if (override.x || override.y) transforms.push(`translate(${override.x || '0px'}, ${override.y || '0px'})`);
    if (override.scale) transforms.push(`scale(${(parseFloat(override.scale) || 100) / 100})`);
    if (transforms.length > 0) element.style.setProperty('transform', transforms.join(' '), 'important');
    else element.style.removeProperty('transform');

    if (override.textAlign) element.style.setProperty('text-align', override.textAlign, 'important');
    else element.style.removeProperty('text-align');

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

    if (override.iconBoxCorner) element.style.setProperty('--studio-icon-box-corner', override.iconBoxCorner);
    else element.style.removeProperty('--studio-icon-box-corner');

    const boxless = override.iconBoxMode === 'none';

    if (override.borderWidth && !boxless) {
        element.style.setProperty('border-style', override.borderStyle ?? 'solid', 'important');
        element.style.setProperty('border-width', override.borderWidth, 'important');
    } else {
        element.style.removeProperty('border-style');
        element.style.removeProperty('border-width');
    }
    if (override.borderColor && !boxless) element.style.setProperty('border-color', override.borderColor, 'important');
    else element.style.removeProperty('border-color');

    if (override.boxShadow && !boxless) element.style.setProperty('box-shadow', BOX_SHADOWS[override.boxShadow], 'important');
    else element.style.removeProperty('box-shadow');
}

function realElements(root: HTMLElement): HTMLElement[] {
    const elements = Array.from(root.querySelectorAll<HTMLElement>(TARGET_SELECTOR));
    document.querySelectorAll<HTMLElement>('[role="dialog"]').forEach(dialog => {
        if (dialog.closest('[data-studio-chrome="true"]')) return;
        elements.push(dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>(TARGET_SELECTOR)));
    });
    return Array.from(new Set(elements)).filter(element => {
        if (element.closest('[data-studio-chrome="true"]')) return false;

        // Dentro de un target explícito solo indexamos el propio target (no svg/img/divs internos).
        const ownTarget = element.getAttribute('data-studio-target');
        if (!ownTarget) {
            const parentTarget = element.closest<HTMLElement>('[data-studio-target]');
            if (parentTarget && parentTarget !== element) return false;
        }

        return true;
    });
}

/** Prioridad: asset → text → caja → primer ancestro con node-key (componente). */
function resolveStudioHit(path: EventTarget[]): HTMLElement | null {
    const nodes = path.filter((node): node is HTMLElement => (
        node instanceof HTMLElement
        && !node.closest('[data-studio-chrome="true"]')
        && node.hasAttribute('data-studio-node-key')
    ));
    if (nodes.length === 0) return null;

    const byTarget = (name: string) => nodes.find(node => node.getAttribute('data-studio-target') === name);
    return byTarget('asset') ?? byTarget('text') ?? byTarget('bg') ?? byTarget('icon') ?? nodes[0] ?? null;
}

function hostButtonInfo(element: HTMLElement): Pick<SelectedVisualElement, 'hostKey' | 'hostComponentScope' | 'hostLabel'> {
    const host = element.closest<HTMLElement>('button, [role="button"]');
    if (!host || host === element || !host.dataset.studioNodeKey) return {};
    const hostDescriptor = classify(host);
    if (hostDescriptor.kind !== 'button') return {};
    return {
        hostKey: host.dataset.studioNodeKey,
        hostComponentScope: host.dataset.studioComponent ?? hostDescriptor.scope,
        hostLabel: hostDescriptor.label,
    };
}

function resolveIconBoxKey(element: HTMLElement): string | undefined {
    const ownTarget = element.getAttribute('data-studio-target');
    if (ownTarget === 'bg' || ownTarget === 'icon') return element.dataset.studioNodeKey;

    const host = (ownTarget === 'asset' || ownTarget === 'text')
        ? element.closest<HTMLElement>('button, [role="button"]')
        : element;
    if (!host) return undefined;

    const box = host.querySelector<HTMLElement>('[data-studio-target="bg"], [data-studio-target="icon"]');
    return box?.dataset.studioNodeKey;
}

function buildSelection(element: HTMLElement, route: SandboxRoute): SelectedVisualElement {
    const descriptor = classify(element);
    return {
        key: element.dataset.studioNodeKey ?? '',
        route,
        kind: descriptor.kind,
        label: descriptor.label,
        componentScope: descriptor.scope,
        tagName: element.tagName.toLowerCase(),
        // Solo el propio contenedor de icono/texto ofrece composición: nunca
        // se edita al padre desde la selección de un hijo.
        hasComposition: Boolean(element.querySelector('[data-studio-target="bg"], [data-studio-target="icon"], [data-studio-target="text"]')),
        iconBoxKey: resolveIconBoxKey(element),
        ...hostButtonInfo(element),
    };
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

        const merge = (key: string) => {
            const responsive = overrides[key];
            if (!responsive) return {};
            return {
                ...responsive.all,
                ...responsive[viewport],
            };
        };
        applyOverrideAttributes(root, expandLegacyComposition(merge('global')));

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
            const element = resolveStudioHit(event.composedPath());
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

            const element = resolveStudioHit(event.composedPath());
            if (!element) return;
            event.preventDefault();
            event.stopPropagation();
            const selection = buildSelection(element, route);
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
                const selection = buildSelection(info.element, route);
                setSelectedElement(selection);
                document.querySelectorAll<HTMLElement>('[data-studio-selected="true"]').forEach(node => delete node.dataset.studioSelected);
                info.element.dataset.studioSelected = 'true';

                if (window !== window.parent) {
                    window.parent.postMessage({ type: 'MARBELLA_STUDIO_CLICK', payload: selection }, '*');
                }
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

    const display = value === undefined || String(value).toLowerCase() === 'auto' ? '—' : value;

    return (
        <div className="flex h-7 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{label}</span>
            {value !== undefined && onReset && (
                <button type="button" onClick={onReset} className="text-[10px] text-zinc-400 hover:text-zinc-700" aria-label="Restablecer">×</button>
            )}
            <div className="flex shrink-0 items-center rounded-md border border-zinc-200 bg-zinc-50">
                <button type="button" onClick={handleDecrement} className="flex h-7 w-6 items-center justify-center text-[12px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Decrementar">−</button>
                <span className="min-w-[3.25rem] px-0.5 text-center font-mono text-[11px] tabular-nums text-zinc-800">{display}</span>
                <button type="button" onClick={handleIncrement} className="flex h-7 w-6 items-center justify-center text-[12px] text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800" aria-label="Incrementar">+</button>
            </div>
        </div>
    );
}

function ChoiceRow({ label, value, options, onChange, onReset }: {
    label: string;
    value: string | undefined;
    options: [string, string][];
    onChange: (value: string) => void;
    onReset?: () => void;
}) {
    return (
        <div className="flex min-h-7 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{label}</span>
            {onReset && (
                <button type="button" onClick={onReset} className="text-[10px] text-zinc-400 hover:text-zinc-700" aria-label="Restablecer">×</button>
            )}
            <div className="flex shrink-0 overflow-hidden rounded-md border border-zinc-200">
                {options.map(([optionValue, optionLabel]) => (
                    <button
                        key={optionValue}
                        type="button"
                        onClick={() => onChange(optionValue)}
                        className={`h-7 px-2 text-[10px] font-medium ${value === optionValue ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'}`}
                    >
                        {optionLabel}
                    </button>
                ))}
            </div>
        </div>
    );
}

function ColorRow({ label, value, fallback = '#ffffff', onChange, onReset, transparentAction }: {
    label: string;
    value?: string;
    fallback?: string;
    onChange: (color: string) => void;
    onReset?: () => void;
    transparentAction?: () => void;
}) {
    return (
        <div className="flex min-h-7 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">{label}</span>
            {onReset && (
                <button type="button" onClick={onReset} className="text-[10px] text-zinc-400 hover:text-zinc-700" aria-label="Restablecer">×</button>
            )}
            {transparentAction && (
                <button type="button" onClick={transparentAction} className="rounded border border-zinc-200 px-1.5 py-0.5 text-[9px] font-medium text-zinc-500 hover:bg-zinc-50">Transp.</button>
            )}
            <input type="color" value={value ?? fallback} onChange={e => onChange(e.target.value)} className="h-6 w-6 cursor-pointer rounded border border-zinc-200 bg-transparent p-0" aria-label={label} />
            <span className="w-14 truncate font-mono text-[10px] text-zinc-400">{value ?? 'Auto'}</span>
        </div>
    );
}

export function VisualLabPanel({
    overrides,
    onOverrideChange,
    onOverridesBatch,
    fonts,
    viewport,
}: {
    overrides: VisualOverrides;
    onOverrideChange: (key: string, vp: 'all' | 'mobile' | 'tablet' | 'desktop', patch: VisualOverride) => void;
    onOverridesBatch?: (patches: Array<{ key: string; vp: 'all' | 'mobile' | 'tablet' | 'desktop'; patch: VisualOverride | null }>) => void;
    fonts: StudioFontOption[];
    viewport: ViewportPreset;
}) {
    const labMode = useSandboxStore(s => s.labMode);
    const setLabMode = useSandboxStore(s => s.setLabMode);
    const selected = useSandboxStore(s => s.selectedElement);
    const setSelectedElement = useSandboxStore(s => s.setSelectedElement);
    const [scope, setScope] = React.useState<'instance' | 'component' | 'global'>('instance');
    const [openSection, setOpenSection] = React.useState<string | null>(null);

    const overrideKey = selected
        ? scope === 'instance'
            ? selected.key
            : scope === 'component'
                ? `component:${selected.componentScope}`
                : 'global'
        : 'global';

    const iconBoxOverrideKey = selected
        ? scope === 'instance'
            ? selected.iconBoxKey
            : 'component:icon-box:default'
        : undefined;

    const currentResponsive = overrides[overrideKey] ?? {};
    const current = expandLegacyComposition({ ...currentResponsive.all, ...currentResponsive[viewport] });

    const iconBoxResponsive = iconBoxOverrideKey ? overrides[iconBoxOverrideKey] ?? {} : {};
    const iconBoxCurrent = expandLegacyComposition({ ...iconBoxResponsive.all, ...iconBoxResponsive[viewport] });

    const isIconBox = Boolean(selected?.componentScope?.startsWith('icon-box'));
    const isAsset = Boolean(selected?.componentScope?.startsWith('icon-asset'));
    const showComposition = Boolean(selected?.hasComposition);
    const iconBoxMode = current.iconBoxMode ?? 'box';
    const activeSection = openSection ?? (isIconBox ? 'caja-icono' : showComposition ? 'composicion' : 'apariencia');
    const activePreset = showComposition ? detectCompositionPreset(current, iconBoxCurrent) : null;

    const update = (patch: VisualOverride) => {
        onOverrideChange(overrideKey, scope === 'global' ? 'all' : viewport, patch);
    };

    const applyCompositionPreset = (id: CompositionPresetId) => {
        if (!selected || !onOverridesBatch) return;
        const patches = compositionPresetPatches(id);
        const vp = scope === 'global' ? 'all' as const : viewport;
        const batch: Array<{ key: string; vp: typeof vp; patch: VisualOverride | null }> = [
            { key: overrideKey, vp, patch: patches.host },
        ];
        if (iconBoxOverrideKey) {
            batch.push({ key: iconBoxOverrideKey, vp, patch: patches.iconBox });
        }
        onOverridesBatch(batch);
    };

    const reset = (keys: (keyof VisualOverride)[]) => {
        const patch: any = {};
        keys.forEach(k => patch[k] = undefined);
        update(patch);
    };

    const resetAll = () => {
        onOverrideChange(overrideKey, scope === 'global' ? 'all' : viewport, null as any);
    };

    // En modo cuadrada las dos dimensiones son la misma medida.
    const updateIconBoxSize = (dimension: 'width' | 'height', value: string) => {
        if (iconBoxMode === 'square') update({ width: value, height: value });
        else if (dimension === 'width') update({ width: value });
        else update({ height: value });
    };

    const renderSection = (id: string, title: string, children: React.ReactNode) => {
        const isOpen = activeSection === id;
        return (
            <div className="border-t border-zinc-100">
                <button
                    type="button"
                    onClick={() => setOpenSection(isOpen ? '' : id)}
                    className="flex h-8 w-full items-center justify-between px-3 text-left hover:bg-zinc-50"
                >
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-600">{title}</span>
                    <span className="text-[10px] text-zinc-400">{isOpen ? '▾' : '▸'}</span>
                </button>
                {isOpen && <div className="space-y-1.5 px-3 pb-3">{children}</div>}
            </div>
        );
    };

    const [paddingUnlocked, setPaddingUnlocked] = React.useState(false);
    const [marginUnlocked, setMarginUnlocked] = React.useState(false);

    const scopeShort: Record<'instance' | 'component' | 'global', string> = {
        instance: 'Este',
        component: 'Tipo',
        global: 'Global',
    };

    return (
        <div data-studio-chrome="true" className="flex h-full min-h-0 flex-col bg-white text-zinc-800">
            <div className="shrink-0 border-b border-zinc-100 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Inspector</div>
                        <div className="truncate text-[13px] font-semibold text-zinc-900">{selected ? selected.label : 'Nada seleccionado'}</div>
                    </div>
                    <button
                        type="button"
                        onClick={() => setLabMode(!labMode)}
                        className={`h-7 shrink-0 rounded-md px-2 text-[10px] font-semibold uppercase tracking-wide ${labMode ? 'bg-[#36606F] text-white' : 'border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50'}`}
                    >
                        {labMode ? 'Seleccionando' : 'Seleccionar'}
                    </button>
                </div>

                {selected && (
                    <div className="mt-2 flex items-center gap-1.5">
                        <div className="flex flex-1 overflow-hidden rounded-md border border-zinc-200">
                            {(['instance', 'component', 'global'] as const).map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    title={scopeLabel(selected.kind, option)}
                                    onClick={() => setScope(option)}
                                    className={`h-7 flex-1 text-[10px] font-semibold uppercase tracking-wide ${scope === option ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'}`}
                                >
                                    {scopeShort[option]}
                                </button>
                            ))}
                        </div>
                        <button type="button" onClick={resetAll} className="h-7 shrink-0 rounded-md border border-rose-100 bg-rose-50 px-2 text-[10px] font-semibold uppercase tracking-wide text-rose-600" title="Restablecer este elemento al original">
                            Reset
                        </button>
                    </div>
                )}
                {selected?.hostKey && selected.kind !== 'button' && (
                    <button
                        type="button"
                        onClick={() => setSelectedElement({
                            key: selected.hostKey!,
                            route: selected.route,
                            kind: 'button',
                            label: selected.hostLabel ?? 'BOTÓN',
                            componentScope: selected.hostComponentScope ?? 'button:secondary',
                            tagName: 'button',
                            hasComposition: true,
                            iconBoxKey: selected.componentScope?.startsWith('icon-box')
                                ? selected.key
                                : selected.iconBoxKey,
                        })}
                        className="mt-1.5 h-7 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2 text-left text-[10px] font-medium text-zinc-600 hover:bg-zinc-100"
                    >
                        ↑ Componente · {selected.hostLabel ?? 'BOTÓN'}
                    </button>
                )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {!selected && (
                    <div className="px-4 py-8 text-center text-[12px] text-zinc-400">
                        Activa <strong className="font-semibold text-zinc-600">Seleccionar</strong> y haz click en cualquier elemento del preview.
                    </div>
                )}

                {selected && (
                    <>
                        {showComposition && renderSection("composicion", "Composición", (
                            <>
                                <div className="space-y-1">
                                    <div className="text-[10px] font-medium text-zinc-500">Preset</div>
                                    <div className="grid grid-cols-1 gap-1">
                                        {([
                                            ['together', 'Icono + texto'],
                                            ['icon-card-text-out', 'Icono en card + texto fuera'],
                                            ['separated', 'Icono + texto separados'],
                                        ] as const).map(([id, label]) => (
                                            <button
                                                key={id}
                                                type="button"
                                                disabled={!onOverridesBatch || (scope === 'instance' && !iconBoxOverrideKey)}
                                                onClick={() => applyCompositionPreset(id)}
                                                className={`h-8 rounded-md border px-2 text-left text-[11px] font-medium ${
                                                    activePreset === id
                                                        ? 'border-[#36606F] bg-[#36606F]/10 text-[#36606F]'
                                                        : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'
                                                } disabled:cursor-not-allowed disabled:opacity-40`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {scope === 'instance' && !iconBoxOverrideKey && (
                                        <p className="text-[10px] leading-snug text-zinc-400">
                                            Selecciona el componente completo para aplicar presets con caja de icono.
                                        </p>
                                    )}
                                </div>
                                <ChoiceRow
                                    label="Texto"
                                    value={current.showText === false ? 'hidden' : 'visible'}
                                    options={[['visible', 'Visible'], ['hidden', 'Oculto']]}
                                    onChange={value => update({ showText: value === 'visible' })}
                                    onReset={current.showText !== undefined ? () => reset(['showText']) : undefined}
                                />
                                <ChoiceRow
                                    label="Icono"
                                    value={current.showIcon === false ? 'hidden' : 'visible'}
                                    options={[['visible', 'Visible'], ['hidden', 'Oculto']]}
                                    onChange={value => update({ showIcon: value === 'visible' })}
                                    onReset={current.showIcon !== undefined ? () => reset(['showIcon']) : undefined}
                                />
                                <ChoiceRow
                                    label="Dirección"
                                    value={current.layoutDirection}
                                    options={[['vertical', 'Vertical'], ['horizontal', 'Horizontal']]}
                                    onChange={value => update({ layoutDirection: value as VisualOverride['layoutDirection'] })}
                                    onReset={current.layoutDirection ? () => reset(['layoutDirection']) : undefined}
                                />
                                <ChoiceRow
                                    label="Orden"
                                    value={current.layoutOrder}
                                    options={[['icon-text', 'Icono→Texto'], ['text-icon', 'Texto→Icono']]}
                                    onChange={value => update({ layoutOrder: value as VisualOverride['layoutOrder'] })}
                                    onReset={current.layoutOrder ? () => reset(['layoutOrder']) : undefined}
                                />
                                <ChoiceRow
                                    label="Alineación"
                                    value={current.layoutAlign}
                                    options={[['start', 'Izq'], ['center', 'Centro'], ['end', 'Der']]}
                                    onChange={value => update({ layoutAlign: value as VisualOverride['layoutAlign'] })}
                                    onReset={current.layoutAlign ? () => reset(['layoutAlign']) : undefined}
                                />
                                <StepperControl label="Separación" value={current.gap} onChange={v => update({ gap: String(v) })} onReset={() => reset(['gap'])} min={0} max={80} />
                            </>
                        ))}

                        {isIconBox && renderSection("caja-icono", "Caja de icono", (
                            <>
                                <ChoiceRow
                                    label="Tipo"
                                    value={iconBoxMode}
                                    options={[['none', 'Sin caja'], ['box', 'Caja'], ['square', 'Cuadrada']]}
                                    onChange={value => update(value === 'square' && current.width ? { iconBoxMode: value as VisualOverride['iconBoxMode'], height: current.width } : { iconBoxMode: value as VisualOverride['iconBoxMode'] })}
                                />

                                {iconBoxMode === 'none' ? (
                                    <p className="text-[11px] leading-snug text-zinc-400">
                                        Contenedor transparente. El asset se muestra tal cual.
                                    </p>
                                ) : (
                                    <>
                                        <ColorRow
                                            label="Fondo"
                                            value={current.tone === 'transparent' ? undefined : current.backgroundColor}
                                            onChange={color => update({ tone: 'custom', backgroundColor: color })}
                                            onReset={() => reset(['backgroundColor', 'fillColor', 'tone'])}
                                            transparentAction={() => update({ tone: 'transparent' })}
                                        />
                                        <ColorRow
                                            label="Borde"
                                            value={current.borderColor}
                                            fallback="#e5e7eb"
                                            onChange={color => update({ borderColor: color })}
                                            onReset={() => reset(['borderColor'])}
                                        />
                                        <StepperControl label="Grosor borde" value={current.borderWidth} onChange={v => update({ borderWidth: String(v) })} onReset={() => reset(['borderWidth', 'borderColor'])} min={0} max={24} />
                                        <StepperControl label="Esquinas" value={current.iconBoxCorner} onChange={v => update({ iconBoxCorner: String(v) })} onReset={() => reset(['iconBoxCorner'])} min={0} max={96} />
                                        <StepperControl label={iconBoxMode === 'square' ? 'Lado' : 'Ancho'} value={current.width} onChange={v => updateIconBoxSize('width', String(v))} onReset={() => reset(['width', 'height'])} min={0} max={320} />
                                        {iconBoxMode !== 'square' && (
                                            <StepperControl label="Alto" value={current.height} onChange={v => updateIconBoxSize('height', String(v))} onReset={() => reset(['height'])} min={0} max={320} />
                                        )}
                                        <StepperControl label="Padding" value={current.customPadding} onChange={v => update({ customPadding: String(v) })} onReset={() => reset(['customPadding'])} min={0} max={64} />
                                        <StepperControl label="X" value={current.x} onChange={v => update({ x: String(v) })} onReset={() => reset(['x'])} />
                                        <StepperControl label="Y" value={current.y} onChange={v => update({ y: String(v) })} onReset={() => reset(['y'])} />
                                        <ChoiceRow
                                            label="Sombra"
                                            value={current.boxShadow}
                                            options={[['none', 'Sin'], ['subtle', 'Suave'], ['medium', 'Media'], ['strong', 'Fuerte']]}
                                            onChange={value => update({ boxShadow: value as VisualOverride['boxShadow'] })}
                                            onReset={current.boxShadow ? () => reset(['boxShadow']) : undefined}
                                        />
                                    </>
                                )}
                            </>
                        ))}

                        {renderSection("apariencia", "Apariencia", (
                            <>
                                <div className="flex h-7 items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">Fuente</span>
                                    {current.fontFamily && <button type="button" onClick={() => reset(['fontFamily'])} className="text-[10px] text-zinc-400 hover:text-zinc-700">×</button>}
                                    <select value={current.fontFamily ?? ''} onChange={e => update({ fontFamily: e.target.value })} className="h-7 max-w-[60%] rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-700 outline-none">
                                        <option value="">Heredada</option>
                                        {fonts.map(font => <option key={font.id} value={font.family} style={{ fontFamily: font.family }}>{font.label}</option>)}
                                    </select>
                                </div>
                                <StepperControl label="Tamaño" value={current.fontSize} onChange={v => update({ fontSize: String(v) })} onReset={() => reset(['fontSize'])} min={8} max={120} />
                                <div className="flex h-7 items-center gap-2">
                                    <span className="min-w-0 flex-1 truncate text-[11px] text-zinc-500">Peso</span>
                                    {current.fontWeight && <button type="button" onClick={() => reset(['fontWeight'])} className="text-[10px] text-zinc-400 hover:text-zinc-700">×</button>}
                                    <select value={current.fontWeight ?? ''} onChange={e => update({ fontWeight: e.target.value })} className="h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[11px] text-zinc-700 outline-none">
                                        <option value="">Heredado</option>
                                        <option value="400">Normal</option>
                                        <option value="500">Medium</option>
                                        <option value="600">Semibold</option>
                                        <option value="700">Bold</option>
                                        <option value="900">Black</option>
                                    </select>
                                </div>
                                <ColorRow label="Color texto" value={current.textColor} fallback="#18181b" onChange={color => update({ textColor: color })} onReset={() => reset(['textColor'])} />
                                <ColorRow
                                    label="Fondo"
                                    value={current.backgroundColor ?? current.fillColor}
                                    fallback="#000000"
                                    onChange={color => update({ tone: 'custom', backgroundColor: color, fillColor: color })}
                                    onReset={() => reset(['backgroundColor', 'fillColor', 'tone'])}
                                    transparentAction={() => update({ tone: 'transparent' })}
                                />
                                <StepperControl label="Opacidad" value={current.opacity !== undefined ? `${Math.round(current.opacity * 100)}%` : undefined} onChange={v => update({ opacity: parseFloat(String(v)) / 100 })} onReset={() => reset(['opacity'])} step={1} unit="%" min={0} max={100} />

                                {selected.kind === 'text' && (
                                    <ChoiceRow
                                        label="Alineación"
                                        value={current.textAlign}
                                        options={[['left', 'Izq'], ['center', 'Centro'], ['right', 'Der']]}
                                        onChange={value => update({ textAlign: value as VisualOverride['textAlign'] })}
                                        onReset={current.textAlign ? () => reset(['textAlign']) : undefined}
                                    />
                                )}

                                {!isIconBox && (
                                    <>
                                        <ColorRow label="Borde" value={current.borderColor} fallback="#e5e7eb" onChange={color => update({ borderColor: color })} onReset={() => reset(['borderColor'])} />
                                        <StepperControl label="Grosor borde" value={current.borderWidth} onChange={v => update({ borderWidth: String(v) })} onReset={() => reset(['borderWidth', 'borderColor'])} min={0} max={24} />
                                        <ChoiceRow
                                            label="Sombra"
                                            value={current.boxShadow}
                                            options={[['none', 'Sin'], ['subtle', 'Suave'], ['medium', 'Media'], ['strong', 'Fuerte']]}
                                            onChange={value => update({ boxShadow: value as VisualOverride['boxShadow'] })}
                                            onReset={current.boxShadow ? () => reset(['boxShadow']) : undefined}
                                        />
                                    </>
                                )}
                            </>
                        ))}

                        {renderSection("tamano", isAsset ? "Tamaño del asset" : "Tamaño", (
                            <>
                                <StepperControl label="Ancho" value={current.width} onChange={v => update({ width: String(v) })} onReset={() => reset(['width'])} min={0} />
                                <StepperControl label="Alto" value={current.height} onChange={v => update({ height: String(v) })} onReset={() => reset(['height'])} min={0} />
                                <StepperControl label="Escala" value={current.scale} onChange={v => update({ scale: String(v) })} onReset={() => reset(['scale'])} step={5} unit="%" min={10} max={400} />
                            </>
                        ))}

                        {renderSection("posicion", "Posición", (
                            <>
                                <StepperControl label="X" value={current.x} onChange={v => update({ x: String(v) })} onReset={() => reset(['x'])} />
                                <StepperControl label="Y" value={current.y} onChange={v => update({ y: String(v) })} onReset={() => reset(['y'])} />
                            </>
                        ))}

                        {renderSection("espaciado", "Espaciado", (
                            <>
                                <StepperControl label="Gap" value={current.gap} onChange={v => update({ gap: String(v) })} onReset={() => reset(['gap'])} min={0} />
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Padding</span>
                                    <button type="button" onClick={() => { setPaddingUnlocked(!paddingUnlocked); if (paddingUnlocked) { update({ paddingTop: undefined, paddingRight: undefined, paddingBottom: undefined, paddingLeft: undefined }); } }} className="text-[10px] text-zinc-400 hover:text-zinc-700" title={paddingUnlocked ? 'Bloquear y usar valor único' : 'Desbloquear lados'}>
                                        {paddingUnlocked ? 'Lados' : 'Único'}
                                    </button>
                                </div>
                                {!paddingUnlocked ? (
                                    <StepperControl label="Padding" value={current.customPadding} onChange={v => update({ customPadding: String(v) })} min={0} />
                                ) : (
                                    <>
                                        <StepperControl label="Top" value={current.paddingTop} onChange={v => update({ paddingTop: String(v) })} min={0} />
                                        <StepperControl label="Right" value={current.paddingRight} onChange={v => update({ paddingRight: String(v) })} min={0} />
                                        <StepperControl label="Bottom" value={current.paddingBottom} onChange={v => update({ paddingBottom: String(v) })} min={0} />
                                        <StepperControl label="Left" value={current.paddingLeft} onChange={v => update({ paddingLeft: String(v) })} min={0} />
                                    </>
                                )}
                                <div className="flex items-center justify-between pt-1">
                                    <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Margin</span>
                                    <button type="button" onClick={() => { setMarginUnlocked(!marginUnlocked); if (marginUnlocked) { update({ marginTop: undefined, marginRight: undefined, marginBottom: undefined, marginLeft: undefined }); } }} className="text-[10px] text-zinc-400 hover:text-zinc-700" title={marginUnlocked ? 'Bloquear y usar valor único' : 'Desbloquear lados'}>
                                        {marginUnlocked ? 'Lados' : 'Único'}
                                    </button>
                                </div>
                                {!marginUnlocked ? (
                                    <StepperControl label="Margin" value={current.margin} onChange={v => update({ margin: String(v) })} />
                                ) : (
                                    <>
                                        <StepperControl label="Top" value={current.marginTop} onChange={v => update({ marginTop: String(v) })} />
                                        <StepperControl label="Right" value={current.marginRight} onChange={v => update({ marginRight: String(v) })} />
                                        <StepperControl label="Bottom" value={current.marginBottom} onChange={v => update({ marginBottom: String(v) })} />
                                        <StepperControl label="Left" value={current.marginLeft} onChange={v => update({ marginLeft: String(v) })} />
                                    </>
                                )}
                            </>
                        ))}

                        <div className="border-t border-zinc-100 px-3 py-3">
                            <button type="button" onClick={resetAll} className="h-8 w-full rounded-md border border-rose-100 bg-rose-50 text-[10px] font-semibold uppercase tracking-wide text-rose-600 hover:bg-rose-100">
                                Restablecer ámbito
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
        <div data-studio-chrome="true" className="border-b border-zinc-100 bg-white px-3 py-3 text-zinc-800">
            <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Estética global</span>
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">Live</span>
            </div>
            <input
                value={estetica.name}
                disabled={Boolean(estetica.isOriginal || estetica.isSystem)}
                onChange={event => onRename(event.target.value)}
                className="h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[13px] font-semibold text-zinc-900 outline-none focus:border-[#36606F] disabled:bg-zinc-50 disabled:text-zinc-400"
                aria-label="Nombre de la estética"
            />
            <select value={estetica.id} onChange={event => onSelect(event.target.value)} className="mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700" aria-label="Estética global">
                {esteticas.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
            <select value={fontFamily ?? ''} onChange={event => onFontFamilyChange((event.target.value || undefined) as StudioFontFamily | undefined)} className="mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700" aria-label="Tipografía global">
                <option value="">Tipografía de Marbella</option>
                {fonts.map(font => <option key={font.id} value={font.family}>{font.label}</option>)}
            </select>
            <select value={globalScale ?? ''} onChange={event => onGlobalScaleChange?.(event.target.value || undefined)} className="mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-[12px] text-zinc-700" aria-label="Escala global">
                <option value="">Escala 100%</option>
                <option value="80%">80%</option>
                <option value="90%">90%</option>
                <option value="110%">110%</option>
                <option value="120%">120%</option>
            </select>

            <div className="mt-2 flex overflow-hidden rounded-md border border-zinc-200">
                {(['mobile', 'tablet', 'desktop'] as const).map(option => (
                    <button
                        key={option}
                        type="button"
                        onClick={() => onViewportChange(option)}
                        className={`h-8 flex-1 text-[10px] font-semibold uppercase tracking-wide ${viewport === option ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500 hover:bg-zinc-50'}`}
                    >
                        {option === 'mobile' ? '375px' : option === 'tablet' ? '768px' : '1280+'}
                    </button>
                ))}
            </div>

            <div className="mt-2 rounded-md border border-zinc-100 bg-zinc-50 p-2">
                <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-wide text-zinc-400">Fondo de app</span>
                <div className="flex overflow-hidden rounded-md border border-zinc-200">
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'solid', color1: '#000000', opacity: 1 })} className={`h-7 flex-1 text-[10px] font-medium ${activeBackground?.type === 'solid' ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500'}`}>Sólido</button>
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'gradient', gradientType: 'linear', color1: '#111827', color2: '#000000', gradientDirection: 'to bottom' })} className={`h-7 flex-1 text-[10px] font-medium ${activeBackground?.type === 'gradient' ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500'}`}>Degradado</button>
                    <button type="button" onClick={() => onBackgroundChange?.({ type: 'none' })} className={`h-7 flex-1 text-[10px] font-medium ${activeBackground?.type === 'none' || !activeBackground ? 'bg-[#36606F] text-white' : 'bg-white text-zinc-500'}`}>Default</button>
                </div>
                {activeBackground && activeBackground.type !== 'none' && (
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <label className="flex items-center gap-1.5">
                            <input type="color" value={activeBackground.color1 ?? '#000000'} onChange={e => onBackgroundChange?.({ ...activeBackground, color1: e.target.value })} className="h-6 w-6 rounded border border-zinc-200 bg-transparent p-0" />
                            <span className="text-[10px] text-zinc-500">Color {activeBackground.type === 'gradient' ? '1' : ''}</span>
                        </label>
                        {activeBackground.type === 'gradient' && (
                            <label className="flex items-center gap-1.5">
                                <input type="color" value={activeBackground.color2 ?? '#000000'} onChange={e => onBackgroundChange?.({ ...activeBackground, color2: e.target.value })} className="h-6 w-6 rounded border border-zinc-200 bg-transparent p-0" />
                                <span className="text-[10px] text-zinc-500">Color 2</span>
                            </label>
                        )}
                        {activeBackground.type === 'gradient' && (
                            <select value={activeBackground.gradientType ?? 'linear'} onChange={e => onBackgroundChange?.({ ...activeBackground, gradientType: e.target.value as 'linear' | 'radial' | 'conic' })} className="col-span-2 h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[10px] text-zinc-600">
                                <option value="linear">Lineal</option>
                                <option value="radial">Radial</option>
                                <option value="conic">Cónico</option>
                            </select>
                        )}
                        <div className="col-span-2 flex gap-1">
                            <button type="button" onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, blur: (activeBackground.effects?.blur || 0) ? 0 : 20 } })} className={`h-7 flex-1 rounded-md text-[9px] font-semibold uppercase ${activeBackground.effects?.blur ? 'bg-zinc-800 text-white' : 'border border-zinc-200 bg-white text-zinc-500'}`}>Blur</button>
                            <button type="button" onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, grain: !activeBackground.effects?.grain } })} className={`h-7 flex-1 rounded-md text-[9px] font-semibold uppercase ${activeBackground.effects?.grain ? 'bg-zinc-800 text-white' : 'border border-zinc-200 bg-white text-zinc-500'}`}>Ruido</button>
                            <button type="button" onClick={() => onBackgroundChange?.({ ...activeBackground, effects: { ...activeBackground.effects, vignette: !activeBackground.effects?.vignette } })} className={`h-7 flex-1 rounded-md text-[9px] font-semibold uppercase ${activeBackground.effects?.vignette ? 'bg-zinc-800 text-white' : 'border border-zinc-200 bg-white text-zinc-500'}`}>Viñeta</button>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-2 flex gap-1.5">
                <button type="button" onClick={onSave} className="h-8 flex-1 rounded-md bg-[#36606F] text-[10px] font-semibold uppercase tracking-wide text-white">Guardar</button>
                <button type="button" onClick={onDuplicate} className="h-8 rounded-md border border-zinc-200 bg-white px-2.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-600">Duplicar</button>
                <button type="button" onClick={onDelete} disabled={Boolean(estetica.isOriginal || estetica.isSystem)} title={estetica.isSystem ? 'Las estéticas predeterminadas no se pueden eliminar' : undefined} className="h-8 rounded-md border border-rose-100 bg-rose-50 px-2.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600 disabled:opacity-30">Eliminar</button>
            </div>
            <button type="button" onClick={onCompare} className="mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-white text-[10px] font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-50">Comparar exploraciones</button>
        </div>
    );
}
