'use client';

import React from 'react';
import { useStudioStore } from '../store';
import { MarbellaBlock } from '../types';

interface StudioBlockWrapperProps {
    block: MarbellaBlock;
    children: React.ReactNode;
}

export default function StudioBlockWrapper({ block, children }: StudioBlockWrapperProps) {
    const { 
        selectedBlockId, 
        hoveredBlockId, 
        viewMode, 
        selectBlock, 
        setHoveredBlock,
        focusIntoObject,
        focusedBlockId
    } = useStudioStore();

    const isSelected = selectedBlockId === block.id;
    const isHovered = hoveredBlockId === block.id && !isSelected;
    const isFocusedObject = focusedBlockId === block.id;

    if (viewMode === 'preview') {
        return <div className="mb-4">{children}</div>;
    }

    const handleDoubleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        focusIntoObject(block.id, block.props.title || block.type, block.type);
    };

    return (
        <div
            onClick={(e) => {
                e.stopPropagation();
                selectBlock(block.id);
            }}
            onDoubleClick={handleDoubleClick}
            onMouseEnter={(e) => {
                e.stopPropagation();
                setHoveredBlock(block.id);
            }}
            onMouseLeave={(e) => {
                e.stopPropagation();
                setHoveredBlock(null);
            }}
            className={`relative group transition-all rounded-xl mb-4 ${
                isFocusedObject
                    ? 'ring-4 ring-purple-600 ring-offset-4 ring-offset-[#09090c] shadow-2xl z-20 bg-purple-950/20'
                    : isSelected
                    ? 'ring-2 ring-[#1F5FAF] ring-offset-2 ring-offset-zinc-50 shadow-md z-10'
                    : isHovered
                    ? 'ring-2 ring-[#5B8FB9]/60 ring-dashed ring-offset-1 z-0 cursor-pointer'
                    : 'hover:ring-1 hover:ring-zinc-300 cursor-pointer'
            }`}
        >
            {/* Focused Object Indicator */}
            {isFocusedObject && (
                <div className="absolute -top-3 left-3 bg-purple-700 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1.5 z-30">
                    <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
                    <span>Enfoque: {block.props.title || block.type}</span>
                </div>
            )}

            {/* Render block children inside wrapper */}
            <div className={`p-1 rounded-xl ${isSelected ? 'bg-[#EFF6FF]/40' : ''}`}>
                {children}
            </div>
        </div>
    );
}
