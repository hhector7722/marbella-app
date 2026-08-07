'use client';

import React from 'react';
import { useStudioStore } from './store';
import StudioTopBar from './components/StudioTopBar';
import StudioLayersPanel from './components/StudioLayersPanel';
import StudioInspectorPanel from './components/StudioInspectorPanel';
import StudioCanvas from './components/StudioCanvas';

export default function StudioPage() {
    const { activeVariantId, selectBlock, viewMode } = useStudioStore();
    
    if (!activeVariantId) return null;

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#050507] text-white">
            {/* Top Workspace Toolbar */}
            <StudioTopBar />

            {/* 3-Pane Editor Workspace */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Left Panel: Layers & Insert Library (Visible in Edit mode) */}
                {viewMode === 'edit' && <StudioLayersPanel />}

                {/* Center Canvas Area with Dot Grid Pattern */}
                <main 
                    onClick={() => selectBlock(null)}
                    className="flex-1 bg-[#0a0a0d] relative overflow-y-auto overflow-x-auto flex flex-col"
                    style={{
                        backgroundImage: `radial-gradient(rgba(255, 255, 255, 0.08) 1px, transparent 1px)`,
                        backgroundSize: '24px 24px'
                    }}
                >
                    <div className="flex-1 min-h-full py-6">
                        <StudioCanvas variantId={activeVariantId} />
                    </div>
                </main>

                {/* Right Panel: Property Inspector (Visible in Edit mode) */}
                {viewMode === 'edit' && <StudioInspectorPanel />}
            </div>
        </div>
    );
}
