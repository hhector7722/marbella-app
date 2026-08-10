/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StudioState, MarbellaVariant, MarbellaBlock, StudioTab, DesignLevel, IntentCategory } from './types';
import { DESIGN_BENCHMARKS } from './academy/data';
import { generateCopilotVariants } from './copilot/ai-engine';
import { SurfaceType } from './copilot/types';

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

const INITIAL_VARIANTS: MarbellaVariant[] = [
    {
        id: 'prop-a-panel',
        name: 'Panel de Control',
        description: 'Alta densidad, pro-tool. Sidebar permanente.',
        layout: 'control-panel',
        regions: {
            'sidebar': [
                { id: 'sb-nav-1', type: 'sidebar-nav', props: { variant: 'app-menu' } }
            ],
            'header': [
                { id: 'hd-title', type: 'page-header', props: { title: 'Gestión de Equipo', description: 'Supervisión de personal, horarios e incidencias operativas.', showStats: true } },
                { id: 'hd-filters', type: 'filter-bar', props: { showSearch: true, showNew: true, placeholder: 'Buscar empleado por nombre o DNI...' } }
            ],
            'main': [
                {
                    id: 'kpi-summary',
                    type: 'kpi-grid',
                    props: {
                        items: [
                            { label: 'Personal Activo', value: '42', change: '+3 este mes', trend: 'up' },
                            { label: 'Turno Actual', value: '18 camareros', change: '100% cobertura', trend: 'neutral' },
                            { label: 'Alertas Fichaje', value: '2', change: 'Faltan salidas', trend: 'down' },
                        ]
                    }
                },
                { id: 'm-table', type: 'data-table', props: { density: 'high', columns: ['Nombre', 'Puesto', 'Estado', 'Horas Semanal'], title: 'Plantilla de Personal' } }
            ]
        }
    },
    {
        id: 'prop-b-lienzo',
        name: 'Lienzo Enfocado',
        description: 'Baja densidad, alta legibilidad. Foco absoluto.',
        layout: 'focused-canvas',
        regions: {
            'header': [
                { id: 'hd-title-b', type: 'page-header', props: { title: 'Equipo & Talento', description: 'Gestiona los perfiles, disponibilidad y condiciones laborales del equipo.' } }
            ],
            'main': [
                { id: 'm-list', type: 'data-table', props: { density: 'low', format: 'list', title: 'Directorio Ejecutivo' } }
            ]
        }
    },
    {
        id: 'prop-c-bimodal',
        name: 'Arquitectura Espacial',
        description: 'Bloques modulares flotantes. Cabecera monumental.',
        layout: 'bimodal',
        regions: {
            'header': [
                { id: 'hd-monumental', type: 'page-header', props: { title: 'Operaciones Marbella', isMonumental: true, kpis: [{ label: 'Personal Activo', value: '42' }, { label: 'Ausencias Hoy', value: '3', alert: true }, { label: 'Horas Extra Semanales', value: '14.5h' }] } }
            ],
            'sidebar': [
                { id: 'sb-nav-page', type: 'sidebar-nav', props: { variant: 'page-menu' } }
            ],
            'main': [
                { id: 'm-filters', type: 'filter-bar', props: { boxed: true, placeholder: 'Filtrar directorio activo...' } },
                { id: 'm-table-boxed', type: 'data-table', props: { boxed: true, title: 'Directorio Activo de Empleados' } }
            ]
        }
    }
];

