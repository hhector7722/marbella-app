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
    fontFamily?: StudioFontFamily;
    globalScale?: string; // ej. "110%", "90%"
    background?: GlobalBackground;
    parentId: string | null; // null = estética base / Original
    isOriginal?: boolean; // solo la "Marbella Original" lo tiene
    isSystem?: boolean; // preset del catálogo, no eliminable ni renombrable
    createdAt: string;
    updatedAt: string;
}

export type VisualTargetKind = 'button' | 'card' | 'table' | 'row' | 'input' | 'select' | 'nav' | 'header' | 'modal' | 'text' | 'element';

export interface GlobalBackground {
    type: 'solid' | 'gradient' | 'none';
    color1?: string;
    color2?: string;
    opacity?: number;
    gradientType?: 'linear' | 'radial' | 'conic';
    gradientDirection?: string;
    effects?: {
        blur?: number;
        glow?: number;
        vignette?: boolean;
        grain?: boolean;
        glass?: boolean;
        saturation?: number;
        contrast?: number;
    };
}

export type VisualOverride = {
    shape?: 'recto' | 'suave' | 'redondo' | 'pill';
    weight?: 'normal' | 'medium' | 'bold';
    elevation?: 'flat' | 'subtle' | 'strong';
    tone?: 'brand' | 'neutral' | 'dark' | 'custom' | 'transparent';
    padding?: 'compact' | 'standard' | 'spacious';
    fontFamily?: StudioFontFamily;
    textColor?: string;
    backgroundColor?: string;
    backgroundImage?: string;
    fillColor?: string;
    fillOpacity?: number;
    outlineColor?: string;
    outlineWidth?: 'none' | 'thin' | 'medium' | 'strong';
    
    // Position
    x?: string;
    y?: string;
    position?: 'static' | 'relative' | 'absolute' | 'fixed';

    // Size
    width?: string;
    height?: string;
    minWidth?: string;
    maxWidth?: string;
    minHeight?: string;
    maxHeight?: string;
    
    // Spacing
    margin?: string;
    marginTop?: string;
    marginRight?: string;
    marginBottom?: string;
    marginLeft?: string;
    customPadding?: string;
    paddingTop?: string;
    paddingRight?: string;
    paddingBottom?: string;
    paddingLeft?: string;
    gap?: string;
    
    // Flex & Display
    display?: 'block' | 'inline-block' | 'flex' | 'inline-flex' | 'grid' | 'none';
    flexDirection?: 'row' | 'row-reverse' | 'column' | 'column-reverse';
    alignItems?: 'flex-start' | 'flex-end' | 'center' | 'baseline' | 'stretch';
    justifyContent?: 'flex-start' | 'flex-end' | 'center' | 'space-between' | 'space-around' | 'space-evenly';
    
    // Border
    borderWidth?: string;
    borderColor?: string;
    borderStyle?: 'solid' | 'dashed' | 'dotted';
    
    // Shadow & Opacity
    boxShadow?: 'none' | 'subtle' | 'medium' | 'strong';
    opacity?: number;
    
    // ── COMPOSICIÓN ──────────────────────────────────────────────
    // Propiedades independientes: cada una hace una sola cosa y ninguna
    // decide por su cuenta fondo, borde, tamaño ni las demás.
    /** Muestra u oculta el TEXTO. No altera el icono. */
    showText?: boolean;
    /** Muestra u oculta la CAJA DE ICONO. No altera el texto. */
    showIcon?: boolean;
    /** Eje en el que se apilan icono y texto. */
    layoutDirection?: 'vertical' | 'horizontal';
    /** Orden de las piezas dentro del eje. */
    layoutOrder?: 'icon-text' | 'text-icon';
    /** Colocación horizontal de las piezas. */
    layoutAlign?: 'start' | 'center' | 'end';
    /**
     * @deprecated Modo cerrado antiguo. Solo se lee para expandir estéticas
     * ya guardadas a propiedades independientes. El Studio nunca lo escribe.
     */
    composition?: 'inside' | 'outside' | 'icon-only' | 'text-only';

    /** Escala visual del elemento en porcentaje, p. ej. '120%'. */
    scale?: string;

    // Caja de icono: presentación del contenedor que envuelve al asset.
    // 'none' = contenedor transparente sin borde ni sombra (el asset flota).
    // 'square' = mantiene width igual a height.
    iconBoxMode?: 'none' | 'box' | 'square';
    /** Esquinas exclusivas de la caja de icono. No es el antiguo control general de radio. */
    iconBoxCorner?: string;

    // Typography advanced
    fontSize?: string;

    fontWeight?: string;
    fontStyle?: 'normal' | 'italic';
    textAlign?: 'left' | 'center' | 'right' | 'justify';
};

export type ResponsiveOverride = {
    all?: VisualOverride;
    mobile?: VisualOverride;
    tablet?: VisualOverride;
    desktop?: VisualOverride;
};

export type VisualOverrides = Record<string, ResponsiveOverride>;
export type StudioFontFamily = string;
export interface SelectedVisualElement {
    key: string;
    route: SandboxRoute;
    kind: VisualTargetKind;
    label: string;
    componentScope: string;
    tagName: string;
    /** Botón/host padre cuando la selección es icono/texto/fondo granular. */
    hostKey?: string;
    hostComponentScope?: string;
    hostLabel?: string;
    /** El elemento contiene caja de icono y/o texto: admite controles de composición. */
    hasComposition?: boolean;
    /** Node key de la CAJA ICONO hermana del texto (para presets de composición). */
    iconBoxKey?: string;
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
    | '/master/dashboard'
    | '/dashboard'
    | '/staff/dashboard'
    | '/recipes'
    | '/ingredients'
    | '/suppliers'
    | '/dashboard/ventas'
    | '/dashboard/history'
    | '/dashboard/movements'
    | '/dashboard/labor'
    | '/dashboard/insights'
    | '/dashboard/sala'
    | '/staff/history'
    | '/registros';
