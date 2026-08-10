/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    MarbellaVariant,
    MarbellaBlock,
    BlockType,
    SurfaceType,
    ViewportPreset,
} from '../types';
import {
    getAllowedBlocks,
    getAllowedRegions,
    getSurfaceContract,
    validateVariant,
    hasBlockingViolations,
    defaultLayoutForSurface,
} from '../contracts';

export interface CopilotGenerationRequest {
    prompt: string;
    surfaceType: SurfaceType;
    viewport: ViewportPreset;
    variantCount: number; // 1, 3, 5
    baseVariantId?: string; // If refining an existing variant
}

const MAX_REPAIR_ATTEMPTS = 6;

// ==========================================
// COMPOSICIÓN GOBERNADA POR CONTRATO
// ==========================================

function buildKpis(prompt: string, count: number): Record<string, string>[] {
    const lower = prompt.toLowerCase();
    const pool: Record<string, string>[] = [
        { label: 'Personal Activo', value: '42', change: '+3 este mes' },
        { label: 'Cobertura de Turno', value: '100%', change: 'Óptimo' },
        { label: 'Coste Laboral', value: '€2.140', change: '15% ventas' },
        { label: 'Incidencias', value: '0', change: 'Sin pendientes' },
    ];
    if (lower.includes('kpi') || lower.includes('métric') || lower.includes('metric')) {
        return pool.slice(0, count);
    }
    return pool.slice(0, count);
}

function surfaceTitle(surfaceType: SurfaceType, suffix: string): string {
    const names: Record<SurfaceType, string> = {
        pantalla: 'Pantalla Principal',
        dashboard: 'Resumen Ejecutivo',
        modal: 'Diálogo de Detalle',
        formulario: 'Formulario de Registro',
        tabla: 'Listado de Datos',
        kpis: 'Panel de Métricas',
        cabecera: 'Cabecera de Sección',
        drawer: 'Panel Lateral',
        'bottom-sheet': 'Hoja Inferior',
    };
    return `${names[surfaceType]}${suffix}`;
}

function composeBlocks(
    prompt: string,
    surfaceType: SurfaceType,
    viewport: ViewportPreset,
    seed: number,
    suffix: string,
): Record<string, MarbellaBlock[]> {
    const allowed = getAllowedBlocks(surfaceType, viewport);
    const lower = prompt.toLowerCase();
    const has = (t: BlockType) => allowed.includes(t);
    const blocks: Record<string, MarbellaBlock[]> = { header: [], main: [], sidebar: [] };

    if (has('top-bar')) {
        blocks.header.push({ id: `ai-tb-${seed}`, type: 'top-bar', props: { title: 'Marbella' } });
    }

    if (has('page-header')) {
        blocks.header.push({
            id: `ai-hd-${seed}`,
            type: 'page-header',
            props: { title: surfaceTitle(surfaceType, suffix), description: `Propuesta generada para: "${prompt}".` },
        });
    }

    if (has('tabs')) {
        blocks.header.push({ id: `ai-tabs-${seed}`, type: 'tabs', props: { tabs: ['Resumen', 'Detalle', 'Historial'], active: 'Resumen' } });
    }

    if (has('filter-bar')) {
        blocks.header.push({ id: `ai-flt-${seed}`, type: 'filter-bar', props: { showSearch: true, showNew: true, placeholder: 'Buscar...' } });
    }

    if (has('kpi-grid')) {
        const columns = viewport === 'mobile' ? 2 : 3;
        blocks.main.push({ id: `ai-kpi-${seed}`, type: 'kpi-grid', props: { items: buildKpis(lower, columns) } });
    }

    if (has('data-table')) {
        blocks.main.push({
            id: `ai-tbl-${seed}`,
            type: 'data-table',
            props: {
                title: 'Listado de Datos',
                density: 'standard',
                format: viewport === 'mobile' ? 'list' : 'table',
                boxed: true,
            },
        });
    }

    if (has('form')) {
        blocks.main.push({ id: `ai-form-${seed}`, type: 'form', props: { title: 'Formulario' } });
    }

    if (has('container-block')) {
        blocks.main.push({ id: `ai-card-${seed}`, type: 'container-block', props: { title: 'Detalle' } });
    }

    if (has('callout-banner')) {
        blocks.main.push({
            id: `ai-call-${seed}`,
            type: 'callout-banner',
            props: { title: 'Aviso', message: 'Indicación semántica destacada en pantalla.', variant: 'info' },
        });
    }

    if (has('fab')) {
        blocks.main.push({ id: `ai-fab-${seed}`, type: 'fab', props: { label: 'Nuevo' } });
    }

    if (has('bottom-nav') && viewport === 'mobile') {
        blocks.main.push({ id: `ai-bn-${seed}`, type: 'bottom-nav', props: { active: 'Inicio' } });
    }

    if (has('sidebar-nav') && viewport !== 'mobile') {
        blocks.sidebar.push({ id: `ai-sb-${seed}`, type: 'sidebar-nav', props: { variant: 'app-menu' } });
    }

    return blocks;
}

