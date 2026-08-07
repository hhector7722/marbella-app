export type LayoutType = 'control-panel' | 'focused-canvas' | 'bimodal';

export type BlockType = 
    | 'kpi-grid' 
    | 'data-table' 
    | 'filter-bar' 
    | 'page-header'
    | 'sidebar-nav'
    | 'empty-placeholder'
    | 'container-block'; // A generic wrapper

export interface MarbellaBlock {
    id: string;
    type: BlockType;
    props: Record<string, any>;
    children?: MarbellaBlock[]; // For blocks that can contain others (like cards or grids)
}

export interface MarbellaVariant {
    id: string;
    name: string;
    description: string;
    layout: LayoutType;
    // Map of region names (e.g. 'main', 'sidebar', 'header') to blocks
    regions: Record<string, MarbellaBlock[]>;
}

export interface StudioState {
    variants: MarbellaVariant[];
    activeVariantId: string | null;
    
    // Actions
    setActiveVariant: (id: string) => void;
    saveVariant: (variant: MarbellaVariant) => void;
    updateRegionInActiveVariant: (regionId: string, blocks: MarbellaBlock[]) => void;
}
