/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StudioState, MarbellaVariant, MarbellaBlock, StudioTab } from './types';
import { DESIGN_BENCHMARKS } from './academy/data';

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
        (set) => ({
            variants: INITIAL_VARIANTS,
            activeVariantId: INITIAL_VARIANTS[0].id,
            selectedBlockId: 'hd-title',
            hoveredBlockId: null,
            viewMode: 'edit',
            viewportPreset: 'desktop',
            zoom: 100,

            // Design Academy State
            activeStudioTab: 'canvas',
            selectedBenchmarkId: DESIGN_BENCHMARKS[0].id,
            comparatorLeftId: DESIGN_BENCHMARKS[0].id,
            comparatorRightId: DESIGN_BENCHMARKS[1].id,

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
                    description: 'Variante creada desde el editor visual.',
                    layout: layout || 'control-panel',
                    regions: {
                        header: [
                            { id: `hd-${Date.now()}`, type: 'page-header', props: { title: name || 'Nueva Sección', description: 'Edita la descripción en el panel lateral derecho.' } }
                        ],
                        main: [
                            { id: `tbl-${Date.now()}`, type: 'data-table', props: { title: 'Tabla de Datos' } }
                        ],
                        sidebar: [
                            { id: `sb-${Date.now()}`, type: 'sidebar-nav', props: { variant: 'app-menu' } }
                        ]
                    }
                };
                return {
                    variants: [...state.variants, newVariant],
                    activeVariantId: newId,
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
                activeStudioTab: 'canvas'
            })
        }),
        {
            name: 'marbella-studio-storage',
        }
    )
);
