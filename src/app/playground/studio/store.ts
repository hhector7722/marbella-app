/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
    StudioState,
    MarbellaVariant,
    MarbellaBlock,
    DesignLevel,
    IntentCategory,
    SpatialCompositionFlow,
    BlockType,
    CopilotMessage,
} from './types';
import {
    isBlockAllowed,
    isRegionAllowed,
    getAllowedRegions,
    getSurfaceContract,
    buildInitialRegions,
    defaultLayoutForSurface,
} from './contracts';
import { generateCopilotVariants } from './copilot/ai-engine';

const DEFAULT_MARBELLA_TOKENS: Record<string, string> = {
    'color.marca': '#36606F',
    'color.marca.intenso': '#2F5D6A',
    'color.superficie': '#FFFFFF',
    'color.superficie.hundida': '#FAFAFA',
    'color.texto': '#18181B',
    'radio.control': '12px',
    'radio.superficie': '16px',
    'tactil.minimo': '48px',
    'tipo.familia': 'Inter',
    'espacio.base': '4px'
};

const INITIAL_CLEAN_VARIANTS: MarbellaVariant[] = [
    {
        id: 'marbella-workspace-main',
        name: 'Pantalla Principal Marbella',
        description: 'Lienzo de trabajo inicial de Marbella App.',
        surfaceType: 'pantalla',
        layout: 'fluid-stack',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        regions: {
            'header': [
                { id: 'hd-title-main', type: 'page-header', props: { title: 'Gestión de Equipo Marbella', description: 'Supervisión de personal, horarios e incidencias operativas.', showStats: true } },
                { id: 'hd-filters-main', type: 'filter-bar', props: { showSearch: true, showNew: true, placeholder: 'Buscar por nombre o DNI...' } }
            ],
            'main': [
                {
                    id: 'kpi-summary-main',
                    type: 'kpi-grid',
                    props: {
                        items: [
                            { label: 'Personal Activo', value: '42', change: '+3 este mes', trend: 'up' },
                            { label: 'Turno Actual', value: '18 camareros', change: '100% cobertura', trend: 'neutral' }
                        ]
                    }
                },
                { id: 'm-table-main', type: 'data-table', props: { density: 'high', columns: ['Nombre', 'Puesto', 'Estado', 'Horas Semanal'], title: 'Plantilla de Personal' } }
            ],
            'sidebar': [
                { id: 'sb-nav-main', type: 'sidebar-nav', props: { variant: 'app-menu' } }
            ]
        }
    }
];

function defaultPropsFor(type: BlockType): Record<string, any> {
    switch (type) {
        case 'page-header':
            return { title: 'Nuevo Encabezado', description: 'Escribe una descripción corta aquí.' };
        case 'data-table':
            return { title: 'Nueva Tabla de Datos', density: 'standard', columns: ['Columna 1', 'Columna 2', 'Estado'] };
        case 'filter-bar':
            return { showSearch: true, showNew: true, placeholder: 'Buscar...' };
        case 'sidebar-nav':
            return { variant: 'app-menu' };
        case 'kpi-grid':
            return { items: [{ label: 'Métrica 1', value: '100' }, { label: 'Métrica 2', value: '85%' }] };
        case 'container-block':
            return { title: 'Tarjeta Contenedora', padding: 'normal', bgStyle: 'white' };
        case 'callout-banner':
            return { title: 'Aviso Importante', message: 'Este es un mensaje explicativo destacado en pantalla.', variant: 'info' };
        case 'top-bar':
            return { title: 'Marbella' };
        case 'bottom-nav':
            return { active: 'Inicio' };
        case 'tabs':
            return { tabs: ['Resumen', 'Detalle', 'Historial'], active: 'Resumen' };
        case 'fab':
            return { label: 'Nuevo' };
        case 'form':
            return { title: 'Formulario' };
        default:
            return {};
    }
}

