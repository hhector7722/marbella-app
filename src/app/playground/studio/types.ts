// ============================================================
// MODELO CONCEPTUAL DEFINITIVO — Marbella Design Studio
// Una app. Un vocabulario. Tres modos de atención.
// ============================================================

export type Modo = 'absorber' | 'sondear' | 'decidir';

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

export type EstadoHipotesis =
    | 'nueva'
    | 'investigando'
    | 'probando'
    | 'validada'
    | 'descartada'
    | 'convertida_en_regla';

export interface Hipotesis {
    id: string;
    texto: string;
    estado: EstadoHipotesis;
    movidas: MovidaId[];
    referencias: string[];
    variantes: string[];
    pantallas: string[];
    notas: string;
    createdAt: string;
    updatedAt: string;
    timeline: { estado: EstadoHipotesis; fecha: string }[];
}

export type EstadoVersion = 'original' | 'conservada' | 'candidata' | 'descartada';

// Nodo del árbol de versiones de una pantalla.
export interface VariantNode {
    id: string;
    screenKey: string;
    parentId: string | null; // null => nodo ORIGINAL (raíz)
    name: string;
    recipe: Recipe; // dispersa: solo lo que cambia respecto al original
    estado: EstadoVersion;
    hipotesisId?: string;
    // Puertas de validación hacia el Design Language
    superaPuerta1?: boolean; // mejor que el original en su pantalla
    segundaPantalla?: string | null; // pantalla distinta donde también funcionó
    createdAt: string;
    updatedAt: string;
}

export interface Regla {
    id: string;
    movidaId: MovidaId;
    resumen: string;
    ejemplo: string;
    contraejemplo: string;
    pantallaOrigen: string;
    pantallaValidacion: string;
    varianteOrigenId: string;
    hipotesisId?: string;
    createdAt: string;
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

export interface SondaNota {
    id: string;
    screenKey: string;
    recipe: Recipe;
    texto: string;
    createdAt: string;
}