// ==========================================
// SANEAMIENTO: el Copiloto nunca emite una variante inválida
// ==========================================

function sanitizeVariant(variant: MarbellaVariant, viewport: ViewportPreset): MarbellaVariant {
    const { surfaceType } = variant;
    const allowed = getAllowedBlocks(surfaceType, viewport);
    const allowedRegions = getAllowedRegions(surfaceType, viewport);

    const cleanRegions: Record<string, MarbellaBlock[]> = {};
    Object.entries(variant.regions || {}).forEach(([region, blocks]) => {
        if (!allowedRegions.includes(region as any)) return;
        const clean = blocks
            .filter(b => allowed.includes(b.type))
            .map(b => {
                const next = { ...b, props: { ...b.props } };
                if (next.type === 'data-table' && viewport === 'mobile' && next.props.format !== 'list') {
                    next.props.format = 'list';
                }
                if (next.type === 'kpi-grid') {
                    const max = viewport === 'mobile' ? 2 : viewport === 'tablet' ? 3 : 4;
                    const items = Array.isArray(next.props.items) ? next.props.items.slice(0, max) : [];
                    next.props.items = items;
                }
                return next;
            });
        if (clean.length > 0) cleanRegions[region] = clean;
    });

    const contract = getSurfaceContract(surfaceType);
    const layout = contract.allowedLayouts.includes(variant.layout)
        ? variant.layout
        : defaultLayoutForSurface(surfaceType);

    return {
        ...variant,
        layout,
        regions: cleanRegions,
        updatedAt: new Date().toISOString(),
    };
}

function buildCandidate(
    request: CopilotGenerationRequest,
    seed: number,
    index: number,
    total: number,
): MarbellaVariant {
    const suffix = total > 1 ? ` (Propuesta ${index + 1})` : '';
    return {
        id: `ai-var-${seed}`,
        name: `Propuesta IA: ${surfaceTitle(request.surfaceType, suffix)}`,
        description: `Generada bajo el contrato de ${request.surfaceType} (${request.viewport}).`,
        surfaceType: request.surfaceType,
        layout: defaultLayoutForSurface(request.surfaceType),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        regions: composeBlocks(request.prompt, request.surfaceType, request.viewport, seed, suffix),
    };
}

function adaptBaseVariant(base: MarbellaVariant, request: CopilotGenerationRequest, seed: number): MarbellaVariant {
    const clone: MarbellaVariant = JSON.parse(JSON.stringify(base));
    return {
        ...clone,
        id: `ai-var-${seed}`,
        name: `${base.name} • Refinada`,
        description: `Variante refinada bajo el contrato de ${request.surfaceType} (${request.viewport}).`,
        updatedAt: new Date().toISOString(),
    };
}

function refineToValidCandidate(
    base: MarbellaVariant | null,
    request: CopilotGenerationRequest,
    seed: number,
    index: number,
    total: number,
): MarbellaVariant | null {
    const useBase = base && base.surfaceType === request.surfaceType;

    for (let attempt = 0; attempt < MAX_REPAIR_ATTEMPTS; attempt++) {
        const candidate = useBase
            ? adaptBaseVariant(base, request, seed + attempt)
            : buildCandidate(request, seed + attempt, index, total);

        const sanitized = sanitizeVariant(candidate, request.viewport);
        const violations = validateVariant(sanitized, request.viewport);

        if (!hasBlockingViolations(violations)) {
            return sanitized;
        }
    }

    return null;
}

// ==========================================
// API PÚBLICA DEL CO-PILOTO
// ==========================================

export function generateCopilotVariants(
    request: CopilotGenerationRequest,
    existingVariants: MarbellaVariant[],
): MarbellaVariant[] {
    const { variantCount, baseVariantId } = request;
    const count = Math.min(Math.max(1, variantCount || 1), 5);
    const base = baseVariantId ? existingVariants.find(v => v.id === baseVariantId) || null : null;

    const results: MarbellaVariant[] = [];
    const baseSeed = Date.now();

    for (let i = 0; i < count; i++) {
        const valid = refineToValidCandidate(base, request, baseSeed + i * 1000, i, count);
        if (valid) results.push(valid);
    }

    return results;
}
