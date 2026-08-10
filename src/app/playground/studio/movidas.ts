import type { Movida, MovidaId, Intensidad, Madurez } from './types.ts';

// ============================================================
// EL VOCABULARIO ÚNICO — movidas de diseño
// Cada movida tiene: nombre, descripción, ejemplo, contraejemplo,
// interacciones, madurez y referencias que la originaron.
// ============================================================

export const INTENSIDAD_FACTOR: Record<Intensidad, number> = {
    nada: 0,
    sutil: 0.5,
    moderado: 1,
    fuerte: 1.6,
};

export const INTENSIDADES: Intensidad[] = ['nada', 'sutil', 'moderado', 'fuerte'];

export const MOVIDAS_CATALOGO: Movida[] = [
    {
        id: 'aire',
        nombre: 'Aire / Respiración',
        descripcion: 'Cantidad de espacio en blanco entre superficies y bloques.',
        ejemplo: 'Las tarjetas se separan y el contenido respira.',
        contraejemplo: 'Todo pegado, la pantalla se siente como un almacén.',
        interacciones: ['densidad', 'superficies'],
        madurez: 'semilla',
        referenciasOrigen: ['apple', 'notion'],
    },
    {
        id: 'superficies',
        nombre: 'Cantidad de superficies',
        descripcion: 'Número y peso de las tarjetas/superficies enmarcadas.',
        ejemplo: 'Menos cajas: el contenido se apoya en el espacio y la tipografía.',
        contraejemplo: 'Cada dato vive en su propia tarjeta y la pantalla grita.',
        interacciones: ['aire', 'profundidad'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'stripe'],
    },
    {
        id: 'densidad',
        nombre: 'Densidad',
        descripcion: 'Cuánta información cabe por unidad de espacio vertical.',
        ejemplo: 'Filas compactas sin perder claridad.',
        contraejemplo: 'Filas enormes que obligan a hacer scroll para nada.',
        interacciones: ['aire', 'tratamiento_tablas'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'vercel'],
    },
    {
        id: 'profundidad',
        nombre: 'Profundidad',
        descripcion: 'Elevación: sombras, capas y jerarquía de profundidad.',
        ejemplo: 'Superficies planas; la jerarquía no depende de sombras.',
        contraejemplo: 'Sombras por todas partes: nada parece estar quieto.',
        interacciones: ['superficies', 'contraste'],
        madurez: 'semilla',
        referenciasOrigen: ['notion', 'linear'],
    },
    {
        id: 'contraste',
        nombre: 'Contraste',
        descripcion: 'Fuerza de contraste entre texto, fondo y elementos.',
        ejemplo: 'Negro sobre blanco, bordes nítidos, texto claro.',
        contraejemplo: 'Grises encadenados que todo lo vuelven difuso.',
        interacciones: ['presencia_marca', 'profundidad'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'stripe'],
    },
    {
        id: 'voz_tipografica',
        nombre: 'Voz tipográfica',
        descripcion: 'Carácter de la tipografía: compacta, normal o editorial.',
        ejemplo: 'Tipografía compacta y técnica, o editorial con jerarquía amplia.',
        contraejemplo: 'Tipografía sin voz: ni técnica ni cálida ni editorial.',
        interacciones: ['densidad', 'protagonismo_kpi'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'vercel'],
    },
    {
        id: 'ruido_navegacion',
        nombre: 'Ruido de navegación',
        descripcion: 'Cuánto compite la navegación con el contenido.',
        ejemplo: 'Navegación silenciosa y discreta: el contenido es el protagonista.',
        contraejemplo: 'Menús, submenús y pestañas compitiendo por la atención.',
        interacciones: ['protagonismo_kpi', 'aire'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'ios'],
    },
    {
        id: 'protagonismo_kpi',
        nombre: 'Protagonismo de KPIs',
        descripcion: 'Peso visual de las métricas principales de la pantalla.',
        ejemplo: 'La cifra principal domina; todo lo demás la acompaña.',
        contraejemplo: 'Métricas ahogadas entre mil elementos igual de importantes.',
        interacciones: ['voz_tipografica', 'ruido_navegacion'],
        madurez: 'semilla',
        referenciasOrigen: ['ios', 'shopify'],
    },
    {
        id: 'presencia_marca',
        nombre: 'Presencia de marca',
        descripcion: 'Cuánto aparece el color e identidad de Marbella.',
        ejemplo: 'La marca se usa con cirugía: donde define, no donde decora.',
        contraejemplo: 'Marca en cada esquina: pierde significado.',
        interacciones: ['contraste'],
        madurez: 'semilla',
        referenciasOrigen: ['shopify', 'stripe'],
    },
    {
        id: 'tratamiento_tablas',
        nombre: 'Tratamiento de tablas',
        descripcion: 'Cómo se presentan las tablas: enmarcadas, sin bordes o planas.',
        ejemplo: 'Tabla plana: filas limpias separadas por aire.',
        contraejemplo: 'Rejilla cerrada con bordes que envuelve cada celda.',
        interacciones: ['densidad', 'superficies'],
        madurez: 'semilla',
        referenciasOrigen: ['linear', 'stripe'],
    },
    {
        id: 'peso_botones',
        nombre: 'Peso de botones',
        descripcion: 'Cuánto protagonismo tienen los botones.',
        ejemplo: 'Botones silenciosos: la acción no grita por encima del contenido.',
        contraejemplo: 'Botonera pesada que compite con lo que tiene al lado.',
        interacciones: ['contraste', 'ruido_navegacion'],
        madurez: 'semilla',
        referenciasOrigen: ['stripe', 'notion'],
    },
];

export const MOVIDA_BY_ID: Record<MovidaId, Movida> = Object.fromEntries(
    MOVIDAS_CATALOGO.map(m => [m.id, m])
) as Record<MovidaId, Movida>;

export function madurezMovida(movidaId: MovidaId): Madurez {
    return MOVIDA_BY_ID[movidaId].madurez;
}
