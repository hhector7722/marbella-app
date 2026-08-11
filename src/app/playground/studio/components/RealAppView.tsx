'use client';

import React, { useEffect, useRef } from 'react';
import { SANDBOX_ROUTES, useSandboxStore, useActiveEstetica } from '../store';
import type { Recipe, SandboxRoute, StudioFontFamily, VisualOverrides } from '../types';

export function RealAppView({ recipeOverride, overrides = {}, fontFamily, background }: { recipeOverride?: Recipe; overrides?: VisualOverrides; fontFamily?: StudioFontFamily; background?: any }) {
    const route = useSandboxStore(s => s.route);
    const setRoute = useSandboxStore(s => s.setRoute);
    const estetica = useActiveEstetica();
    const setSelectedElement = useSandboxStore(s => s.setSelectedElement);
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
                            background
                        }
                    }, '*');
                }
            } else if (e.data?.type === 'MARBELLA_STUDIO_CLICK') {
                setSelectedElement(e.data.payload);
            }
        };
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [route, setRoute, recipeOverride, estetica.recipe, overrides, fontFamily, background, setSelectedElement]);

    useEffect(() => {
        if (iframeRef.current?.contentWindow) {
            iframeRef.current.contentWindow.postMessage({
                type: 'MARBELLA_STUDIO_SYNC',
                payload: {
                    recipeOverride: recipeOverride ?? estetica.recipe,
                    overrides,
                    fontFamily,
                    background
                }
            }, '*');
        }
    }, [recipeOverride, estetica.recipe, overrides, fontFamily, background]);

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


