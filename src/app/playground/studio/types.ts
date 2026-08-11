// ============================================================
// MODELO DEL SANDBOX VISUAL DE MARBELLA
// Una expresión visual global aplicada a toda Marbella App.
// Navegación real entre pantallas. Estéticas guardadas.
// ============================================================

export type ViewportPreset = 'mobile' | 'tablet' | 'desktop';

export type Intensidad = 'nada' | 'sutil' | 'moderado' | 'fuerte';

export type Madurez = 'semilla' | 'ingrediente' | 'regla';

// Receta = mapa disperso de intensidades por movida.
// Nunca porcentajes: solo intensidad ordinal.
export type Recipe = Partial<Record<MovidaId, Intensidad>>;

export type MovidaId =
    | 'aire'
    | 'superficies'
    | 'densidad'
    | 'profundidad'
    | 'contraste'
    | 'voz_tipografica'
    | 'ruido_navegacion'
    | 'protagonismo_kpi'
    | 'presencia_marca'
    | 'tratamiento_tablas'
    | 'peso_botones';

export interface Movida {
    id: MovidaId;
    nombre: string;
    descripcion: string;
    ejemplo: string;
    contraejemplo: string;
    interacciones: MovidaId[];
    madurez: Madurez;
    referenciasOrigen: string[]; // ids de Referencia
    reglaId?: string; // si madurez === 'regla'
}

export interface Referencia {
    id: string;
    nombre: string;
    dominio: string;
    descripcion: string;
    movidasObservadas: { movidaId: MovidaId; intensidad: Intensidad; nota: string }[];
    contraejemplos: string[];
    preguntas: string[];
}

// ============================================================
// ESTÉTICA — objeto de primer nivel
// Una variante representa UNA EXPRESIÓN COMPLETA DE MARBELLA.
// No una copia de una página. GLOBAL a toda la aplicación.
// ============================================================

export interface Estetica {
    id: string;
    name: string; // "Marbella Original", "Editorial V3", "Minimal V4"
    description?: string;
    recipe: Recipe; // la configuración visual completa
    overrides?: VisualOverrides;
    parentId: string | null; // null = estética base / Original
    isOriginal?: boolean; // solo la "Marbella Original" lo tiene
    createdAt: string;
    updatedAt: string;
}

export type VisualTargetKind = 'button' | 'card' | 'table' | 'row' | 'input' | 'select' | 'nav' | 'header' | 'modal' | 'text' | 'element';
export type VisualOverride = {
    shape?: 'recto' | 'suave' | 'redondo' | 'pill';
    radius?: 'none' | 'small' | 'medium' | 'large';
    weight?: 'normal' | 'medium' | 'bold';
    elevation?: 'flat' | 'subtle' | 'strong';
    tone?: 'brand' | 'neutral' | 'dark' | 'custom';
};
export type VisualOverrides = Record<string, VisualOverride>;
export interface SelectedVisualElement {
    key: string;
    route: SandboxRoute;
    kind: VisualTargetKind;
    label: string;
    componentScope: string;
    tagName: string;
}

// ============================================================
// CONTEXTO DE DISEÑO RESUELTO (consumido por las pantallas)
// ============================================================

export type FontVoice = 'compacto' | 'normal' | 'editorial';
export type TableTreatment = 'bordered' | 'borderless' | 'flat';
export type ButtonWeight = 'normal' | 'silent' | 'bold';

export interface DesignContext {
    space: number; // escala de espaciado (1 = normal)
    typeScale: number; // escala tipográfica (1 = normal)
    surface: number; // 0 = sin reducción · 2 = superficie mínima
    elevation: number; // 0 = sin elevación · 3 = máxima
    contrast: number; // 0 = neutro · 2 = contraste fuerte
    fontVoice: FontVoice;
    navNoise: number; // 0 = ruidosa · 2 = silenciosa
    kpiProminence: number; // 0 = neutro · 2 = protagonismo
    brandPresence: number; // 0 = ausente · 2 = protagonismo de marca
    tableTreatment: TableTreatment;
    buttonWeight: ButtonWeight;
}

// ============================================================
// RUTAS DEL SANDBOX (navegación real entre pantallas)
// ============================================================

export type SandboxRoute =
    | '/dashboard/ventas'
    | '/dashboard/history'
    | '/dashboard/movements'
    | '/dashboard/labor'
    | '/dashboard/insights'
    | '/dashboard/sala'
    | '/staff/history'
    | '/registros';
