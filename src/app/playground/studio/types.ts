/* eslint-disable @typescript-eslint/no-explicit-any */
export type SpatialCompositionFlow = 'fluid-stack' | 'hero-header' | 'grid-surface' | 'clean-canvas';

export type BlockType = 
    | 'kpi-grid' 
    | 'data-table' 
    | 'filter-bar' 
    | 'page-header'
    | 'sidebar-nav'
    | 'empty-placeholder'
    | 'container-block'
    | 'callout-banner'
    | 'top-bar'
    | 'bottom-nav'
    | 'tabs'
    | 'fab'
    | 'form';

export type SurfaceType =
    | 'pantalla'
    | 'dashboard'
    | 'modal'
    | 'formulario'
    | 'tabla'
    | 'kpis'
    | 'cabecera'
    | 'drawer'
    | 'bottom-sheet';

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
    surfaceType: SurfaceType;
    layout: SpatialCompositionFlow;
    regions: Record<string, MarbellaBlock[]>;
    createdAt: string; // ISO date
    updatedAt: string; // ISO date
}

export type StudioViewMode = 'edit' | 'preview';
export type ViewportPreset = 'desktop' | 'tablet' | 'mobile';

// 5-LEVEL RECURSIVE OBJECT MODEL
export type DesignLevel = 1 | 2 | 3 | 4 | 5;

export type IntentCategory = 
    | 'identidad' 
    | 'datos' 
    | 'control' 
    | 'navegacion' 
    | 'acciones' 
    | 'resumen' 
    | 'estado' 
    | 'alerta';

export interface FocusNode {
    id: string;
    name: string;
    type: string;
}

export interface CopilotMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    generatedVariantIds?: string[];
    timestamp: string;
}

export interface StudioState {
    variants: MarbellaVariant[];
    activeVariantId: string | null;
    selectedBlockId: string | null;
    hoveredBlockId: string | null;
    viewMode: StudioViewMode;
    viewportPreset: ViewportPreset;
    zoom: number; // 50, 75, 100, etc.

    // Variant Manager State
    isVariantManagerOpen: boolean;

    // Recursive Object Focus Stack Navigation
    focusStack: FocusNode[];
    focusedBlockId: string | null;

    // Multilevel Progressive Zoom State
    currentLevel: DesignLevel;
    tokens: Record<string, string>;

    // AI Copilot (governed) State
    isCopilotOpen: boolean;
    isNewSurfaceModalOpen: boolean;
    isGeneratingAI: boolean;
    copilotMessages: CopilotMessage[];

    // Variant Lifecycle Management Actions
    openVariantManager: () => void;
    closeVariantManager: () => void;
    renameVariant: (id: string, newName: string) => void;
    duplicateVariant: (id: string) => void;
    deleteVariant: (id: string) => boolean;

    // Recursive Object Navigation Actions
    focusIntoObject: (id: string, name: string, type: string) => void;
    focusOutObject: () => void;
    popToFocusIndex: (index: number) => void;

    // Multilevel State Mutators
    setCurrentLevel: (level: DesignLevel) => void;
    zoomInLevel: () => void;
    zoomOutLevel: () => void;
    addIntentZone: (category: IntentCategory, regionId?: string) => void;
    updateSystemToken: (key: string, value: string) => void;

    // Copilot Actions (governed by contracts)
    toggleCopilotPanel: (open?: boolean) => void;
    openNewSurfaceModal: () => void;
    closeNewSurfaceModal: () => void;
    generateAIProposals: (prompt: string, surfaceType: SurfaceType, viewport: ViewportPreset, count?: number) => void;
    refineAIVariant: (prompt: string) => void;

    setActiveVariant: (id: string) => void;
    saveVariant: (variant: MarbellaVariant) => void;
    addVariant: (name: string, surfaceType?: SurfaceType, layout?: SpatialCompositionFlow) => void;
    
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
    updateVariantSpatialFlow: (flow: SpatialCompositionFlow) => void;
}
