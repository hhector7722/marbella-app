import type { TokenOption } from './types.ts';

function opt(
    token: string,
    value: string,
    kind: TokenOption['kind'],
    extra: Partial<TokenOption> = {}
): TokenOption {
    return {
        id: token,
        label: `${value.replace('px', ' px')} · ${token}`,
        token,
        value,
        kind,
        ...extra,
    };
}

/** Tokens de TOKENS.md. No se inventan valores. */
export const COLOR_OPTIONS: TokenOption[] = [
    opt('color.marca', '#36606F', 'adopted', { cssVar: '--color-marca', label: 'Marca' }),
    opt('color.marca.intenso', '#2F5D6A', 'adopted', {
        cssVar: '--color-marca-intenso',
        label: 'Marca intenso',
    }),
    opt('color.positivo', '#059669', 'adopted', { cssVar: '--color-positivo', label: 'Positivo' }),
    opt('color.negativo', '#E11D48', 'adopted', { cssVar: '--color-negativo', label: 'Negativo' }),
    opt('color.aviso', '#B45309', 'adopted', { cssVar: '--color-aviso', label: 'Aviso' }),
    opt('color.informativo', '#1F5FAF', 'adopted', {
        cssVar: '--color-informativo',
        label: 'Informativo',
    }),
    opt('color.critico', '#B91C1C', 'adopted', { cssVar: '--color-critico', label: 'Crítico' }),
    opt('color.superficie', '#FFFFFF', 'adopted', {
        cssVar: '--color-superficie',
        label: 'Superficie',
    }),
    opt('color.superficie.inactiva', '#F4F4F5', 'adopted', {
        cssVar: '--color-superficie-inactiva',
        label: 'Inactiva',
    }),
    opt('color.texto', '#18181B', 'adopted', { cssVar: '--color-texto', label: 'Texto' }),
    opt('color.texto.fuerte', '#27272A', 'adopted', {
        cssVar: '--color-texto-fuerte',
        label: 'Texto fuerte',
    }),
    opt('color.texto.tenue', '#A1A1AA', 'adopted', {
        cssVar: '--color-texto-tenue',
        label: 'Texto tenue',
    }),
    opt('color.texto.invertido', '#FFFFFF', 'adopted', {
        cssVar: '--color-texto-invertido',
        label: 'Invertido',
    }),
    opt('color.borde', '#F4F4F5', 'adopted', { cssVar: '--color-borde', label: 'Borde' }),
    opt('color.borde.marcado', '#E4E4E7', 'adopted', {
        cssVar: '--color-borde-marcado',
        label: 'Borde marcado',
    }),
];

export const RADIUS_OPTIONS: TokenOption[] = [
    opt('espacio.2', '8px', 'adopted', {
        cssVar: '--espacio-2',
        label: '8 px · Button / espacio.2',
        note: 'Radio contractual del Button. No es radio.control.',
    }),
    opt('radio.control', '12px', 'adopted', {
        cssVar: '--radio-control',
        label: '12 px · radio.control',
    }),
    opt('radio.superficie', '16px', 'adopted', {
        cssVar: '--radio-superficie',
        label: '16 px · radio.superficie',
    }),
];

export const HEIGHT_OPTIONS: TokenOption[] = [
    opt('espacio.8', '32px', 'adopted', {
        cssVar: '--espacio-8',
        label: '32 px · espacio.8',
        note: 'Incumple táctil 48 en un control pulsable.',
        blocksCanon: true,
    }),
    opt('tactil.reducido', '44px', 'declared', {
        label: '44 px · tactil.reducido',
        note: 'Solo elementos secundarios de escritorio. No es táctil móvil.',
        blocksCanon: true,
    }),
    opt('tactil.minimo', '48px', 'adopted', {
        cssVar: '--tactil-minimo',
        label: '48 px · táctil mínimo',
    }),
    {
        id: 'espacio.10-inexistente',
        label: '40 px',
        token: '—',
        value: '40px',
        kind: 'missing',
        requiresNewToken: true,
        blocksCanon: true,
        note: 'No existe en TOKENS.md. Nuevo token requerido.',
    },
];

