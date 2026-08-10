import {
    BlockType,
    MarbellaBlock,
    MarbellaVariant,
    SpatialCompositionFlow,
    SurfaceType,
    ViewportPreset,
} from './types';

export type SurfaceRegion = 'header' | 'main' | 'sidebar';

export type ContractSeverity = 'block' | 'warn';

export interface ContractViolation {
    surfaceType: SurfaceType;
    viewport: ViewportPreset;
    region?: string;
    blockType?: BlockType;
    message: string;
    severity: ContractSeverity;
}

export interface SurfaceContract {
    type: SurfaceType;
    name: string;
    icon: string;
    description: string;
    regions: SurfaceRegion[];
    allowedBlocks: BlockType[];
    allowedLayouts: SpatialCompositionFlow[];
    minViewport: 'mobile' | 'tablet' | 'desktop';
}

export interface ViewportRules {
    forbiddenBlocks: BlockType[];
    forceListTables: boolean;
    maxKpiColumns: number;
    forbidSidebar: boolean;
    minTouchTarget: number;
    safeAreas: boolean;
}

const VIEWPORT_WIDTH: Record<ViewportPreset, number> = {
    mobile: 375,
    tablet: 768,
    desktop: 1400,
};

const MIN_VIEWPORT_WIDTH: Record<SurfaceContract['minViewport'], number> = {
    mobile: 375,
    tablet: 768,
    desktop: 1400,
};

// ==========================================
// CONTRATOS DE SUPERFICIE
// ==========================================

