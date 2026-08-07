/* eslint-disable @typescript-eslint/no-explicit-any */
export type LayoutType = 'control-panel' | 'focused-canvas' | 'bimodal';

export type BlockType = 
    | 'kpi-grid' 
    | 'data-table' 
    | 'filter-bar' 
    | 'page-header'
    | 'sidebar-nav'
    | 'empty-placeholder'
    | 'container-block'
    | 'callout-banner';

export interface MarbellaBlock {
    id: string;
    type: BlockType;
    props: Record<string, any>;
    children?: MarbellaBlock[];
}

export interface MarbellaVariant {
    id: string;
    name: string;
    description: string;
    layout: LayoutType;
    regions: Record<string, MarbellaBlock[]>;
}

export type StudioViewMode = 'edit' | 'preview';
export type ViewportPreset = 'desktop' | 'tablet' | 'mobile';

export interface StudioState {
    variants: MarbellaVariant[];
    activeVariantId: string | null;
    selectedBlockId: string | null;
    hoveredBlockId: string | null;
    viewMode: StudioViewMode;
    viewportPreset: ViewportPreset;
    zoom: number; // 50, 75, 100, etc.

    // State Mutators
    setActiveVariant: (id: string) => void;
    saveVariant: (variant: MarbellaVariant) => void;
    addVariant: (name: string, layout: LayoutType) => void;
    deleteVariant: (id: string) => void;
    
    // Canvas & Inspection State
    selectBlock: (id: string | null) => void;
    setHoveredBlock: (id: string | null) => void;
    setViewMode: (mode: StudioViewMode) => void;
    setViewportPreset: (preset: ViewportPreset) => void;
    setZoom: (zoom: number) => void;
    
    // Block Manipulation (No-Code Visual Editing)
    updateBlockProps: (blockId: string, props: Record<string, any>) => void;
    addBlockToRegion: (regionId: string, type: BlockType, targetIndex?: number) => void;
    removeBlock: (blockId: string) => void;
    duplicateBlock: (blockId: string) => void;
    moveBlock: (blockId: string, direction: 'up' | 'down') => void;
    updateRegionInActiveVariant: (regionId: string, blocks: MarbellaBlock[]) => void;
    updateVariantLayout: (layout: LayoutType) => void;
    resetToDefaults: () => void;
}