export const SPACE_OPTIONS: TokenOption[] = [
    opt('espacio.1', '4px', 'adopted', { cssVar: '--espacio-1' }),
    opt('espacio.2', '8px', 'adopted', { cssVar: '--espacio-2' }),
    opt('espacio.3', '12px', 'adopted', { cssVar: '--espacio-3' }),
    opt('espacio.4', '16px', 'adopted', { cssVar: '--espacio-4' }),
    opt('espacio.6', '24px', 'declared', {
        note: 'Declarado en TOKENS.md; aún no hay variable CSS.',
    }),
    opt('espacio.8', '32px', 'adopted', { cssVar: '--espacio-8' }),
    opt('espacio.12', '48px', 'declared', {
        note: 'Declarado en TOKENS.md; aún no hay variable CSS.',
    }),
];

export const TYPE_SIZE_OPTIONS: TokenOption[] = [
    opt('tipo.minimo', '11px', 'adopted', { label: '11 px · mínimo' }),
    opt('tipo.apoyo', '12px', 'declared', { label: '12 px · apoyo' }),
    opt('tipo.cuerpo', '14px', 'declared', { label: '14 px · cuerpo' }),
    opt('tipo.entrada', '16px', 'declared', { label: '16 px · entrada' }),
    opt('tipo.subtitulo', '16px', 'declared', { label: '16 px · subtítulo' }),
    opt('tipo.titulo-pantalla', '18px', 'declared', {
        label: '18 px · título PageScreen',
        note: 'Contrato PageScreen, no tipo.titulo 20/700.',
    }),
    opt('tipo.titulo', '20px', 'declared', { label: '20 px · tipo.titulo' }),
    opt('tipo.cifra', '30px', 'declared', { label: '30 px · cifra' }),
];

export const ALIGN_X_OPTIONS: TokenOption[] = [
    { id: 'left', label: 'Izquierda', token: 'alineacion.izquierda', value: 'left', kind: 'adopted' },
    { id: 'center', label: 'Centro', token: 'alineacion.centro', value: 'center', kind: 'adopted' },
    {
        id: 'edges',
        label: 'Extremos',
        token: 'alineacion.extremos',
        value: 'edges',
        kind: 'adopted',
        note: 'Título a un lado, acción al otro. No es un justify-content genérico.',
    },
];

export const ALIGN_Y_OPTIONS: TokenOption[] = [
    { id: 'top', label: 'Arriba', token: 'alineacion.arriba', value: 'top', kind: 'adopted' },
    { id: 'center', label: 'Centro', token: 'alineacion.centro-vertical', value: 'center', kind: 'adopted' },
    { id: 'bottom', label: 'Abajo', token: 'alineacion.abajo', value: 'bottom', kind: 'adopted' },
];

export const DENSITY_OPTIONS: TokenOption[] = [
    { id: 'comfortable', label: 'Comfortable', token: 'densidad.comfortable', value: 'comfortable', kind: 'adopted' },
    { id: 'compact', label: 'Compact', token: 'densidad.compact', value: 'compact', kind: 'adopted' },
];

export const FOCUS_OPTIONS: TokenOption[] = [
    opt('color.marca', '#36606F', 'adopted', {
        cssVar: '--color-marca',
        label: 'Marca',
        note: 'P0 cerrado: el foco de gestión usa marca.',
    }),
    opt('color.informativo', '#1F5FAF', 'adopted', {
        cssVar: '--color-informativo',
        label: 'Informativo',
        blocksCanon: true,
        note: 'Prohibido como foco. color.info no es el anillo de control.',
    }),
];

export function findOption(options: TokenOption[], id: string): TokenOption | undefined {
    return options.find((item) => item.id === id);
}

const TOKEN_TABLES: TokenOption[][] = [
    COLOR_OPTIONS,
    RADIUS_OPTIONS,
    HEIGHT_OPTIONS,
    SPACE_OPTIONS,
    TYPE_SIZE_OPTIONS,
    ALIGN_X_OPTIONS,
    ALIGN_Y_OPTIONS,
    DENSITY_OPTIONS,
    FOCUS_OPTIONS,
];

export function tokenById(id: string): TokenOption | undefined {
    for (const table of TOKEN_TABLES) {
        const found = findOption(table, id);
        if (found) return found;
    }
    return undefined;
}

export function cssVarFn(tokenId: string): string | null {
    const token = tokenById(tokenId);
    if (!token?.cssVar) return null;
    const name = token.cssVar.replace(/^--/, '');
    return `var(--${name})`;
}
