'use client';

import React from 'react';
import { useStudioStore } from './store';
import StudioTopBar from './components/StudioTopBar';
import StudioLayersPanel from './components/StudioLayersPanel';
import StudioInspectorPanel from './components/StudioInspectorPanel';
import StudioCanvas from './components/StudioCanvas';
import AcademyStudioView from './academy/components/AcademyStudioView';
import AcademyComparatorView from './academy/components/AcademyComparatorView';
import NewSurfaceModal from './copilot/components/NewSurfaceModal';
import CopilotChatPanel from './copilot/components/CopilotChatPanel';

export default function StudioPage() {
    const { activeVariantId, selectBlock, viewMode, activeStudioTab } = useStudioStore();
    
    if (!activeVariantId) return null;

    return (
        <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#050507] text-white font-sans select-none relative">
            {/* Top Workspace Toolbar */}
            <StudioTopBar />

            {/* Main Area: Render Canvas Editor, Design Academy Studio, or Pattern Comparator */}
            <div className="flex flex-1 overflow-hidden relative">
                {activeStudioTab === 'academy' && (
                    <div className="flex-1 flex overflow-hidden">
                        <AcademyStudioView />
                    </div>
                )}

                {activeStudioTab === 'comparator' && (
                    <div className="flex-1 flex overflow-hidden">
                        <AcademyComparatorView />
                    </div>
                )}

                {activeStudioTab === 'canvas' && (
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
                )}

                {/* AI Copilot Conversational Drawer Panel */}
                <CopilotChatPanel />
            </div>

            {/* New Surface Choice Modal (Manual vs AI Copilot) */}
            <NewSurfaceModal />
        </div>
    );
}
