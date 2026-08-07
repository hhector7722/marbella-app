import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { StudioState, MarbellaVariant } from './types';

// Semillas iniciales basadas en las 3 propuestas que construimos
const INITIAL_VARIANTS: MarbellaVariant[] = [
    {
        id: 'prop-a-panel',
        name: 'Panel de Control',
        description: 'Alta densidad, pro-tool. Sidebar permanente.',
        layout: 'control-panel',
        regions: {
            'sidebar': [
                { id: 'sb-nav-1', type: 'sidebar-nav', props: {} }
            ],
            'header': [
                { id: 'hd-title', type: 'page-header', props: { title: 'Gestión de Equipo', showStats: true } },
                { id: 'hd-filters', type: 'filter-bar', props: { showSearch: true, showNew: true } }
            ],
            'main': [
                { id: 'm-table', type: 'data-table', props: { density: 'high', columns: ['Nombre', 'Rol', 'Estado', 'Horas'] } }
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
                { id: 'hd-title-b', type: 'page-header', props: { title: 'Equipo', description: 'Gestiona los perfiles, disponibilidad y condiciones laborales del equipo.' } }
            ],
            'main': [
                { id: 'm-list', type: 'data-table', props: { density: 'low', format: 'list' } }
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
                { id: 'hd-monumental', type: 'page-header', props: { title: 'Equipo', isMonumental: true, kpis: [{ label: 'Activos', value: 42 }, { label: 'Ausencias', value: 3, alert: true }] } }
            ],
            'sidebar': [
                { id: 'sb-nav-page', type: 'sidebar-nav', props: { variant: 'page-menu' } }
            ],
            'main': [
                { id: 'm-filters', type: 'filter-bar', props: { boxed: true } },
                { id: 'm-table-boxed', type: 'data-table', props: { boxed: true, title: 'Directorio Activo' } }
            ]
        }
    }
];

export const useStudioStore = create<StudioState>()(
    persist(
        (set) => ({
            variants: INITIAL_VARIANTS,
            activeVariantId: INITIAL_VARIANTS[0].id,
            
            setActiveVariant: (id) => set({ activeVariantId: id }),
            
            saveVariant: (variant) => set((state) => {
                const exists = state.variants.some(v => v.id === variant.id);
                if (exists) {
                    return { variants: state.variants.map(v => v.id === variant.id ? variant : v) };
                }
                return { variants: [...state.variants, variant] };
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
            })
        }),
        {
            name: 'marbella-studio-storage',
        }
    )
);
