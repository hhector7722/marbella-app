import { Referencia } from './types';

// ============================================================
// REFERENCIAS EXTERNAS — sondas, nunca temas.
// Cada referencia declara las movidas que se observan en ella
// (con intensidad y nota), sus contraejemplos y las preguntas
// que sugiere sobre Marbella.
// ============================================================

export const REFERENCIAS: Referencia[] = [
    {
        id: 'linear',
        nombre: 'Linear',
        dominio: 'Productividad técnica',
        descripcion: 'Interfaz de alta densidad con jerarquía plana y contraste nítido.',
        movidasObservadas: [
            { movidaId: 'superficies', intensidad: 'sutil', nota: 'Pocas tarjetas enmarcadas; el contenido fluye.' },
            { movidaId: 'contraste', intensidad: 'moderado', nota: 'Negro real sobre blanco, bordes afilados.' },
            { movidaId: 'ruido_navegacion', intensidad: 'fuerte', nota: 'Navegación discreta que cede al contenido.' },
            { movidaId: 'voz_tipografica', intensidad: 'moderado', nota: 'Tipografía compacta y técnica.' },
            { movidaId: 'profundidad', intensidad: 'nada', nota: 'Casi sin sombras; jerarquía por contraste y densidad.' },
            { movidaId: 'tratamiento_tablas', intensidad: 'fuerte', nota: 'Tablas planas, filas separadas por aire.' },
        ],
        contraejemplos: [
            'Filas alternas de color: rompe la limpieza plana.',
            'Sombras flotantes bajo cada elemento: destruye la planitud.',
        ],
        preguntas: [
            '¿Puede la tabla de Movimientos respirar sin bordes por celda?',
            '¿Sobrevive el KPI con contraste nítido y sin sombra?',
        ],
    },
    {
        id: 'apple',
        nombre: 'Apple',
        dominio: 'Jerarquía y refinamiento',
        descripcion: 'Aire generoso, superficies suaves y jerarquía por escala.',
        movidasObservadas: [
            { movidaId: 'aire', intensidad: 'fuerte', nota: 'Espacio en blanco que ordena sin bordes.' },
            { movidaId: 'superficies', intensidad: 'sutil', nota: 'Superficies amplias, no tarjetas apiladas.' },
            { movidaId: 'profundidad', intensidad: 'sutil', nota: 'Elevación justa, nada de sombras exageradas.' },
            { movidaId: 'protagonismo_kpi', intensidad: 'moderado', nota: 'La cifra principal manda por tamaño y peso.' },
            { movidaId: 'voz_tipografica', intensidad: 'sutil', nota: 'Tipografía equilibrada con jerarquía por peso.' },
        ],
        contraejemplos: [
            'Espacio de relleno sin orden: aire vacío, no respiración.',
            'Escala tipográfica sin proporción: títulos que gritan solos.',
        ],
        preguntas: [
            '¿History sobrevive con mucho más aire y menos tarjetas?',
            '¿El KPI puede dominar por escala en vez de por color?',
        ],
    },
    {
        id: 'stripe',
        nombre: 'Stripe',
        dominio: 'Claridad operativa',
        descripcion: 'Paneles claros, tablas limpias y acciones que no compiten.',
        movidasObservadas: [
            { movidaId: 'tratamiento_tablas', intensidad: 'fuerte', nota: 'Tablas planas con filas separadas por aire.' },
            { movidaId: 'contraste', intensidad: 'moderado', nota: 'Negro nítido sobre blanco, grises limitados.' },
            { movidaId: 'peso_botones', intensidad: 'fuerte', nota: 'Botones silenciosos; la acción no grita.' },
            { movidaId: 'superficies', intensidad: 'sutil', nota: 'Superficies planas, muy poca elevación.' },
        ],
        contraejemplos: [
            'Botones gigantes competiendo con la tabla: rompe la calma.',
            'Tarjetas apiladas con sombra doble en cada fila.',
        ],
        preguntas: [
            '¿Las acciones de Movimientos pueden ser más silenciosas?',
            '¿Una tabla plana ayuda a leer Ventas más rápido?',
        ],
    },
    {
        id: 'vercel',
        nombre: 'Vercel',
        dominio: 'Precisión técnica',
        descripcion: 'Densidad controlada, tipografía compacta y planitud.',
        movidasObservadas: [
            { movidaId: 'voz_tipografica', intensidad: 'moderado', nota: 'Tipografía compacta, espaciado ceñido.' },
            { movidaId: 'aire', intensidad: 'moderado', nota: 'Aire calculado: ni vacío ni apretado.' },
            { movidaId: 'profundidad', intensidad: 'nada', nota: 'Superficies completamente planas.' },
            { movidaId: 'densidad', intensidad: 'moderado', nota: 'Alta densidad sin perder lectura.' },
        ],
        contraejemplos: [
            'Aire al azar: espaciados inconsistentes entre secciones.',
            'Sombra sutil en todo: la planitud se pierde.',
        ],
        preguntas: [
            '¿Movimientos puede subir densidad sin perder claridad?',
            '¿Una voz tipográfica compacta ayuda a las cifras?',
        ],
    },
    {
        id: 'notion',
        nombre: 'Notion',
        dominio: 'Calma estructurada',
        descripcion: 'Superficies suaves, jerarquía silenciosa y mucho espacio.',
        movidasObservadas: [
            { movidaId: 'aire', intensidad: 'moderado', nota: 'El espacio estructura más que los bordes.' },
            { movidaId: 'profundidad', intensidad: 'nada', nota: 'Sin sombras; planitud total.' },
            { movidaId: 'superficies', intensidad: 'sutil', nota: 'Superficies discretas, casi ausentes.' },
            { movidaId: 'peso_botones', intensidad: 'fuerte', nota: 'Acciones muy silenciosas.' },
        ],
        contraejemplos: [
            'Todo plano sin jerarquía: el aire deja de ordenar.',
            'Botones invisibles: la acción se pierde del todo.',
        ],
        preguntas: [
            '¿Puede Marbella vivir casi sin superficies ni elevación?',
            '¿La navegación puede desaparecer casi por completo?',
        ],
    },
    {
        id: 'ios',
        nombre: 'iOS',
        dominio: 'Móvil primero',
        descripcion: 'Jerarquía móvil, superficies suaves y navegación de una mano.',
        movidasObservadas: [
            { movidaId: 'protagonismo_kpi', intensidad: 'fuerte', nota: 'La cifra principal es el héroe de la pantalla.' },
            { movidaId: 'superficies', intensidad: 'sutil', nota: 'Superficies suaves en lugar de tarjetas pesadas.' },
            { movidaId: 'ruido_navegacion', intensidad: 'sutil', nota: 'Navegación inferior clara y discreta.' },
        ],
        contraejemplos: [
            'Protagonismo a costa del contexto: el KPI sin datos de apoyo.',
            'Navegación que ocupa un tercio de la pantalla.',
        ],
        preguntas: [
            '¿Qué cifra debería dominar en la pantalla principal en móvil?',
            '¿Puede la navegación inferior ser más discreta?',
        ],
    },
    {
        id: 'shopify',
        nombre: 'Shopify',
        dominio: 'Comercio operativo',
        descripcion: 'Métricas visibles y acciones claras en contexto comercial.',
        movidasObservadas: [
            { movidaId: 'protagonismo_kpi', intensidad: 'moderado', nota: 'Las métricas comerciales mandan.' },
            { movidaId: 'peso_botones', intensidad: 'moderado', nota: 'Botones visibles sin ser ruido.' },
            { movidaId: 'presencia_marca', intensidad: 'sutil', nota: 'La marca aparece donde define el estado.' },
        ],
        contraejemplos: [
            'Métricas sin contexto: cifras que no cuentan nada.',
            'Botón principal que compite con el listado.',
        ],
        preguntas: [
            '¿Qué métricas comerciales merecen protagonismo en Ventas?',
        ],
    },
];

export const REFERENCIA_BY_ID: Record<string, Referencia> = Object.fromEntries(
    REFERENCIAS.map(r => [r.id, r])
) as Record<string, Referencia>;