export const useStudioStore = create<StudioState>()(
    persist(
        (set, get) => ({
            variants: INITIAL_CLEAN_VARIANTS,
            activeVariantId: INITIAL_CLEAN_VARIANTS[0].id,
            selectedBlockId: 'hd-title-main',
            hoveredBlockId: null,
            viewMode: 'edit',
            viewportPreset: 'desktop',
            zoom: 100,

            // Variant Manager State
            isVariantManagerOpen: false,

            // Recursive Object Focus Stack
            focusStack: [{ id: 'root-surface', name: INITIAL_CLEAN_VARIANTS[0].name, type: 'pantalla' }],
            focusedBlockId: null,

            // Multilevel Progressive Zoom State
            currentLevel: 1, // Starts at Level 1: INTENCIÓN
            tokens: DEFAULT_MARBELLA_TOKENS,

            // AI Copilot (governed) State
            isCopilotOpen: false,
            isNewSurfaceModalOpen: false,
            isGeneratingAI: false,
            copilotMessages: [],

            // Variant Manager Actions
            openVariantManager: () => set({ isVariantManagerOpen: true }),
            closeVariantManager: () => set({ isVariantManagerOpen: false }),

            renameVariant: (id, newName) => set((state) => ({
                variants: state.variants.map(v => v.id === id ? {
                    ...v,
                    name: newName,
                    updatedAt: new Date().toISOString()
                } : v)
            })),

            duplicateVariant: (id) => set((state) => {
                const target = state.variants.find(v => v.id === id);
                if (!target) return state;

                const newId = `var-dup-${Date.now().toString(36)}`;
                const cloned: MarbellaVariant = {
                    ...JSON.parse(JSON.stringify(target)),
                    id: newId,
                    name: `${target.name} - Copia`,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                };

                return {
                    variants: [...state.variants, cloned],
                    activeVariantId: newId,
                    focusStack: [{ id: 'root-surface', name: cloned.name, type: cloned.surfaceType }]
                };
            }),

            deleteVariant: (id) => {
                const state = get();
                if (state.variants.length <= 1) {
                    return false; // Cannot delete the last remaining workspace variant
                }

                const nextVariants = state.variants.filter(v => v.id !== id);
                const nextActiveId = state.activeVariantId === id ? nextVariants[0].id : state.activeVariantId;
                const activeVar = nextVariants.find(v => v.id === nextActiveId);

                set({
                    variants: nextVariants,
                    activeVariantId: nextActiveId,
                    selectedBlockId: null,
                    focusStack: [{ id: 'root-surface', name: activeVar ? activeVar.name : 'Pantalla', type: activeVar ? activeVar.surfaceType : 'pantalla' }]
                });

                return true;
            },

            // Recursive Object Navigation Actions
            focusIntoObject: (id, name, type) => set((st) => ({
                focusStack: [...st.focusStack, { id, name, type }],
                focusedBlockId: id,
                selectedBlockId: id,
                currentLevel: 2
            })),

            focusOutObject: () => set((st) => {
                if (st.focusStack.length <= 1) return st;
                const nextStack = st.focusStack.slice(0, -1);
                const lastNode = nextStack[nextStack.length - 1];
                return {
                    focusStack: nextStack,
                    focusedBlockId: lastNode.id === 'root-surface' ? null : lastNode.id,
                    selectedBlockId: lastNode.id === 'root-surface' ? null : lastNode.id
                };
            }),

            popToFocusIndex: (index) => set((st) => {
                if (index < 0 || index >= st.focusStack.length) return st;
                const nextStack = st.focusStack.slice(0, index + 1);
                const targetNode = nextStack[nextStack.length - 1];
                return {
                    focusStack: nextStack,
                    focusedBlockId: targetNode.id === 'root-surface' ? null : targetNode.id,
                    selectedBlockId: targetNode.id === 'root-surface' ? null : targetNode.id
                };
            }),

            // Multilevel Level Mutators
            setCurrentLevel: (level: DesignLevel) => set({ currentLevel: level }),
            zoomInLevel: () => set((st) => ({ currentLevel: Math.min(5, st.currentLevel + 1) as DesignLevel })),
            zoomOutLevel: () => set((st) => ({ currentLevel: Math.max(1, st.currentLevel - 1) as DesignLevel })),

            updateSystemToken: (key, value) => set((st) => ({
                tokens: { ...st.tokens, [key]: value }
            })),

            addIntentZone: (category: IntentCategory, targetRegion = 'main') => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;

                const viewport = state.viewportPreset;

                // CONTRACT GUARD: la región destino debe existir en el contrato actual
                if (!isRegionAllowed(active.surfaceType, viewport, targetRegion)) {
                    const fallback = getAllowedRegions(active.surfaceType, viewport)[0];
                    if (!fallback) return state;
                    targetRegion = fallback;
                }

                const timestamp = Date.now();
                const newBlocks: MarbellaBlock[] = [];

                let type: BlockType | null = null;
                let props: Record<string, any> = {};

                if (category === 'identidad') {
                    type = 'page-header';
                    props = { title: 'Zona de Identidad & Contexto', description: 'Describe la entidad principal y el contexto operativo.' };
                } else if (category === 'datos') {
                    type = 'data-table';
                    props = { title: 'Zona de Exposición de Datos', density: 'standard', boxed: true };
                } else if (category === 'control') {
                    type = 'filter-bar';
                    props = { showSearch: true, showNew: true, placeholder: 'Zona de Control: Buscar o acotar...' };
                } else if (category === 'resumen') {
                    type = 'kpi-grid';
                    props = { items: [{ label: 'Indicador 1', value: '100' }, { label: 'Indicador 2', value: '98%' }] };
                } else if (category === 'navegacion') {
                    type = 'sidebar-nav';
                    props = { variant: 'page-menu' };
                } else if (category === 'alerta' || category === 'estado') {
                    type = 'callout-banner';
                    props = { title: 'Zona de Alerta & Estado', message: 'Indicación semántica destacada en pantalla.' };
                } else {
                    type = 'container-block';
                    props = { title: `Zona de ${category.toUpperCase()}` };
                }

                // CONTRACT GUARD: la intención se traduce al bloque permitido; si el que toca
                // no está permitido en la superficie+viewport, se descarta (no se crea nada).
                if (!type || !isBlockAllowed(active.surfaceType, viewport, type)) {
                    return state;
                }

                if (type === 'data-table' && viewport === 'mobile') {
                    props.format = 'list';
                }

                const newBlock: MarbellaBlock = { id: `intent-${type}-${timestamp}`, type, props };
                newBlocks.push(newBlock);

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const currentReg = v.regions[targetRegion] || [];
                        return {
                            ...v,
                            updatedAt: new Date().toISOString(),
                            regions: {
                                ...v.regions,
                                [targetRegion]: [...currentReg, ...newBlocks]
                            }
                        };
                    }),
                    selectedBlockId: newBlocks[0].id,
                    currentLevel: 2
                };
            }),

            // Variant actions
            setActiveVariant: (id) => set((state) => {
                const targetVar = state.variants.find(v => v.id === id);
                return {
                    activeVariantId: id,
                    selectedBlockId: null,
                    focusStack: [{ id: 'root-surface', name: targetVar ? targetVar.name : 'Pantalla', type: targetVar ? targetVar.surfaceType : 'pantalla' }],
                    focusedBlockId: null
                };
            }),

            saveVariant: (variant) => set((state) => {
                const exists = state.variants.some(v => v.id === variant.id);
                const updatedObj = { ...variant, updatedAt: new Date().toISOString() };
                if (exists) {
                    return { variants: state.variants.map(v => v.id === variant.id ? updatedObj : v) };
                }
                return { variants: [...state.variants, updatedObj] };
            }),

            addVariant: (name, surfaceType = 'pantalla', layout) => set((state) => {
                const newId = `var-${Date.now().toString(36)}`;
                const timestampIso = new Date().toISOString();
                const contract = getSurfaceContract(surfaceType);
                const viewport = state.viewportPreset;
                const newVariant: MarbellaVariant = {
                    id: newId,
                    name: name || contract.name,
                    description: contract.description,
                    surfaceType,
                    layout: layout && contract.allowedLayouts.includes(layout)
                        ? layout
                        : defaultLayoutForSurface(surfaceType),
                    createdAt: timestampIso,
                    updatedAt: timestampIso,
                    regions: buildInitialRegions(surfaceType, name || contract.name, viewport)
                };
                return {
                    variants: [...state.variants, newVariant],
                    activeVariantId: newId,
                    currentLevel: 1,
                    focusStack: [{ id: 'root-surface', name: newVariant.name, type: surfaceType }],
                    focusedBlockId: null,
                    selectedBlockId: null
                };
            }),

            // Copilot Actions (governed by contracts)
            toggleCopilotPanel: (open) => set((state) => ({
                isCopilotOpen: typeof open === 'boolean' ? open : !state.isCopilotOpen
            })),

            openNewSurfaceModal: () => set({ isNewSurfaceModalOpen: true }),
            closeNewSurfaceModal: () => set({ isNewSurfaceModalOpen: false }),

            generateAIProposals: (prompt, surfaceType, viewport, count = 3) => {
                set({ isGeneratingAI: true });

                setTimeout(() => {
                    const generated = generateCopilotVariants(
                        { prompt, surfaceType, viewport, variantCount: count },
                        get().variants
                    );

                    const assistantMsg: CopilotMessage = {
                        id: `msg-ai-${Date.now()}`,
                        role: 'assistant',
                        text: generated.length > 0
                            ? `He generado ${generated.length} propuesta(s) para ${getSurfaceContract(surfaceType).name} (${viewport}). Las que violaban el contrato no se muestran.`
                            : `No encontré una combinación que respete el contrato de ${getSurfaceContract(surfaceType).name} en ${viewport}. Prueba otra superficie o viewport.`,
                        generatedVariantIds: generated.map(v => v.id),
                        timestamp: new Date().toISOString(),
                    };

                    set((st) => ({
                        isGeneratingAI: false,
                        copilotMessages: [...st.copilotMessages, assistantMsg],
                        variants: [...st.variants, ...generated],
                        activeVariantId: generated[0] ? generated[0].id : st.activeVariantId,
                        selectedBlockId: null,
                        isCopilotOpen: true,
                    }));
                }, 650);
            },

            refineAIVariant: (prompt) => {
                const state = get();
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return;

                set({ isGeneratingAI: true });

                setTimeout(() => {
                    const refined = generateCopilotVariants(
                        {
                            prompt,
                            surfaceType: active.surfaceType,
                            viewport: state.viewportPreset,
                            variantCount: 1,
                            baseVariantId: active.id,
                        },
                        get().variants
                    );

                    const assistantMsg: CopilotMessage = {
                        id: `msg-ai-${Date.now()}`,
                        role: 'assistant',
                        text: refined[0]
                            ? 'He refinado la variante activa respetando el contrato de su superficie.'
                            : 'No pude refinar la variante sin violar su contrato. La dejo intacta.',
                        generatedVariantIds: refined.map(v => v.id),
                        timestamp: new Date().toISOString(),
                    };

                    set((st) => ({
                        isGeneratingAI: false,
                        copilotMessages: [...st.copilotMessages, assistantMsg],
                        variants: refined[0] ? [...st.variants, refined[0]] : st.variants,
                        activeVariantId: refined[0] ? refined[0].id : st.activeVariantId,
                        selectedBlockId: null,
                        isCopilotOpen: true,
                    }));
                }, 650);
            },

            // Interactive state
            selectBlock: (id) => set({ selectedBlockId: id }),
            setHoveredBlock: (id) => set({ hoveredBlockId: id }),
            setViewMode: (mode) => set({ viewMode: mode }),
            setViewportPreset: (preset) => set({ viewportPreset: preset }),
            setZoom: (zoom) => set({ zoom }),

            // Property updates (guarded by contract)
            updateBlockProps: (blockId, newProps) => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;
                const viewport = state.viewportPreset;

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const newRegions: Record<string, MarbellaBlock[]> = {};
                        Object.keys(v.regions).forEach(regKey => {
                            newRegions[regKey] = v.regions[regKey].map(blk => {
                                if (blk.id !== blockId) return blk;

                                let props = { ...blk.props, ...newProps };

                                // CONTRACT GUARD: las tablas en móvil solo pueden renderizarse como lista
                                if (blk.type === 'data-table' && viewport === 'mobile' && props.format !== 'list') {
                                    props.format = 'list';
                                }

                                // CONTRACT GUARD: la rejilla KPI respeta el máximo de columnas del viewport
                                if (blk.type === 'kpi-grid') {
                                    const max = viewport === 'mobile' ? 2 : viewport === 'tablet' ? 3 : 4;
                                    if (Array.isArray(props.items) && props.items.length > max) {
                                        props = { ...props, items: props.items.slice(0, max) };
                                    }
                                }

                                return { ...blk, props };
                            });
                        });
                        return { ...v, updatedAt: new Date().toISOString(), regions: newRegions };
                    })
                };
            }),

            addBlockToRegion: (regionId, type, targetIndex) => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;
                const viewport = state.viewportPreset;

                // CONTRACT GUARD: la región y el bloque deben estar permitidos en la superficie+viewport actual
                if (!isRegionAllowed(active.surfaceType, viewport, regionId)) return state;
                if (!isBlockAllowed(active.surfaceType, viewport, type)) return state;

                const newId = `blk-${type}-${Date.now().toString(36)}`;

                let defaultProps: Record<string, any> = defaultPropsFor(type);
                if (type === 'data-table' && viewport === 'mobile') {
                    defaultProps = { ...defaultProps, format: 'list' };
                }
                if (type === 'kpi-grid' && viewport === 'mobile') {
                    defaultProps = { ...defaultProps, items: defaultProps.items.slice(0, 2) };
                }

                const newBlock: MarbellaBlock = { id: newId, type, props: defaultProps };

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const currentBlocks = v.regions[regionId] || [];
                        const insertAt = typeof targetIndex === 'number' ? targetIndex : currentBlocks.length;
                        const nextBlocks = [...currentBlocks];
                        nextBlocks.splice(insertAt, 0, newBlock);
                        return {
                            ...v,
                            updatedAt: new Date().toISOString(),
                            regions: {
                                ...v.regions,
                                [regionId]: nextBlocks
                            }
                        };
                    }),
                    selectedBlockId: newId
                };
            }),

            removeBlock: (blockId) => set((state) => {
                if (!state.activeVariantId) return state;
                return {
                    selectedBlockId: state.selectedBlockId === blockId ? null : state.selectedBlockId,
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const newRegions: Record<string, MarbellaBlock[]> = {};
                        Object.keys(v.regions).forEach(regKey => {
                            newRegions[regKey] = v.regions[regKey].filter(blk => blk.id !== blockId);
                        });
                        return { ...v, updatedAt: new Date().toISOString(), regions: newRegions };
                    })
                };
            }),

            duplicateBlock: (blockId) => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;
                const viewport = state.viewportPreset;

                let duplicatedId: string | null = null;
                const nextVariants = state.variants.map(v => {
                    if (v.id !== state.activeVariantId) return v;
                    const newRegions: Record<string, MarbellaBlock[]> = {};
                    Object.keys(v.regions).forEach(regKey => {
                        const blocks = v.regions[regKey];
                        const result: MarbellaBlock[] = [];
                        blocks.forEach(blk => {
                            result.push(blk);
                            if (blk.id === blockId) {
                                // CONTRACT GUARD: no duplicar si el bloque dejó de estar permitido
                                if (!isBlockAllowed(active.surfaceType, viewport, blk.type)) return;
                                const dupId = `${blk.type}-${Date.now().toString(36)}`;
                                duplicatedId = dupId;
                                const props = JSON.parse(JSON.stringify(blk.props));
                                if (blk.type === 'data-table' && viewport === 'mobile') props.format = 'list';
                                if (blk.type === 'kpi-grid') {
                                    const max = viewport === 'mobile' ? 2 : viewport === 'tablet' ? 3 : 4;
                                    props.items = (props.items || []).slice(0, max);
                                }
                                result.push({ ...blk, id: dupId, props });
                            }
                        });
                        newRegions[regKey] = result;
                    });
                    return { ...v, updatedAt: new Date().toISOString(), regions: newRegions };
                });
                return {
                    variants: nextVariants,
                    selectedBlockId: duplicatedId || state.selectedBlockId
                };
            }),

            moveBlock: (blockId, direction) => set((state) => {
                if (!state.activeVariantId) return state;
                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const newRegions: Record<string, MarbellaBlock[]> = {};
                        Object.keys(v.regions).forEach(regKey => {
                            const blocks = [...v.regions[regKey]];
                            const idx = blocks.findIndex(b => b.id === blockId);
                            if (idx !== -1) {
                                const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
                                if (targetIdx >= 0 && targetIdx < blocks.length) {
                                    const temp = blocks[idx];
                                    blocks[idx] = blocks[targetIdx];
                                    blocks[targetIdx] = temp;
                                }
                            }
                            newRegions[regKey] = blocks;
                        });
                        return { ...v, updatedAt: new Date().toISOString(), regions: newRegions };
                    })
                };
            }),

            updateRegionInActiveVariant: (regionId, blocks) => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;
                const viewport = state.viewportPreset;

                // CONTRACT GUARD: la región debe existir en el contrato actual
                if (!isRegionAllowed(active.surfaceType, viewport, regionId)) return state;

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        return {
                            ...v,
                            updatedAt: new Date().toISOString(),
                            regions: {
                                ...v.regions,
                                [regionId]: blocks
                            }
                        };
                    })
                };
            }),

            updateVariantSpatialFlow: (layout: SpatialCompositionFlow) => set((state) => {
                if (!state.activeVariantId) return state;
                const active = state.variants.find(v => v.id === state.activeVariantId);
                if (!active) return state;
                const contract = getSurfaceContract(active.surfaceType);

                // CONTRACT GUARD: el layout debe estar permitido por el contrato de la superficie
                if (!contract.allowedLayouts.includes(layout)) return state;

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        return { ...v, layout, updatedAt: new Date().toISOString() };
                    })
                };
            })
        }),
        {
            name: 'marbella-studio-storage',
            version: 3,
            migrate: (persistedState: any, version: number) => {
                if (version < 3) {
                    const variants = Array.isArray(persistedState?.variants)
                        ? persistedState.variants.map((v: any) => ({
                              ...v,
                              surfaceType: v.surfaceType || 'pantalla',
                              layout: defaultLayoutForSurface(v.surfaceType || 'pantalla'),
                          }))
                        : [];

                    return {
                        ...persistedState,
                        variants,
                        isCopilotOpen: false,
                        isNewSurfaceModalOpen: false,
                        isGeneratingAI: false,
                        copilotMessages: [],
                    };
                }
                return persistedState;
            },
        }
    )
);
