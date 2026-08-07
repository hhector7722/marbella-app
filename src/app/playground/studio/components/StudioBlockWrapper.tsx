'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MarbellaBlock } from '../types';

interface StudioBlockWrapperProps {
    block: MarbellaBlock;
    regionId: string;
    children: React.ReactNode;
}

export default function StudioBlockWrapper({ block, regionId, children }: StudioBlockWrapperProps) {
    const { 
        selectedBlockId, 
        hoveredBlockId, 
        viewMode, 
        selectBlock, 
        setHoveredBlock,
        moveBlock,
        duplicateBlock,
        removeBlock
    } = useStudioStore();

    const isSelected = selectedBlockId === block.id;
    const isHovered = hoveredBlockId === block.id && !isSelected;

    if (viewMode === 'preview') {
        return <div className="mb-4">{children}</div>;
    }

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                selectBlock(block.id);
            }}
            onMouseEnter={(e) => {
                e.stopPropagation();
                setHoveredBlock(block.id);
            }}
            onMouseLeave={(e) => {
                e.stopPropagation();
                setHoveredBlock(null);
            }}
            className={`relative group transition-all rounded-xl mb-4 ${
                isSelected
                    ? 'ring-2 ring-[#1F5FAF] ring-offset-2 ring-offset-zinc-50 shadow-md z-10'
                    : isHovered
                    ? 'ring-2 ring-[#5B8FB9]/60 ring-dashed ring-offset-1 z-0 cursor-pointer'
                    : 'hover:ring-1 hover:ring-zinc-300 cursor-pointer'
            }`}
        >
            {/* Active Selection Badge (Figma / Framer Style) */}
            {isSelected && (
                <div className="absolute -top-3 left-3 bg-[#1F5FAF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1.5 z-20 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{block.type}</span>
                    <span className="opacity-60 text-[9px] font-mono">({regionId})</span>
                </div>
            )}

            {/* Hover Badge */}
            {isHovered && (
                <div className="absolute -top-2.5 left-3 bg-[#5B8FB9] text-white text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shadow-sm z-20 pointer-events-none">
                    {block.type}
                </div>
            )}

            {/* Floating Action Bar on Selection */}
            {isSelected && (
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -top-3 right-3 bg-zinc-900 text-white rounded-lg shadow-xl border border-zinc-700 px-1.5 py-1 flex items-center gap-1 z-30"
                >
                    <button
                        onClick={() => moveBlock(block.id, 'up')}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white text-xs"
                        title="Mover arriba"
                    >
                        ▲
                    </button>
                    <button
                        onClick={() => moveBlock(block.id, 'down')}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white text-xs"
                        title="Mover abajo"
                    >
                        ▼
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 my-auto" />
                    <button
                        onClick={() => duplicateBlock(block.id)}
                        className="px-2 py-0.5 hover:bg-zinc-800 rounded text-zinc-300 hover:text-white text-[11px] font-medium flex items-center gap-1"
                        title="Duplicar"
                    >
                        ⧉ Duplicar
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 my-auto" />
                    <button
                        onClick={() => removeBlock(block.id)}
                        className="p-1 hover:bg-rose-900/50 hover:text-rose-400 rounded text-zinc-400 text-xs"
                        title="Eliminar"
                    >
                        🗑
                    </button>
                </div>
            )}

            {/* Render block children inside wrapper */}
            <div className={`p-1 rounded-xl ${isSelected ? 'bg-[#EFF6FF]/40' : ''}`}>
                {children}
            </div>
        </div>
    );
}
