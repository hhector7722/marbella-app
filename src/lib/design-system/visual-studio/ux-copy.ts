import type { CanonStatus, StudioElement, TokenOption } from './types.ts';

const HUMAN_TITLES: Record<string, string> = {
    button: 'Botón',
    field: 'Campo',
    search: 'Búsqueda',
    'quantity-stepper': 'Cantidad',
    modal: 'Modal',
    surface: 'Tarjeta / bloque',
    table: 'Tabla',
    'page-header': 'Cabecera de página',
    'block-header': 'Cabecera de tarjeta',
    'modal-header': 'Cabecera de modal',
    'table-header': 'Cabecera de tabla',
    'derived-modal-header': 'Cabecera de ventana interna',
    'petroleum-segmented': 'Selector de opciones',
    'radio-segmented': 'Selector de opciones',
    'timefilter-chrome': 'Filtro de tiempo',
    checkbox: 'Casilla',
    select: 'Lista desplegable',
    notice: 'Aviso',
    'empty-state': 'Estado vacío',
    'loading-spinner': 'Carga',
    'document-list-row': 'Fila de listado',
    pagescreen: 'Pantalla',
    calendar: 'Calendario',
    color: 'Colores',
    typography: 'Tipografía',
    spacing: 'Espaciado',
    radius: 'Radios',
    elevation: 'Sombras',
    'touch-target': 'Táctil',
    'focus-ring': 'Foco',
    'layout-alignment': 'Alineación',
    'header-app-navbar': 'Barra de la aplicación',
    'header-t1-sala-staff': 'Inicio de Sala y equipo',
    'header-t1-ventas': 'Inicio de Ventas',
    'header-bottom-sheet': 'Panel inferior',
    'header-kds': 'Cocina',
    'header-calendar': 'Calendario de cuadrante',
    'header-carta-publica': 'Carta para el cliente',
};

const HUMAN_SUMMARIES: Record<string, string> = {
    button: 'Las acciones que se pulsan en Marbella.',
    field: 'Campos de texto, números y listas.',
    search: 'Campo para buscar en un listado.',
    'quantity-stepper': 'Añadir o quitar unidades.',
    modal: 'Ventanas que se abren encima de una pantalla.',
    surface: 'La tarjeta o el bloque que envuelve un contenido.',
    table: 'Columnas, filas e importes.',
    'page-header': 'La franja de título de una pantalla.',
    'block-header': 'El título de una tarjeta dentro de una pantalla.',
    'modal-header': 'La franja de título de una ventana.',
    'table-header': 'Los nombres de las columnas.',
    'derived-modal-header': 'Las ventanas internas usan la misma cabecera que el modal.',
    'petroleum-segmented': 'Elegir una opción entre pocas.',
    'radio-segmented': 'Elegir una opción entre pocas.',
    'timefilter-chrome': 'Cambiar el periodo que se está viendo.',
    checkbox: 'Marcar o desmarcar una opción.',
    select: 'Elegir una opción de una lista.',
    notice: 'Un aviso que se queda en la pantalla hasta que se atiende.',
    'empty-state': 'Lo que se ve cuando todavía no hay datos.',
    'loading-spinner': 'La espera mientras llegan los datos.',
    'document-list-row': 'Una fila de un documento en un listado.',
    pagescreen: 'La plantilla de las pantallas de gestión.',
    calendar: 'Los días de un mes.',
    color: 'La paleta de Marbella. No se inventan colores.',
    typography: 'Tamaños de título, texto y cifra.',
    spacing: 'Los huecos entre unas piezas y otras.',
    radius: 'El redondeo de botones y tarjetas.',
    elevation: 'La sombra de la página y de las tarjetas.',
    'touch-target': 'Nada pulsable mide menos de 48 píxeles.',
    'focus-ring': 'El anillo que aparece al enfocar un control.',
    'layout-alignment': 'Si el contenido va a la izquierda, al centro o a los extremos.',
    'header-app-navbar': 'La barra superior de la aplicación. No es la cabecera de una pantalla.',
    'header-t1-sala-staff': 'Cabeceras propias de las pantallas de inicio de Sala y del equipo.',
    'header-t1-ventas': 'La cabecera de inicio de Ventas, con el día en el centro.',
    'header-bottom-sheet': 'El título del panel que sube desde abajo.',
    'header-kds': 'La cabecera de la pantalla de cocina.',
    'header-calendar': 'La cabecera del cuadrante, no la de una pantalla de gestión.',
    'header-carta-publica': 'La cabecera de la carta que ve el cliente.',
};

export type UxStatus = 'oficial' | 'propuesta' | 'sin-oficial' | 'hereda' | 'especial' | 'retirado';

export function uxStatusOf(element: StudioElement): UxStatus {
    if (element.status === 'CANON CERRADO') return 'oficial';
    if (element.status === 'BORRADOR / PROPUESTA') return 'propuesta';
    if (element.status === 'SIN CANON') return 'sin-oficial';
    if (element.status === 'HEREDADO' || element.inherits) return 'hereda';
    if (element.status === 'ESPECIALIZADO') return 'especial';
    return 'retirado';
}

export function uxStatusLabel(status: UxStatus): string {
    switch (status) {
        case 'oficial':
            return 'Oficial';
        case 'propuesta':
            return 'Propuesta';
        case 'sin-oficial':
            return 'Sin diseño oficial';
        case 'hereda':
            return 'Hereda';
        case 'especial':
            return 'De una pantalla';
        case 'retirado':
            return 'Retirado';
    }
}

