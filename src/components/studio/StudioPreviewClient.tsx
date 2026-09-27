'use client';

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { usePathname } from 'next/navigation';
import { VisualOverrides, SandboxRoute, GlobalBackground, Recipe, StudioFontFamily, ViewportPreset } from '@/app/playground/studio/types';
import { useSandboxStore } from '@/app/playground/studio/store';
import { VisualLabSurface } from '@/app/playground/studio/components/VisualLab';
import { DesignProvider } from '@/app/playground/studio/screens/system';
import { enableSandboxRuntime, disableSandboxRuntime } from '@/lib/sandbox/client';

const STUDIO_PREVIEW_STORAGE_KEY = 'marbella-studio-preview';

/**
 * El sandbox del Studio solo debe arrancar en el iframe del playground.
 * `window !== window.parent` no basta: marbella-web también embebe `/carta?embed=1`
 * y el VisualLab anula transforms (p. ej. el scale 0.93 del plato) y paddings.
 * La señal explícita es `studioPreview=1`, que RealAppView añade al src.
 * sessionStorage cubre navegaciones internas del mismo iframe que pierdan el query.
 */
function isStudioPreviewFrame(): boolean {
    if (typeof window === 'undefined' || window === window.parent) return false;
    if (new URLSearchParams(window.location.search).get('studioPreview') === '1') return true;
    try {
        return sessionStorage.getItem(STUDIO_PREVIEW_STORAGE_KEY) === '1';
    } catch {
        return false;
    }
}

function subscribeStudioPreview() {
    return () => {};
}

export function StudioPreviewClient({ children }: { children: React.ReactNode }) {
    const inStudioPreview = useSyncExternalStore(subscribeStudioPreview, isStudioPreviewFrame, () => false);
    const [overrides, setOverrides] = useState<VisualOverrides>({});
    const [background, setBackground] = useState<GlobalBackground | null>(null);
    const [recipe, setRecipe] = useState<Recipe>({});
    const [fontFamily, setFontFamily] = useState<StudioFontFamily | undefined>(undefined);
    const [globalScale, setGlobalScale] = useState<string | undefined>(undefined);
    const [viewport, setViewport] = useState<ViewportPreset>('desktop');
    const pathname = usePathname();

    useEffect(() => {
        if (inStudioPreview) {
            try {
                sessionStorage.setItem(STUDIO_PREVIEW_STORAGE_KEY, '1');
            } catch {
                /* storage partitioned or blocked */
            }

            enableSandboxRuntime(() => false);

            // Notify parent we are ready to receive sync data
            window.parent.postMessage({ type: 'MARBELLA_STUDIO_IFRAME_READY', payload: { pathname } }, '*');

            const handleMessage = (event: MessageEvent) => {
                if (event.data?.type === 'MARBELLA_STUDIO_SYNC') {
                    setOverrides(event.data.payload.overrides || {});
                    setBackground(event.data.payload.background || null);
                    setRecipe(event.data.payload.recipeOverride || {});
                    setFontFamily(event.data.payload.fontFamily);
                    setGlobalScale(event.data.payload.globalScale);
                    setViewport(event.data.payload.viewport || 'desktop');
                    useSandboxStore.getState().setLabMode(event.data.payload.labMode || false);
                    useSandboxStore.getState().setSelectedElement(event.data.payload.selectedElement ?? null);
                }
            };
            window.addEventListener('message', handleMessage);
            
            // Cargar las fuentes en el iframe
            let cancelled = false;
            void fetch('/playground/studio/fonts')
                .then(response => response.ok ? response.json() : [])
                .then((available: { family: string; url: string; format: string }[]) => {
                    if (cancelled) return;
                    available.forEach(font => {
                        const face = new FontFace(font.family, `url("${font.url}") format("${font.format}")`);
                        document.fonts.add(face);
                        void face.load();
                    });
                })
                .catch(() => {});

            return () => {
                window.removeEventListener('message', handleMessage);
                disableSandboxRuntime();
                cancelled = true;
            };
        }
    }, [pathname, inStudioPreview]);

    useEffect(() => {
        if (inStudioPreview) {
            if (globalScale) {
                document.documentElement.style.fontSize = globalScale;
            } else {
                document.documentElement.style.removeProperty('font-size');
            }
        }
    }, [inStudioPreview, globalScale]);

    if (!inStudioPreview) return <>{children}</>;

    // Cuando estamos en el iframe del Studio, inyectamos la capa visual real
    const bgStyle: React.CSSProperties = {};
    if (background && background.type === 'solid') {
        bgStyle.backgroundColor = background.color1;
        bgStyle.backgroundImage = 'none';
    } else if (background && background.type === 'gradient') {
        bgStyle.backgroundImage = `${background.gradientType}-gradient(${background.gradientType === 'linear' ? background.gradientDirection : 'circle'}, ${background.color1}, ${background.color2})`;
    }
    const bgClass = !background || background.type === 'none' ? 'bg-marbella-shell' : '';
    const effectsClass = background?.effects 
        ? `${background.effects.blur ? 'studio-bg-glass ' : ''}${background.effects.vignette ? 'studio-bg-vignette ' : ''}${background.effects.grain ? 'studio-bg-grain ' : ''}`
        : '';

    return (
        <DesignProvider recipe={recipe} fontFamily={fontFamily}>
            <VisualLabSurface route={pathname as SandboxRoute} overrides={overrides} viewport={viewport}>
                <div data-marbella-sandbox="true" className={`relative min-h-screen w-full overflow-y-auto overflow-x-hidden ${bgClass} ${effectsClass} text-zinc-900`} style={bgStyle}>
                    {children}
                </div>
            </VisualLabSurface>
        </DesignProvider>
    );
}
