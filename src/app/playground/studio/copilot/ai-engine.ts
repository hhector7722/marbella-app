import { MarbellaVariant, MarbellaBlock, SpatialCompositionFlow } from '../types';
import { CopilotGenerationRequest } from './types';

export function generateCopilotVariants(
    request: CopilotGenerationRequest,
    existingVariants: MarbellaVariant[]
): MarbellaVariant[] {
    const { prompt, surfaceType, variantCount, baseVariantId } = request;
    const lowerPrompt = prompt.toLowerCase();

    // If refining an existing variant
    const baseVariant = baseVariantId ? existingVariants.find(v => v.id === baseVariantId) : null;

    const resultVariants: MarbellaVariant[] = [];
    const timestamp = Date.now();

    const countToGenerate = Math.min(Math.max(1, variantCount || 1), 5);

    for (let i = 0; i < countToGenerate; i++) {
        const variantId = `ai-var-${timestamp}-${i + 1}`;
        const suffix = countToGenerate > 1 ? ` (Propuesta ${i + 1})` : '';
        
        let layout: SpatialCompositionFlow = 'fluid-stack';
        if (lowerPrompt.includes('apple') || lowerPrompt.includes('monumental') || lowerPrompt.includes('espacial')) {
            layout = 'hero-header';
        } else if (lowerPrompt.includes('limpio') || lowerPrompt.includes('foco') || lowerPrompt.includes('móvil') || lowerPrompt.includes('modal')) {
            layout = 'clean-canvas';
        } else if (baseVariant) {
            layout = baseVariant.layout;
        }

        const blocks: Record<string, MarbellaBlock[]> = {
            header: [],
            main: [],
            sidebar: []
        };

        // Determine surface block composition based on request & prompt
        if (baseVariant && lowerPrompt.includes('kpi')) {
            // Refinement: Elevate KPI prominence
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: baseVariant.name + ' • Foco KPI',
                        isMonumental: true,
                        kpis: [
                            { label: 'Rendimiento', value: '98.5%' },
                            { label: 'Incidencias', value: '0', alert: false },
                            { label: 'Tiempo Medio', value: '4.2 min' }
                        ]
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-kpi-${timestamp}-${i}`,
                    type: 'kpi-grid',
                    props: {
                        items: [
                            { label: 'Eficiencia Operativa', value: '94%', change: '+4.2%' },
                            { label: 'Cobertura de Turno', value: '100%', change: 'Óptimo' },
                            { label: 'Satisfacción', value: '4.9/5', change: 'Alta' }
                        ]
                    }
                },
                ...JSON.parse(JSON.stringify(baseVariant.regions.main || []))
            ];
            blocks.sidebar = JSON.parse(JSON.stringify(baseVariant.regions.sidebar || []));

        } else if (baseVariant && (lowerPrompt.includes('carga cognitiva') || lowerPrompt.includes('ruido') || lowerPrompt.includes('respiración'))) {
            // Refinement: Reduce cognitive load & space out
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: baseVariant.name + ' • Mínima Carga Cognitiva',
                        description: 'Interfaz simplificada para maximizar el foco y reducir la fatiga visual.'
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-tbl-${timestamp}-${i}`,
                    type: 'data-table',
                    props: {
                        title: 'Vista Limpia de Contenido',
                        density: 'low',
                        format: 'list',
                        boxed: true
                    }
                }
            ];
            blocks.sidebar = [];

        } else if (surfaceType === 'modal' || lowerPrompt.includes('modal') || lowerPrompt.includes('ticket') || lowerPrompt.includes('confirmacion')) {
            // Surface: Modal / Callout Details
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: i === 0 ? 'Detalle de Ticket #4029' : i === 1 ? 'Gestión de Incidencia' : 'Visor de Solicitud',
                        description: 'Superficie modal flotante enmarcada con tokens de elevación Marbella OS.'
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-[#01]-callout-${timestamp}-${i}`,
                    type: 'callout-banner',
                    props: {
                        title: 'Prioridad Alta • Solicitud Pendiente',
                        message: 'Revisión requerida por el responsable de sala antes del cierre de turno.'
                    }
                },
                {
                    id: `ai-[#01]-card-${timestamp}-${i}`,
                    type: 'container-block',
                    props: {
                        title: 'Información del Empleado',
                        padding: 'normal'
                    }
                }
            ];

        } else if (surfaceType === 'formulario' || lowerPrompt.includes('formulario') || lowerPrompt.includes('fichaje')) {
            // Surface: Clean Form
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: i === 0 ? 'Formulario de Fichaje' : i === 1 ? 'Registro de Personal' : 'Formulario de Ajuste',
                        description: 'Diseño de campos limpios con objetivos táctiles mínimos de 48px.'
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-flt-${timestamp}-${i}`,
                    type: 'filter-bar',
                    props: {
                        showSearch: true,
                        showNew: true,
                        placeholder: 'Nombre o código de empleado...'
                    }
                },
                {
                    id: `ai-card-${timestamp}-${i}`,
                    type: 'container-block',
                    props: {
                        title: 'Detalle de Horas & Turno'
                    }
                }
            ];

        } else if (lowerPrompt.includes('linear') || lowerPrompt.includes('compact') || lowerPrompt.includes('pro-tool')) {
            // Surface / Inspiration: Linear Compact
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: 'Gestión Pro-Tool' + suffix,
                        description: 'Alta densidad de información con contraste tipográfico sutil.'
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-flt-${timestamp}-${i}`,
                    type: 'filter-bar',
                    props: { showSearch: true, showNew: true, placeholder: 'Filtrar por etiqueta...' }
                },
                {
                    id: `ai-tbl-${timestamp}-${i}`,
                    type: 'data-table',
                    props: {
                        title: 'Directorio de Trabajo',
                        density: 'high',
                        boxed: true
                    }
                }
            ];
            blocks.sidebar = [
                { id: `ai-sb-${timestamp}-${i}`, type: 'sidebar-nav', props: { variant: 'page-menu' } }
            ];

        } else {
            // General / Default AI Proposal
            blocks.header = [
                {
                    id: `ai-hd-${timestamp}-${i}`,
                    type: 'page-header',
                    props: {
                        title: `Propuesta IA: ${surfaceType.toUpperCase()}` + suffix,
                        description: `Generada a partir de: "${prompt}" (respetando tokens de Marbella OS).`,
                        isMonumental: i === 1
                    }
                }
            ];
            blocks.main = [
                {
                    id: `ai-kpi-${timestamp}-${i}`,
                    type: 'kpi-grid',
                    props: {
                        items: [
                            { label: 'Cifra Principal', value: i === 0 ? '42' : '100%' },
                            { label: 'Estado', value: 'Óptimo' }
                        ]
                    }
                },
                {
                    id: `ai-tbl-${timestamp}-${i}`,
                    type: 'data-table',
                    props: {
                        title: 'Superficie de Datos Generada',
                        density: i === 2 ? 'high' : 'standard',
                        boxed: true
                    }
                }
            ];
            blocks.sidebar = [
                { id: `ai-sb-${timestamp}-${i}`, type: 'sidebar-nav', props: { variant: 'app-menu' } }
            ];
        }

        const timestampIso = new Date().toISOString();
        const newVariant: MarbellaVariant = {
            id: variantId,
            name: `Propuesta IA: ${surfaceType.toUpperCase()}${suffix}`,
            description: `Generada por IA Copiloto para: "${prompt}"`,
            layout,
            createdAt: timestampIso,
            updatedAt: timestampIso,
            regions: blocks
        };

        resultVariants.push(newVariant);
    }

    return resultVariants;
}
