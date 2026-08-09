import { DesignBenchmark } from './types';

export const DESIGN_BENCHMARKS: DesignBenchmark[] = [
    {
        id: 'linear-dense-table',
        product: 'Linear',
        category: 'Tablas',
        title: 'Tabla de Alta Densidad y Foco Teclado',
        tagline: 'Jerarquía tipográfica sutil, atenuación de bordes y micro-indicadores de estado.',
        overview: 'Linear reduce la fricción visual eliminando divisiones pesadas y usando variaciones sutiles de peso tipográfico. Toda la interfaz invita a la velocidad de teclado.',
        brandColor: '#5E6AD2',
        principles: [
            {
                title: 'Atenuación de Contraste Secundario',
                description: 'Los identificadores y metadatos no compiten con el título del ítem; usan tonos neutrosfríos (zinc-400/500) para enfocar el ojo inmediatamente en lo importante.',
                category: 'contrastStrategy',
                impact: 'Transformadora'
            },
            {
                title: 'Ritmo Vertical Compacto',
                description: 'Filas de 36px-40px de altura con padding horizontal generoso. Permite visualizar 3x más información sin sensación de aglomeración.',
                category: 'spacingGrid',
                impact: 'Alta'
            },
            {
                title: 'Indicadores Semánticos mediante Iconos Círculo',
                description: 'En lugar de etiquetas cuadradas pesadas con texto, usa pequeños badges circulares (En progreso, Bloqueado, Hecho) que transmiten el estado de un vistazo.',
                category: 'microInteractions',
                impact: 'Alta'
            }
        ],
        marbellaTranslation: {
            philosophyTitle: 'Filosofía Linear en Marbella: Densidad Pro-Tool en Gestión de Personal',
            keyAdjustments: [
                'Filas compactas de 38px en listas de fichajes y cuadrantes.',
                'Sustituir badges voluminosos por micro-indicadores semánticos de estado de turno.',
                'Tipografía de código para identificadores de empleado o contrato sin saturar la pantalla.'
            ],
            suggestedLayout: 'control-panel',
            tokenMappings: {
                'color.superficie': 'Blanco puro',
                'color.borde': 'Gris neutro ultra fino (zinc-100)',
                'tactil.minimo': '48px accesibles mediante hitboxes invisibles'
            }
        },
        defaultControls: {
            density: 'compact',
            contrast: 'low',
            hierarchy: 'subtle',
            groupingStyle: 'bordered'
        },
        patternType: 'linear-table'
    },
    {
        id: 'stripe-financial-dashboard',
        product: 'Stripe',
        category: 'KPIs',
        title: 'Dashboard de Métricas & Calma Financiera',
        tagline: 'Superficies hundidas, cifras protagonistas de alto impacto y agrupadotes limpios.',
        overview: 'Stripe logra que datos de facturación complejos transmitan seguridad y calma mediante un balance perfecto entre tarjetas blancas y fondos hundidos.',
        brandColor: '#635BFF',
        principles: [
            {
                title: 'Tipografía de Cifra Protagonista',
                description: 'Las métricas clave usan números de gran tamaño (30px-36px, peso 800) combinados con etiquetas secundarias en gris suave.',
                category: 'focalPoint',
                impact: 'Transformadora'
            },
            {
                title: 'Superficie Hundida vs Superficie Flotante',
                description: 'El fondo gris neutro (#FAFAFA) recibe tarjetas blancas de radio pronunciado (16px) con sombras casi imperceptibles.',
                category: 'contrastStrategy',
                impact: 'Alta'
            },
            {
                title: 'Aislamiento de Alertas',
                description: 'Los avisos de atención usan fondos de tono suave en lugar de rojos/amarillos chillones, evitando la fatiga visual del usuario.',
                category: 'cognitiveLoad',
                impact: 'Transformadora'
            }
        ],
        marbellaTranslation: {
            philosophyTitle: 'Filosofía Stripe en Marbella: Resumen de Coste Laboral & Fichajes',
            keyAdjustments: [
                'Cifras de horas totales y coste laboral presentadas en tarjetas monumentales limpias.',
                'Fondo de aplicación en gris neutro con tarjetas en blanco puro.',
                'Indicadores de descuadre en tono aviso suave (amber-500) sin alertas estresantes.'
            ],
            suggestedLayout: 'bimodal',
            tokenMappings: {
                'color.superficie': '#FFFFFF con sombra elevación superficie',
                'color.superficie.hundida': '#FAFAFA',
                'radio.superficie': '16px'
            }
        },
        defaultControls: {
            density: 'standard',
            contrast: 'balanced',
            hierarchy: 'emphasized',
            groupingStyle: 'cards'
        },
        patternType: 'stripe-dashboard'
    },
    {
        id: 'vercel-clean-header',
        product: 'Vercel',
        category: 'Cabeceras',
        title: 'Cabecera Minimalista & Espacio Negativo',
        tagline: 'Separadores de 1px en gris frío, tipografía monocroma y navegación por pestañas planas.',
        overview: 'Vercel demuestra cómo un producto hiper-técnico puede sentirse extremadamente elegante eliminando todo ornamento y confiando en el espacio negativo.',
        brandColor: '#000000',
        principles: [
            {
                title: 'Línea de 1px como Frontera visual',
                description: 'En lugar de sombras o bloques flotantes, la cabecera se delimita con un borde inferior de 1px que se funde con la cuadrícula de la página.',
                category: 'spacingGrid',
                impact: 'Alta'
            },
            {
                title: 'Pestañas de Navegación integradas en borde',
                description: 'Las pestañas activas no usan botones de color, sino un indicador de borde inferior sutil con cambio de tono en el texto.',
                category: 'focalPoint',
                impact: 'Alta'
            },
            {
                title: 'Reducción de Carga Cognitiva por Monocromo',
                description: 'El 95% de la interfaz es negro, blanco y escala de grises. El color queda reservado exclusivamente para el estado de despliegue.',
                category: 'cognitiveLoad',
                impact: 'Transformadora'
            }
        ],
        marbellaTranslation: {
            philosophyTitle: 'Filosofía Vercel en Marbella: Cabecera Operativa de Alta Concentración',
            keyAdjustments: [
                'Cabecera superior fija con navegación plana de 56px de alto.',
                'Línea de separación sutil sin sombras pesadas.',
                'Acciones secundarias en botones planos sin fondo.'
            ],
            suggestedLayout: 'focused-canvas',
            tokenMappings: {
                'estructura.cabecera': '56px',
                'color.borde': '#E4E4E7',
                'tipo.familia': 'Inter'
            }
        },
        defaultControls: {
            density: 'spacious',
            contrast: 'high',
            hierarchy: 'standard',
            groupingStyle: 'seamless'
        },
        patternType: 'vercel-header'
    },
    {
        id: 'apple-[#01]-canvas',
        product: 'Apple',
        category: 'Dashboards',
        title: 'Espacialidad & Jerarquía Monumental',
        tagline: 'Tipografía de gran formato, esquinas muy redondeadas y espacios de respiración.',
        overview: 'Apple destaca por hacer que la tecnología parezca física y humana mediante amplios márgenes, esquinas fluidas y jerarquía tipográfica imponente.',
        brandColor: '#0071E3',
        principles: [
            {
                title: 'Títulos Monumentales',
                description: 'Uso de tipografía ligera pero de gran tamaño (36px+) que establece inmediatamente la entidad de la pantalla.',
                category: 'focalPoint',
                impact: 'Transformadora'
            },
            {
                title: 'Radio Continuo Amplio',
                description: 'Esquinas de 24px en contenedores principales que crean una sensación táctil y orgánica.',
                category: 'spacingGrid',
                impact: 'Alta'
            }
        ],
        marbellaTranslation: {
            philosophyTitle: 'Filosofía Apple en Marbella: Pantalla Principal de Bienvenida',
            keyAdjustments: [
                'Títulos monumentales en inicio de turno.',
                'Radio amplio de 24px en tarjetas destacadas.'
            ],
            suggestedLayout: 'bimodal',
            tokenMappings: {
                'radio.amplio': '24px',
                'color.marca': '#36606F'
            }
        },
        defaultControls: {
            density: 'spacious',
            contrast: 'balanced',
            hierarchy: 'emphasized',
            groupingStyle: 'cards'
        },
        patternType: 'apple-hero'
    },
    {
        id: 'notion-database-cards',
        product: 'Notion',
        category: 'Navegación',
        title: 'Modularidad & Tipografía Limpia',
        tagline: 'Contenedores adaptables, iconos funcionales y controles flotantes sin fricción.',
        overview: 'Notion permite estructurar información con máxima flexibilidad tipográfica y orden visual.',
        brandColor: '#000000',
        principles: [
            {
                title: 'Bloques Modulares Flexibles',
                description: 'Cada elemento visual tiene límites definidos y se agrupa con coherencia espacial.',
                category: 'cognitiveLoad',
                impact: 'Alta'
            }
        ],
        marbellaTranslation: {
            philosophyTitle: 'Filosofía Notion en Marbella: Fichas de Empleado & Contratos',
            keyAdjustments: [
                'Fichas modulares para información de plantilla.',
                'Organización en tarjetas limpias con iconos funcionales.'
            ],
            suggestedLayout: 'focused-canvas',
            tokenMappings: {
                'color.superficie': '#FFFFFF',
                'radio.control': '12px'
            }
        },
        defaultControls: {
            density: 'standard',
            contrast: 'low',
            hierarchy: 'standard',
            groupingStyle: 'bordered'
        },
        patternType: 'notion-database'
    }
];
