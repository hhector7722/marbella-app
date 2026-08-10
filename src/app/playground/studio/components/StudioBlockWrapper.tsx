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
        removeBlock,
        currentLevel,
        setCurrentLevel,
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
                if (currentLevel < 3) setCurrentLevel(3);
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
            {/* Focused Object Badge */}
            {isFocusedObject && (
                <div className="absolute -top-3 left-3 bg-purple-700 text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-md flex items-center gap-1.5 z-30">
                    <span className="w-2 h-2 rounded-full bg-cyan-300 animate-ping" />
                    <span>Enfoque Activo: {block.props.title || block.type}</span>
                </div>
            )}

            {/* Level 1 & 2 Intent Badge */}
            {currentLevel <= 2 && !isFocusedObject && (
                <div className="absolute -top-3 left-3 bg-[#36606F] text-white text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1.5 z-20 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                    <span>Intención: {block.type}</span>
                    <span className="opacity-60 text-[9px] font-mono">({regionId})</span>
                </div>
            )}

            {/* Level 3 & 4 Active Selection Badge */}
            {currentLevel >= 3 && isSelected && !isFocusedObject && (
                <div className="absolute -top-3 left-3 bg-[#1F5FAF] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm flex items-center gap-1.5 z-20 pointer-events-none">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{block.type}</span>
                </div>
            )}

            {/* Level 5 Token Bound Badge */}
            {currentLevel === 5 && (
                <div className="absolute -top-3 right-3 bg-purple-700 text-white text-[9px] font-mono px-2 py-0.5 rounded-md uppercase tracking-wider shadow-sm z-20 pointer-events-none border border-purple-400">
                    Evolucionar Token Marbella OS
                </div>
            )}

            {/* Hover Badge with Hint */}
            {isHovered && (
                <div className="absolute -top-2.5 left-3 bg-[#5B8FB9] text-white text-[9px] font-semibold px-2 py-0.5 rounded uppercase tracking-wider shadow-sm z-20 pointer-events-none flex items-center gap-1">
                    <span>{block.type}</span>
                    <span className="opacity-75 font-mono text-[8px]">(Doble clic para entrar)</span>
                </div>
            )}

            {/* Floating Action Bar on Selection */}
            {isSelected && (
                <div 
                    onClick={(e) => e.stopPropagation()}
                    className="absolute -top-3 right-3 bg-zinc-900 text-white rounded-lg shadow-xl border border-zinc-700 px-1.5 py-1 flex items-center gap-1 z-30"
                >
                    <button
                        onClick={handleDoubleClick}
                        className="px-2 py-0.5 bg-purple-600 hover:bg-purple-500 text-white rounded text-[10px] font-bold flex items-center gap-1 shadow-sm"
                        title="Hacer zoom y diseñar este objeto aisladamente"
                    >
                        🔍 Entrar en Objeto
                    </button>
                    <div className="w-[1px] h-3 bg-zinc-700 my-auto" />
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
                        ⧉
                    </button>
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
