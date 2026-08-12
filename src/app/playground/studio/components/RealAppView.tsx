'use client';

import React, { useEffect, useRef } from 'react';
import { SANDBOX_ROUTES, useSandboxStore, useActiveEstetica } from '../store';
import type { Recipe, SandboxRoute, StudioFontFamily, VisualOverrides } from '../types';

export function RealAppView({ recipeOverride, overrides = {}, fontFamily, globalScale, background, onDragEnd }: { recipeOverride?: Recipe; overrides?: VisualOverrides; fontFamily?: StudioFontFamily; globalScale?: string; background?: any; onDragEnd?: (key: string, x: string, y: string) => void }) {
    const route = useSandboxStore(s => s.route);
    const setRoute = useSandboxStore(s => s.setRoute);
    const estetica = useActiveEstetica();
    const setSelectedElement = useSandboxStore(s => s.setSelectedElement);
    const selectedElement = useSandboxStore(s => s.selectedElement);
    const labMode = useSandboxStore(s => s.labMode);
    const viewport = useSandboxStore(s => s.viewport);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    useEffect(() => {
        const handleMessage = (e: MessageEvent) => {
            if (e.data?.type === 'MARBELLA_STUDIO_IFRAME_READY') {
                const iframePath = e.data.payload.pathname;
                if (iframePath !== route) setRoute(iframePath);
                
                if (iframeRef.current?.contentWindow) {
                    iframeRef.current.contentWindow.postMessage({
                        type: 'MARBELLA_STUDIO_SYNC',
                        payload: {
                            recipeOverride: recipeOverride ?? estetica.recipe,
                            overrides,
                            fontFamily,
                            globalScale,
                            background,
                            labMode,
                            viewport,
                            selectedElement,
                        }
                    }, '*');
                }
            } else if (e.data?.type === 'MARBELLA_STUDIO_CLICK') {
                setSelectedElement(e.data.payload);
            } else if (e.data?.type === 'MARBELLA_STUDIO_DRAG_END') {
                if (onDragEnd) {
                    onDragEnd(e.data.payload.key, e.data.payload.x, e.data.payload.y);
                }
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [route, setRoute, recipeOverride, estetica.recipe, overrides, fontFamily, globalScale, background, setSelectedElement, onDragEnd, labMode, viewport, selectedElement]);

    useEffect(() => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'MARBELLA_STUDIO_SYNC',
                payload: {
                    recipeOverride: recipeOverride ?? estetica.recipe,
                    overrides,
                    fontFamily,
                    globalScale,
                    background,
                    labMode,
                    viewport,
                    selectedElement,
                }
            }, '*');
        }
    }, [recipeOverride, estetica.recipe, overrides, fontFamily, globalScale, background, labMode, viewport, selectedElement]);

    return (
        <iframe 
            ref={iframeRef}
            src={route} 
            className="w-full h-full border-0 bg-white" 
            title="Marbella Studio Preview"
        />
    );
}

export function hasRealSandboxPage(route: SandboxRoute): boolean {
    return SANDBOX_ROUTES.some(r => r.id === route);
}


