import { Recipe, DesignContext, Intensidad } from './types';
import { INTENSIDAD_FACTOR } from './movidas';

// ============================================================
// RESOLUCIÓN DE RECETA → CONTEXTO DE DISEÑO
// Una receta (intensidades ordinales) se resuelve en un conjunto
// de parámetros visuales que las pantallas reales consumen.
// ============================================================

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function resolverReceta(recipe: Recipe): DesignContext {
    const nivel = (id: string): number => {
        const i = recipe[id as keyof Recipe];
        return i ? INTENSIDAD_FACTOR[i] : 0;
    };

    const aire = nivel('aire');
    const densidad = nivel('densidad');
    const profundidad = nivel('profundidad');
    const contraste = nivel('contraste');

    // El aire y la densidad se compensan sobre la escala de espaciado.
    const space = clamp(1 + 0.35 * aire - 0.18 * densidad, 0.6, 2.2);
    const typeScale = clamp(1 + 0.12 * aire + 0.06 * nivel('voz_tipografica') - 0.04 * densidad, 0.85, 1.6);

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

// Variables CSS que las pantallas consumen por nombre (espaciado, tipografía).
export function cssVarsDelContexto(ctx: DesignContext): Record<string, string> {
    return {
        '--dl-space': `${ctx.space}`,
        '--dl-type-scale': `${ctx.typeScale}`,
        '--dl-elevation': `${ctx.elevation}`,
        '--dl-contrast': `${ctx.contrast}`,
        '--dl-border-alpha': ctx.surface >= 1 ? '0.25' : '1',
    };
}
