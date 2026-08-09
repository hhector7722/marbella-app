export type ProductBrand = 
    | 'Linear' 
    | 'Stripe' 
    | 'Vercel' 
    | 'Notion' 
    | 'Apple' 
    | 'Raycast' 
    | 'Attio' 
    | 'Supabase' 
    | 'GitHub' 
    | 'Shopify Admin' 
    | 'Arc Browser' 
    | 'Cron Calendar';

export type PatternCategory = 
    | 'Tablas' 
    | 'Cabeceras' 
    | 'KPIs' 
    | 'Filtros' 
    | 'Navegación' 
    | 'Dashboards' 
    | 'Búsqueda' 
    | 'Modales';

export interface DesignPrinciple {
    title: string;
    description: string;
    category: 'focalPoint' | 'cognitiveLoad' | 'spacingGrid' | 'contrastStrategy' | 'microInteractions';
    impact: 'Alta' | 'Media' | 'Transformadora';
}

export interface InteractiveControlState {
    density: 'compact' | 'standard' | 'spacious';
    contrast: 'low' | 'balanced' | 'high';
    hierarchy: 'subtle' | 'standard' | 'emphasized';
    groupingStyle: 'cards' | 'seamless' | 'bordered';
}

export interface MarbellaTranslation {
    philosophyTitle: string;
    keyAdjustments: string[];
    suggestedLayout: 'control-panel' | 'focused-canvas' | 'bimodal';
    tokenMappings: Record<string, string>;
}

export interface DesignBenchmark {
    id: string;
    product: ProductBrand;
    category: PatternCategory;
    title: string;
    tagline: string;
    overview: string;
    brandColor: string;
    principles: DesignPrinciple[];
    marbellaTranslation: MarbellaTranslation;
    defaultControls: InteractiveControlState;
    // Component renderer code type
    patternType: 'linear-table' | 'stripe-dashboard' | 'vercel-header' | 'apple-hero' | 'notion-database';
}