export const useStudioStore = create<StudioState>()(
    persist(
        (set, get) => ({
            variants: INITIAL_VARIANTS,
            activeVariantId: INITIAL_VARIANTS[0].id,
            selectedBlockId: 'hd-title',
            hoveredBlockId: null,
            viewMode: 'edit',
            viewportPreset: 'desktop',
            zoom: 100,

            // Multilevel Progressive Zoom State
            currentLevel: 1, // Starts at Level 1: INTENCIÓN
            tokens: DEFAULT_MARBELLA_TOKENS,

            // Design Academy State
            activeStudioTab: 'canvas',
            selectedBenchmarkId: DESIGN_BENCHMARKS[0].id,
            comparatorLeftId: DESIGN_BENCHMARKS[0].id,
            comparatorRightId: DESIGN_BENCHMARKS[1].id,

            // AI Copilot State
            isCopilotOpen: false,
            isNewSurfaceModalOpen: false,
            copilotMessages: [
                {
                    id: 'msg-welcome',
                    role: 'assistant',
                    text: '¡Hola! Soy tu Copiloto Creativo de Marbella OS. ¿Qué intención deseas explorar o diseñar hoy?',
                    timestamp: 'Ahora'
                }
            ],
            isGeneratingAI: false,

            // Multilevel Level Mutators
            setCurrentLevel: (level: DesignLevel) => set({ currentLevel: level }),
            zoomInLevel: () => set((st) => ({ currentLevel: Math.min(5, st.currentLevel + 1) as DesignLevel })),
            zoomOutLevel: () => set((st) => ({ currentLevel: Math.max(1, st.currentLevel - 1) as DesignLevel })),

            updateSystemToken: (key, value) => set((st) => ({
                tokens: { ...st.tokens, [key]: value }
            })),

            addIntentZone: (category: IntentCategory, targetRegion = 'main') => set((state) => {
                if (!state.activeVariantId) return state;
                const timestamp = Date.now();
                const newBlocks: MarbellaBlock[] = [];

                if (category === 'identidad') {
                    newBlocks.push({
                        id: `intent-hd-${timestamp}`,
                        type: 'page-header',
                        props: { title: 'Zona de Identidad & Contexto', description: 'Describe la entidad principal y el contexto operativo.' }
                    });
                } else if (category === 'datos') {
                    newBlocks.push({
                        id: `intent-[#01]-tbl-${timestamp}`,
                        type: 'data-table',
                        props: { title: 'Zona de Exposición de Datos', density: 'high', boxed: true }
                    });
                } else if (category === 'control') {
                    newBlocks.push({
                        id: `intent-flt-${timestamp}`,
                        type: 'filter-bar',
                        props: { showSearch: true, showNew: true, placeholder: 'Zona de Control: Buscar o acotar...' }
                    });
                } else if (category === 'resumen') {
                    newBlocks.push({
                        id: `intent-kpi-${timestamp}`,
                        type: 'kpi-grid',
                        props: { items: [{ label: 'Indicador 1', value: '100' }, { label: 'Indicador 2', value: '98%' }] }
                    });
                } else if (category === 'navegacion') {
                    newBlocks.push({
                        id: `intent-nav-${timestamp}`,
                        type: 'sidebar-nav',
                        props: { variant: 'page-menu' }
                    });
                } else if (category === 'alerta' || category === 'estado') {
                    newBlocks.push({
                        id: `intent-callout-${timestamp}`,
                        type: 'callout-banner',
                        props: { title: 'Zona de Alerta & Estado', message: 'Indicación semántica destacada en pantalla.' }
                    });
                } else {
                    newBlocks.push({
                        id: `intent-[#01]-card-${timestamp}`,
                        type: 'container-block',
                        props: { title: `Zona de ${category.toUpperCase()}` }
                    });
                }

                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const currentReg = v.regions[targetRegion] || [];
                        return {
                            ...v,
                            regions: {
                                ...v.regions,
                                [targetRegion]: [...currentReg, ...newBlocks]
                            }
                        };
                    }),
                    selectedBlockId: newBlocks[0].id,
                    currentLevel: 2 // Automatically zoom to Level 2 (Composición)
                };
            }),

            // Copilot Mutators
            toggleCopilotPanel: (open) => set((state) => ({
                isCopilotOpen: typeof open === 'boolean' ? open : !state.isCopilotOpen
            })),

            openNewSurfaceModal: () => set({ isNewSurfaceModalOpen: true }),
            closeNewSurfaceModal: () => set({ isNewSurfaceModalOpen: false }),

            generateAIProposals: (prompt: string, surfaceType = 'pantalla', count = 3) => {
                set({ isGeneratingAI: true });
                const currentVariants = get().variants;
                
                const newVariants = generateCopilotVariants(
                    { prompt, surfaceType: surfaceType as SurfaceType, variantCount: count },
                    currentVariants
                );

                const newMsg = {
                    id: `msg-${Date.now()}`,
                    role: 'assistant' as const,
                    text: `He generado ${newVariants.length} propuestas editables para: "${prompt}". Han sido creadas en tu lienzo respetando todos los tokens de Marbella OS.`,
                    generatedVariantIds: newVariants.map(v => v.id),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                set((state) => ({
                    variants: [...state.variants, ...newVariants],
                    activeVariantId: newVariants[0].id,
                    activeStudioTab: 'canvas',
                    currentLevel: 1, // Starts at Level 1
                    selectedBlockId: newVariants[0].regions.header[0]?.id || null,
                    isGeneratingAI: false,
                    isNewSurfaceModalOpen: false,
                    copilotMessages: [...state.copilotMessages, newMsg]
                }));
            },

            refineAIVariant: (prompt: string) => {
                set({ isGeneratingAI: true });
                const state = get();
                const activeVarId = state.activeVariantId;

                const newVariants = generateCopilotVariants(
                    { prompt, surfaceType: 'pantalla', variantCount: 1, baseVariantId: activeVarId || undefined },
                    state.variants
                );

                const userMsg = {
                    id: `msg-u-${Date.now()}`,
                    role: 'user' as const,
                    text: prompt,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                const assistantMsg = {
                    id: `msg-a-${Date.now()}`,
                    role: 'assistant' as const,
                    text: `He creado una nueva variante aplicando tu instrucción: "${prompt}". Puedes compararla o modificarla libremente.`,
                    generatedVariantIds: newVariants.map(v => v.id),
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                };

                set((st) => ({
                    variants: [...st.variants, ...newVariants],
                    activeVariantId: newVariants[0].id,
                    selectedBlockId: newVariants[0].regions.header[0]?.id || null,
                    isGeneratingAI: false,
                    copilotMessages: [...st.copilotMessages, userMsg, assistantMsg]
                }));
            },

            setActiveStudioTab: (tab: StudioTab) => set({ activeStudioTab: tab }),
            setSelectedBenchmarkId: (id: string) => set({ selectedBenchmarkId: id }),
            setComparatorIds: (leftId: string, rightId: string) => set({ comparatorLeftId: leftId, comparatorRightId: rightId }),

            applyBenchmarkToMarbella: (benchmarkId: string) => set((state) => {
                const benchmark = DESIGN_BENCHMARKS.find(b => b.id === benchmarkId);
                if (!benchmark) return state;

                const newVariantId = `marbella-by-${benchmark.product.toLowerCase()}-${Date.now().toString(36)}`;
                const newVariant: MarbellaVariant = {
                    id: newVariantId,
                    name: `Filosofía ${benchmark.product}`,
                    description: benchmark.marbellaTranslation.philosophyTitle,
                    layout: benchmark.marbellaTranslation.suggestedLayout,
                    regions: {
                        header: [
                            {
                                id: `hd-${Date.now()}`,
                                type: 'page-header',
                                props: {
                                    title: `Marbella × ${benchmark.product}`,
                                    description: `Variante generada aplicando los principios de ${benchmark.product} (${benchmark.tagline})`,
                                    isMonumental: benchmark.marbellaTranslation.suggestedLayout === 'bimodal'
                                }
                            }
                        ],
                        main: [
                            {
                                id: `flt-${Date.now()}`,
                                type: 'filter-bar',
                                props: { boxed: true, placeholder: `Buscar con ritmo visual ${benchmark.product}...` }
                            },
                            {
                                id: `tbl-${Date.now()}`,
                                type: 'data-table',
                                props: {
                                    title: 'Plantilla de Empleados Marbella OS',
                                    density: benchmark.defaultControls.density === 'compact' ? 'high' : 'standard',
                                    boxed: true
                                }
                            }
                        ],
                        sidebar: [
                            { id: `sb-${Date.now()}`, type: 'sidebar-nav', props: { variant: 'app-menu' } }
                        ]
                    }
                };

                return {
                    variants: [...state.variants, newVariant],
                    activeVariantId: newVariantId,
                    activeStudioTab: 'canvas',
                    currentLevel: 1,
                    selectedBlockId: newVariant.regions.header[0].id
                };
            }),

            // Variant actions
            setActiveVariant: (id) => set({ activeVariantId: id, selectedBlockId: null }),
            
            saveVariant: (variant) => set((state) => {
                const exists = state.variants.some(v => v.id === variant.id);
                if (exists) {
                    return { variants: state.variants.map(v => v.id === variant.id ? variant : v) };
                }
                return { variants: [...state.variants, variant] };
            }),

            addVariant: (name, layout) => set((state) => {
                const newId = `var-${Date.now().toString(36)}`;
                const newVariant: MarbellaVariant = {
                    id: newId,
                    name: name || 'Nueva Variante',
                    description: 'Variante creada desde la declaración de intenciones.',
                    layout: layout || 'control-panel',
                    regions: {
                        header: [
                            { id: `hd-${Date.now()}`, type: 'page-header', props: { title: name || 'Nueva Sección', description: 'Declaración de Intención inicial.' } }
                        ],
                        main: [],
                        sidebar: []
                    }
                };
                return {
                    variants: [...state.variants, newVariant],
                    activeVariantId: newId,
                    currentLevel: 1, // Starts at Level 1
                    selectedBlockId: newVariant.regions.header[0].id
                };
            }),

            deleteVariant: (id) => set((state) => {
                if (state.variants.length <= 1) return state;
                const nextVariants = state.variants.filter(v => v.id !== id);
                const nextActiveId = state.activeVariantId === id ? nextVariants[0].id : state.activeVariantId;
                return {
                    variants: nextVariants,
                    activeVariantId: nextActiveId,
                    selectedBlockId: null
                };
            }),

            // Interactive state
            selectBlock: (id) => set({ selectedBlockId: id }),
            setHoveredBlock: (id) => set({ hoveredBlockId: id }),
            setViewMode: (mode) => set({ viewMode: mode }),
            setViewportPreset: (preset) => set({ viewportPreset: preset }),
            setZoom: (zoom) => set({ zoom }),

            // Property updates
            updateBlockProps: (blockId, newProps) => set((state) => {
                if (!state.activeVariantId) return state;
                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        const newRegions: Record<string, MarbellaBlock[]> = {};
                        Object.keys(v.regions).forEach(regKey => {
                            newRegions[regKey] = v.regions[regKey].map(blk => {
                                if (blk.id === blockId) {
                                    return { ...blk, props: { ...blk.props, ...newProps } };
                                }
                                return blk;
                            });
                        });
                        return { ...v, regions: newRegions };
                    })
                };
            }),

            addBlockToRegion: (regionId, type, targetIndex) => set((state) => {
                if (!state.activeVariantId) return state;
                const newId = `blk-${type}-${Date.now().toString(36)}`;
                
                let defaultProps: Record<string, any> = {};
                if (type === 'page-header') {
                    defaultProps = { title: 'Nuevo Encabezado', description: 'Escribe una descripción corta aquí.' };
                } else if (type === 'data-table') {
                    defaultProps = { title: 'Nueva Tabla de Datos', density: 'high', columns: ['Columna 1', 'Columna 2', 'Estado'] };
                } else if (type === 'filter-bar') {
                    defaultProps = { showSearch: true, showNew: true, placeholder: 'Buscar...' };
                } else if (type === 'sidebar-nav') {
                    defaultProps = { variant: 'app-menu' };
                } else if (type === 'kpi-grid') {
                    defaultProps = { items: [{ label: 'Métrica 1', value: '100' }, { label: 'Métrica 2', value: '85%' }] };
                } else if (type === 'container-block') {
                    defaultProps = { title: 'Tarjeta Contenedora', padding: 'normal', bgStyle: 'white' };
                } else if (type === 'callout-banner') {
                    defaultProps = { title: 'Aviso Importante', message: 'Este es un mensaje explicativo destacado en pantalla.', variant: 'info' };
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
                        return { ...v, regions: newRegions };
                    })
                };
            }),

            duplicateBlock: (blockId) => set((state) => {
                if (!state.activeVariantId) return state;
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
                                const dupId = `${blk.type}-${Date.now().toString(36)}`;
                                duplicatedId = dupId;
                                result.push({
                                    ...JSON.parse(JSON.stringify(blk)),
                                    id: dupId
                                });
                            }
                        });
                        newRegions[regKey] = result;
                    });
                    return { ...v, regions: newRegions };
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
                        return { ...v, regions: newRegions };
                    })
                };
            }),

            updateRegionInActiveVariant: (regionId, blocks) => set((state) => {
                if (!state.activeVariantId) return state;
                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        return {
                            ...v,
                            regions: {
                                ...v.regions,
                                [regionId]: blocks
                            }
                        };
                    })
                };
            }),

            updateVariantLayout: (layout) => set((state) => {
                if (!state.activeVariantId) return state;
                return {
                    variants: state.variants.map(v => {
                        if (v.id !== state.activeVariantId) return v;
                        return { ...v, layout };
                    })
                };
            }),

            resetToDefaults: () => set({
                variants: INITIAL_VARIANTS,
                activeVariantId: INITIAL_VARIANTS[0].id,
                selectedBlockId: INITIAL_VARIANTS[0].regions.header[0].id,
                viewMode: 'edit',
                activeStudioTab: 'canvas',
                currentLevel: 1,
                tokens: DEFAULT_MARBELLA_TOKENS,
                isCopilotOpen: false,
                isNewSurfaceModalOpen: false
            })
        }),
        {
            name: 'marbella-studio-storage',
        }
    )
);