export function uxStatusHint(status: UxStatus): string | null {
    switch (status) {
        case 'oficial':
            return 'Este diseño es obligatorio en toda Marbella.';
        case 'propuesta':
            return 'Todavía no es el diseño oficial.';
        case 'sin-oficial':
            return 'Existe en pantalla, pero aún no hay un diseño oficial.';
        case 'hereda':
            return 'Usa el mismo diseño que otra pieza. No se cambia por separado.';
        case 'especial':
            return 'Solo se usa en una pantalla concreta. No es el diseño general.';
        case 'retirado':
            return 'Ya no se usa como diseño de Marbella.';
    }
}

export function humanTitle(element: StudioElement | string): string {
    const id = typeof element === 'string' ? element : element.id;
    if (HUMAN_TITLES[id]) return HUMAN_TITLES[id];
    if (typeof element !== 'string') return element.label;
    return id;
}

export function humanSummary(element: StudioElement): string {
    return HUMAN_SUMMARIES[element.id] ?? element.summary;
}

export function humanWarning(element: StudioElement): string | null {
    if (!element.warning) return null;
    if (element.id === 'page-header') {
        return 'Este diseño también pinta las cabeceras de algunas pantallas de inicio. Cámbialo con cuidado.';
    }
    if (element.id === 'header-t1-sala-staff') {
        return 'Sala y el panel del equipo no usan la plantilla de pantalla de gestión. Su cabecera puede verse distinta.';
    }
    if (element.id === 'header-t1-ventas') {
        return 'Ventas no es un título con botón atrás: el día va al centro. No es la cabecera de página.';
    }
    return stripTechnicalJargon(element.warning);
}

const TYPE_ROLE: Record<string, string> = {
    'tipo.minimo': 'Apoyo',
    'tipo.apoyo': 'Apoyo',
    'tipo.cuerpo': 'Texto',
    'tipo.entrada': 'Texto',
    'tipo.subtitulo': 'Subtítulo',
    'tipo.titulo-pantalla': 'Título',
    'tipo.titulo': 'Título',
    'tipo.cifra': 'Cifra',
};

const ALIGN_X_LABEL: Record<string, string> = {
    left: 'Izquierda',
    center: 'Centro',
    edges: 'Extremos',
};

const ALIGN_Y_LABEL: Record<string, string> = {
    top: 'Arriba',
    center: 'Centro',
    bottom: 'Abajo',
};

const DENSITY_LABEL: Record<string, string> = {
    comfortable: 'Cómodo',
    compact: 'Compacto',
};

export function pxLabel(value: string): string | null {
    const match = value.trim().match(/^(\d+(?:\.\d+)?)px$/i);
    if (!match) return null;
    return `${match[1]} px`;
}

/** Etiqueta para controles. Sin IDs de token, sin CSS, sin hex. */
export function humanOptionLabel(option: TokenOption): string {
    if (ALIGN_X_LABEL[option.id]) return ALIGN_X_LABEL[option.id];
    if (ALIGN_Y_LABEL[option.id]) return ALIGN_Y_LABEL[option.id];
    if (DENSITY_LABEL[option.id]) return DENSITY_LABEL[option.id];
    if (TYPE_ROLE[option.id]) {
        const size = pxLabel(option.value);
        return size ? `${TYPE_ROLE[option.id]} · ${size}` : TYPE_ROLE[option.id];
    }
    const fromValue = pxLabel(option.value);
    if (fromValue) return fromValue;
    const fromLabel = option.label.split(' · ')[0]?.trim();
    if (fromLabel && !fromLabel.includes('.') && !fromLabel.startsWith('#')) return fromLabel;
    return option.label;
}

export function humanColorName(option: TokenOption): string {
    const name = option.label.split(' · ')[0]?.trim() ?? option.label;
    return name.startsWith('#') ? 'Color' : name;
}

export function stripTechnicalJargon(text: string): string {
    return text
        .replaceAll('CANON CERRADO', 'oficial')
        .replaceAll('SIN CANON', 'sin diseño oficial')
        .replaceAll('Proponer revisión', 'Proponer cambio')
        .replaceAll('Guardar como canon', 'Hacer oficial')
        .replace(/\bT[1-8]\b/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

export function humanGateReason(reason: string): string {
    return stripTechnicalJargon(reason)
        .replaceAll('como canon independiente', 'por separado')
        .replaceAll('canon universal', 'diseño oficial de toda Marbella')
        .replaceAll('no se cierra como canon desde el estudio', 'no se puede hacer oficial todavía')
        .replaceAll('no puede ser canon', 'no puede ser el diseño oficial')
        .replaceAll('Este elemento está en oficial.', 'Este diseño ya es oficial.')
        .replaceAll('Nuevo token requerido', 'Este valor aún no existe en el sistema')
        .replaceAll('No se crean tokens silenciosamente.', 'Hay que definirlo antes de hacerlo oficial.')
        .replaceAll('Un elemento deprecado no admite propuestas.', 'Esta pieza ya no admite cambios.');
}

export function humanConsumerName(file: string): string {
    const clean = file.replace(/^src\//, '').replace(/\.(tsx|ts|jsx|js)$/, '');
    const segs = clean.split('/');
    const dash = segs.indexOf('dashboard');
    if (dash >= 0) {
        const next = segs[dash + 1];
        if (next && next !== 'page' && next !== 'layout') {
            return titleFromSlug(next);
        }
    }
    const last = segs[segs.length - 1] ?? clean;
    if (last === 'page' && segs.length >= 2) return titleFromSlug(segs[segs.length - 2]!);
    return titleFromSlug(last.replace(/View$|Client$|Section$/, ''));
}

function titleFromSlug(slug: string): string {
    const spaced = slug.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
    return spaced.replace(/\b\w/g, (ch) => ch.toUpperCase()).trim();
}

export function humanInternalStatus(status: CanonStatus): string {
    return status;
}