export const SURFACES: SurfaceContract[] = [
    {
        type: 'pantalla',
        name: 'Pantalla Completa',
        icon: '💻',
        description: 'Vista principal de la app: puede alojar cualquier patrón y estructura de navegación.',
        regions: ['header', 'main', 'sidebar'],
        allowedBlocks: [
            'top-bar', 'page-header', 'filter-bar', 'tabs', 'kpi-grid',
            'data-table', 'container-block', 'callout-banner', 'bottom-nav',
            'fab', 'form', 'sidebar-nav',
        ],
        allowedLayouts: ['fluid-stack', 'hero-header', 'clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'dashboard',
        name: 'Dashboard',
        icon: '🎛️',
        description: 'Resumen ejecutivo con métricas. Requiere anchura suficiente para la rejilla.',
        regions: ['header', 'main', 'sidebar'],
        allowedBlocks: [
            'top-bar', 'page-header', 'filter-bar', 'tabs', 'kpi-grid',
            'data-table', 'container-block', 'callout-banner', 'bottom-nav',
            'fab', 'form',
        ],
        allowedLayouts: ['fluid-stack', 'hero-header'],
        minViewport: 'tablet',
    },
    {
        type: 'modal',
        name: 'Modal / Diálogo',
        icon: '🔲',
        description: 'Superficie flotante centrada sobre un fondo atenuado. Sin cromo de app.',
        regions: ['header', 'main'],
        allowedBlocks: [
            'page-header', 'filter-bar', 'tabs', 'kpi-grid',
            'data-table', 'container-block', 'callout-banner', 'form',
        ],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'formulario',
        name: 'Formulario',
        icon: '📝',
        description: 'Captura de datos con campos táctiles. Vocabulario reducido a formularios y avisos.',
        regions: ['header', 'main'],
        allowedBlocks: ['page-header', 'form', 'filter-bar', 'container-block', 'callout-banner'],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'tabla',
        name: 'Tabla de Datos',
        icon: '📊',
        description: 'Superficie de listado y filtrado de datos. En móvil se muestra como lista.',
        regions: ['header', 'main'],
        allowedBlocks: ['page-header', 'data-table', 'filter-bar', 'kpi-grid', 'container-block', 'callout-banner'],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'kpis',
        name: 'Métricas / KPIs',
        icon: '📈',
        description: 'Rejilla de indicadores. Sin tablas ni navegación compleja.',
        regions: ['header', 'main'],
        allowedBlocks: ['page-header', 'kpi-grid', 'container-block', 'callout-banner'],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'cabecera',
        name: 'Cabecera de Sección',
        icon: '▔',
        description: 'Banda de identidad y contexto. Solo aloja cabeceras y métricas.',
        regions: ['header'],
        allowedBlocks: ['page-header', 'kpi-grid'],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
    {
        type: 'drawer',
        name: 'Drawer / Panel Lateral',
        icon: '📑',
        description: 'Panel deslizante desde el borde. Requiere anchura para no tapar el contenido.',
        regions: ['header', 'main'],
        allowedBlocks: [
            'page-header', 'filter-bar', 'tabs', 'kpi-grid',
            'data-table', 'container-block', 'callout-banner', 'form',
        ],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'tablet',
    },
    {
        type: 'bottom-sheet',
        name: 'Bottom Sheet',
        icon: '⬆️',
        description: 'Panel emergente anclado a la base. Contenido compacto sin cabecera.',
        regions: ['main'],
        allowedBlocks: ['container-block', 'data-table', 'filter-bar', 'kpi-grid', 'callout-banner', 'form'],
        allowedLayouts: ['clean-canvas'],
        minViewport: 'mobile',
    },
];

// ==========================================
// REGLAS DE VIEWPORT
// ==========================================

export const VIEWPORT_RULES: Record<ViewportPreset, ViewportRules> = {
    desktop: {
        forbiddenBlocks: [],
        forceListTables: false,
        maxKpiColumns: 4,
        forbidSidebar: false,
        minTouchTarget: 48,
        safeAreas: false,
    },
    tablet: {
        forbiddenBlocks: [],
        forceListTables: false,
        maxKpiColumns: 3,
        forbidSidebar: false,
        minTouchTarget: 48,
        safeAreas: false,
    },
    mobile: {
        forbiddenBlocks: ['sidebar-nav'],
        forceListTables: true,
        maxKpiColumns: 2,
        forbidSidebar: true,
        minTouchTarget: 48,
        safeAreas: true,
    },
};

export const SURFACE_BY_TYPE: Record<SurfaceType, SurfaceContract> = Object.fromEntries(
    SURFACES.map(s => [s.type, s])
) as Record<SurfaceType, SurfaceContract>;

// ==========================================
// FUNCIONES PURAS DE CONTRATO
// ==========================================

export function getSurfaceContract(surfaceType: SurfaceType): SurfaceContract {
    return SURFACE_BY_TYPE[surfaceType];
}

export function canSurfaceFitViewport(surfaceType: SurfaceType, viewport: ViewportPreset): boolean {
    const contract = getSurfaceContract(surfaceType);
    return VIEWPORT_WIDTH[viewport] >= MIN_VIEWPORT_WIDTH[contract.minViewport];
}

export function getAllowedBlocks(surfaceType: SurfaceType, viewport: ViewportPreset): BlockType[] {
    const contract = getSurfaceContract(surfaceType);
    const rules = VIEWPORT_RULES[viewport];
    return contract.allowedBlocks.filter(b => !rules.forbiddenBlocks.includes(b));
}

export function isBlockAllowed(surfaceType: SurfaceType, viewport: ViewportPreset, type: BlockType): boolean {
    return getAllowedBlocks(surfaceType, viewport).includes(type);
}

export function getAllowedRegions(surfaceType: SurfaceType, viewport: ViewportPreset): SurfaceRegion[] {
    const contract = getSurfaceContract(surfaceType);
    const rules = VIEWPORT_RULES[viewport];
    return contract.regions.filter(r => !(r === 'sidebar' && rules.forbidSidebar));
}

export function isRegionAllowed(surfaceType: SurfaceType, viewport: ViewportPreset, region: string): boolean {
    return getAllowedRegions(surfaceType, viewport).includes(region as SurfaceRegion);
}

// ==========================================
// VALIDACIÓN DE BLOQUES Y VARIANTES
// ==========================================

function validateBlockInRegion(
    surfaceType: SurfaceType,
    viewport: ViewportPreset,
    region: string,
    block: MarbellaBlock,
): ContractViolation[] {
    const violations: ContractViolation[] = [];
    const rules = VIEWPORT_RULES[viewport];

    if (!isBlockAllowed(surfaceType, viewport, block.type)) {
        violations.push({
            surfaceType,
            viewport,
            region,
            blockType: block.type,
            message: `El componente "${block.type}" no está permitido en ${getSurfaceContract(surfaceType).name} (${viewport}).`,
            severity: 'block',
        });
    }

    if (block.type === 'data-table' && rules.forceListTables && block.props?.format === 'table') {
        violations.push({
            surfaceType,
            viewport,
            region,
            blockType: block.type,
            message: 'Las tablas en formato matricial desbordan el ancho en móvil. Deben renderizarse como lista.',
            severity: 'block',
        });
    }

    if (block.type === 'kpi-grid') {
        const items = (block.props?.items || []).length;
        if (items > rules.maxKpiColumns) {
            violations.push({
                surfaceType,
                viewport,
                region,
                blockType: block.type,
                message: `La rejilla KPI tiene ${items} tarjetas y el viewport ${viewport} admite como máximo ${rules.maxKpiColumns}.`,
                severity: 'block',
            });
        }
    }

    return violations;
}

export function validateBlock(
    surfaceType: SurfaceType,
    viewport: ViewportPreset,
    region: string,
    block: MarbellaBlock,
): ContractViolation[] {
    return validateBlockInRegion(surfaceType, viewport, region, block);
}

export function validateVariant(variant: MarbellaVariant, viewport: ViewportPreset): ContractViolation[] {
    const violations: ContractViolation[] = [];
    const surfaceType = variant.surfaceType;
    const contract = getSurfaceContract(surfaceType);
    const allowedRegions = getAllowedRegions(surfaceType, viewport);

    if (!contract.allowedLayouts.includes(variant.layout)) {
        violations.push({
            surfaceType,
            viewport,
            message: `El layout "${variant.layout}" no está permitido para ${contract.name}.`,
            severity: 'warn',
        });
    }

    Object.entries(variant.regions || {}).forEach(([region, blocks]) => {
        if (blocks.length === 0) return;

        if (!allowedRegions.includes(region as SurfaceRegion)) {
            violations.push({
                surfaceType,
                viewport,
                region,
                message: `La región "${region}" no está permitida en ${contract.name} (${viewport}). No se renderiza.`,
                severity: 'warn',
            });
            return;
        }

        blocks.forEach(block => {
            violations.push(...validateBlockInRegion(surfaceType, viewport, region, block));
        });
    });

    return violations;
}

export function hasBlockingViolations(violations: ContractViolation[]): boolean {
    return violations.some(v => v.severity === 'block');
}

// ==========================================
// CONSTRUCCIÓN DE CONTENIDO COMPATIBLE
// ==========================================

export function buildInitialRegions(
    surfaceType: SurfaceType,
    name: string,
    viewport: ViewportPreset,
): Record<string, MarbellaBlock[]> {
    const ts = Date.now();
    const header: MarbellaBlock[] = [];
    const main: MarbellaBlock[] = [];
    const sidebar: MarbellaBlock[] = [];

    const headerAllowed = isBlockAllowed(surfaceType, viewport, 'page-header');
    if (headerAllowed) {
        header.push({
            id: `hd-${ts}`,
            type: 'page-header',
            props: { title: name || 'Nueva Sección', description: 'Declaración de intención inicial.' },
        });
    }

    if (surfaceType === 'pantalla' || surfaceType === 'dashboard') {
        if (isBlockAllowed(surfaceType, viewport, 'top-bar')) {
            header.unshift({
                id: `tb-${ts}`,
                type: 'top-bar',
                props: { title: name || 'Marbella' },
            });
        }
        if (viewport === 'mobile' && isBlockAllowed(surfaceType, viewport, 'bottom-nav')) {
            main.push({
                id: `bn-${ts}`,
                type: 'bottom-nav',
                props: { active: 'Inicio' },
            });
        }
    }

    if (surfaceType === 'formulario' && isBlockAllowed(surfaceType, viewport, 'form')) {
        main.push({ id: `form-${ts}`, type: 'form', props: { title: 'Formulario' } });
    }

    if (surfaceType === 'tabla' && isBlockAllowed(surfaceType, viewport, 'data-table')) {
        main.push({
            id: `tbl-${ts}`,
            type: 'data-table',
            props: {
                title: 'Listado de Datos',
                density: 'standard',
                format: viewport === 'mobile' ? 'list' : 'table',
            },
        });
    }

    if (
        (surfaceType === 'pantalla' || surfaceType === 'dashboard' || surfaceType === 'kpis') &&
        isBlockAllowed(surfaceType, viewport, 'kpi-grid')
    ) {
        main.push({
            id: `kpi-${ts}`,
            type: 'kpi-grid',
            props: {
                items: [
                    { label: 'Indicador 1', value: '100' },
                    { label: 'Indicador 2', value: '98%' },
                ],
            },
        });
    }

    if (surfaceType === 'cabecera') {
        if (isBlockAllowed(surfaceType, viewport, 'kpi-grid')) {
            header.push({
                id: `kpi-${ts}`,
                type: 'kpi-grid',
                props: {
                    items: [
                        { label: 'Indicador 1', value: '100' },
                        { label: 'Indicador 2', value: '98%' },
                    ],
                },
            });
        }
    }

    if (surfaceType === 'bottom-sheet' || surfaceType === 'drawer') {
        main.push({
            id: `card-${ts}`,
            type: 'container-block',
            props: { title: 'Contenido del panel' },
        });
    }

    const regions: Record<string, MarbellaBlock[]> = { header, main, sidebar };
    Object.keys(regions).forEach(key => {
        if (!getAllowedRegions(surfaceType, viewport).includes(key as SurfaceRegion)) {
            delete regions[key];
        }
    });

    return regions;
}

export function defaultLayoutForSurface(surfaceType: SurfaceType): SpatialCompositionFlow {
    const contract = getSurfaceContract(surfaceType);
    return contract.allowedLayouts[0];
}
