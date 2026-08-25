export const CANON_STATUSES = [
    'CANON CERRADO',
    'BORRADOR / PROPUESTA',
    'SIN CANON',
    'HEREDADO',
    'ESPECIALIZADO',
    'DEPRECADO',
] as const;

export type CanonStatus = (typeof CANON_STATUSES)[number];

export type TokenKind = 'adopted' | 'declared' | 'missing';

export type TokenOption = {
    id: string;
    label: string;
    token: string;
    value: string;
    kind: TokenKind;
    cssVar?: string;
    note?: string;
    /** No puede congelarse: incumple una ley ya cerrada o no existe el token. */
    blocksCanon?: boolean;
    requiresNewToken?: boolean;
};

export type PropertyKind =
    | 'token'
    | 'alignment-x'
    | 'alignment-y'
    | 'density'
    | 'boolean'
    | 'choice';

export type PropertyDef = {
    id: string;
    label: string;
    kind: PropertyKind;
    actualId: string;
    options: TokenOption[];
};

export type ApplyKind =
    | 'css-contract'
    | 'blueprint-only'
    | 'locked'
    | 'unavailable';

export type StudioFact = {
    label: string;
    value: string;
};

export type StudioElement = {
    id: string;
    label: string;
    group:
        | 'fundamentos'
        | 'cabeceras'
        | 'alineacion'
        | 'piezas'
        | 'composiciones'
        | 'especializado';
    status: CanonStatus;
    summary: string;
    /** Subcadena única en BLUEPRINT-VISUAL.md. Vacío si el Blueprint aún no nombra el elemento. */
    blueprintNeedle: string;
    sourceFiles: string[];
    impactPatterns: string[];
    /** Huellas de bypass (nativos, estilos locales). No son consumidores conformes. */
    legacyPatterns?: string[];
    applyKind: ApplyKind;
    properties: PropertyDef[];
    /**
     * Contrato visual que este elemento reutiliza. No es un canon independiente.
     * Ejemplo: derived-modal-header → modal-header.
     */
    inherits?: string;
    /** Navega a otro elemento del estudio (p. ej. Table / T8). No es familia propia. */
    redirectTo?: string;
    /** false: solo catálogo / UI. No se siembra en registry.json. */
    registry?: boolean;
    /** proposal-only: se puede proponer; no se cierra como canon desde el estudio. */
    promotePolicy?: 'default' | 'proposal-only';
    /** Advertencia visible en el estudio. No cambia código. */
    warning?: string;
    /** Datos de anatomía de solo lectura (no son properties editables). */
    facts?: StudioFact[];
    examples?: string[];
    /** Segunda línea de la tarjeta en HEADERS. */
    listSummary?: string;
};

export type ProposalLane = 'actual' | 'a' | 'b';

export type PropertyValues = Record<string, string>;

export type ImpactReport = {
    elementId: string;
    consumers: number;
    routes: number;
    variants: number;
    files: string[];
    undetermined: boolean;
    note?: string;
};

export type CanonDecisionInput = {
    elementId: string;
    lane: Exclude<ProposalLane, 'actual'>;
    values: PropertyValues;
    isRevision?: boolean;
};

export type ApplyResult = {
    ok: boolean;
    message: string;
    blueprintUpdated: boolean;
    sourcesUpdated: string[];
    remainingDebt: string[];
    testOutput?: string;
};
