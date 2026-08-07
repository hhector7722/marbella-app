'use client';

import { useState } from 'react';
import { useStudioStore } from '../store';
import StudioCanvas from '../components/StudioCanvas';

export default function StudioComparePage() {
    const variants = useStudioStore(state => state.variants);
    
    const [leftVariantId, setLeftVariantId] = useState(variants[0]?.id || '');
    const [rightVariantId, setRightVariantId] = useState(variants[1]?.id || variants[0]?.id || '');

    return (
        <main className="flex-1 bg-black flex overflow-hidden">
            {/* Split Screen Container */}
            <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/10">
                
                {/* Left Pane */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    <div className="h-10 bg-[#050505] flex items-center px-4 shrink-0 border-b border-white/10">
                        <select 
                            className="bg-transparent text-sm font-medium focus:outline-none text-white/80"
                            value={leftVariantId}
                            onChange={(e) => setLeftVariantId(e.target.value)}
                        >
                            {variants.map(v => (
                                <option key={`left-${v.id}`} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 overflow-y-auto relative">
                        {leftVariantId && <StudioCanvas variantId={leftVariantId} />}
                    </div>
                </div>

                {/* Right Pane */}
                <div className="flex-1 flex flex-col min-h-0 min-w-0">
                    <div className="h-10 bg-[#050505] flex items-center px-4 shrink-0 border-b border-white/10">
                        <select 
                            className="bg-transparent text-sm font-medium focus:outline-none text-white/80"
                            value={rightVariantId}
                            onChange={(e) => setRightVariantId(e.target.value)}
                        >
                            {variants.map(v => (
                                <option key={`right-${v.id}`} value={v.id}>{v.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex-1 overflow-y-auto relative">
                        {rightVariantId && <StudioCanvas variantId={rightVariantId} />}
                    </div>
                </div>

            </div>
        </main>
    );
}
