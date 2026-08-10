export type SurfaceType = 
    | 'pantalla' 
    | 'modal' 
    | 'formulario' 
    | 'tabla' 
    | 'listado' 
    | 'filtros' 
    | 'botones' 
    | 'cabecera' 
    | 'barra-inferior' 
    | 'bottom-sheet' 
    | 'drawer' 
    | 'carrusel' 
    | 'galeria' 
    | 'date-picker' 
    | 'buscador' 
    | 'calendario' 
    | 'confirmacion' 
    | 'alerta' 
    | 'estado-vacio' 
    | 'skeleton' 
    | 'dashboard' 
    | 'kpis';

export interface CopilotGenerationRequest {
    prompt: string;
    surfaceType: SurfaceType;
    variantCount: number; // 1, 3, 5
    baseVariantId?: string; // If refining an existing variant
}

export interface CopilotChatMessage {
    id: string;
    role: 'user' | 'assistant';
    text: string;
    generatedVariantIds?: string[];
    timestamp: string;
}

export interface CopilotPresetInstruction {
    id: string;
    label: string;
    prompt: string;
    category: 'refinement' | 'hierarchy' | 'style' | 'density';
}
