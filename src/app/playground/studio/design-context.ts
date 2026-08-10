import type { Recipe, DesignContext, Intensidad } from './types.ts';
import { INTENSIDAD_FACTOR } from './movidas.ts';

// ============================================================
// RESOLUCIÓN DE RECETA → CONTEXTO DE DISEÑO
// Una receta (intensidades ordinales) se resuelve en un conjunto
// de parámetros visuales que las pantallas reales consumen.
// ============================================================

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const formatScale = (v: number) => String(Number(v.toFixed(4)));

export function resolverReceta(recipe: Recipe): DesignContext {
    const nivel = (id: string): number => {
        const i = recipe[id as keyof Recipe];
        return i ? INTENSIDAD_FACTOR[i] : 0;
    };

    const aire = nivel('aire');
    const densidad = nivel('densidad');
    const profundidad = nivel('profundidad');
    const contraste = nivel('contraste');

    // AIRE usa saltos perceptuales; DENSIDAD solo comprime el resultado.
    // Así se pueden explorar ambas dimensiones sin que sean sinónimos.
    const airScale = [0.82, 1, 1.28, 1.72][Math.round(aire * 2)] ?? 0.82;
    const space = clamp(airScale - 0.16 * densidad, 0.7, 1.9);
    const typeScale = clamp(1 + 0.06 * nivel('voz_tipografica') - 0.04 * densidad, 0.85, 1.25);

    const surface = (recipe['superficies'] ?? 'nada') === 'fuerte' ? 2 : (recipe['superficies'] ?? 'nada') === 'moderado' ? 1 : 0;
    const elevation = Math.round(profundidad * 2); // 0..3
    const contrast = Math.round(contraste * 2); // 0..2
    const navNoise = Math.round(nivel('ruido_navegacion') * 2); // 0..2
    const kpiProminence = Math.round(nivel('protagonismo_kpi') * 2); // 0..2
    const brandPresence = Math.round(nivel('presencia_marca') * 2); // 0..2

    const fontIntensity = recipe['voz_tipografica'] ?? 'nada';
    const fontVoice: DesignContext['fontVoice'] =
        fontIntensity === 'moderado' || fontIntensity === 'fuerte'
            ? nivel('densidad') > 0 || recipe['superficies'] === 'nada'
                ? 'compacto'
                : 'editorial'
            : 'normal';

    const table: Intensidad = recipe['tratamiento_tablas'] ?? 'nada';
    const tableTreatment: DesignContext['tableTreatment'] =
        table === 'fuerte' ? 'flat' : table === 'moderado' ? 'borderless' : 'bordered';

    const button: Intensidad = recipe['peso_botones'] ?? 'nada';
    const buttonWeight: DesignContext['buttonWeight'] =
        button === 'fuerte' ? 'silent' : button === 'moderado' ? 'normal' : 'bold';

    return {
        space,
        typeScale,
        surface,
        elevation,
        contrast,
        fontVoice,
        navNoise,
        kpiProminence,
        brandPresence,
        tableTreatment,
        buttonWeight,
    };
}

export function getSandboxSpacingTokens(ctx: DesignContext): Record<string, string> {
    return {
        '--marbella-space-1': `${0.25 * ctx.space}rem`,
        '--marbella-space-2': `${0.5 * ctx.space}rem`,
        '--marbella-space-3': `${0.75 * ctx.space}rem`,
        '--marbella-space-4': `${1 * ctx.space}rem`,
        '--marbella-space-6': `${1.5 * ctx.space}rem`,
        '--marbella-space-8': `${2 * ctx.space}rem`,
        '--marbella-type-scale': `${ctx.typeScale}rem`,
    };
}

// Variables CSS que las pantallas consumen por nombre (espaciado, tipografía).
export function cssVarsDelContexto(ctx: DesignContext): Record<string, string> {
    const sectionSpace = clamp(ctx.space * 1.12, 0.75, 2.15);
    const contentSpace = clamp(ctx.space, 0.7, 1.9);
    const rowSpace = clamp(0.85 + (ctx.space - 1) * 0.7, 0.7, 1.5);

    return {
        '--dl-space': formatScale(ctx.space),
        '--dl-space-section': formatScale(sectionSpace),
        '--dl-space-content': formatScale(contentSpace),
        '--dl-space-row': formatScale(rowSpace),
        '--dl-type-scale': formatScale(ctx.typeScale),
        '--dl-elevation': `${ctx.elevation}`,
        '--dl-contrast': `${ctx.contrast}`,
        '--dl-border-alpha': ctx.surface >= 1 ? '0.25' : '1',
        ...getSandboxSpacingTokens(ctx),
    };
}
