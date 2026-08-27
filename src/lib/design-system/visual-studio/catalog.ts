import {
    ALIGN_X_OPTIONS,
    ALIGN_Y_OPTIONS,
    DENSITY_OPTIONS,
    FOCUS_OPTIONS,
    COLOR_OPTIONS,
    HEIGHT_OPTIONS,
    MODAL_HEADER_HEIGHT_OPTIONS,
    PAGE_HEADER_HEIGHT_OPTIONS,
    RADIUS_OPTIONS,
    SPACE_OPTIONS,
    TYPE_SIZE_OPTIONS,
} from './allowed-values.ts';
import type { RegistryElement } from '../canon/schema.ts';
import type { PropertyDef, StudioElement } from './types.ts';

function prop(
    id: string,
    label: string,
    actualId: string,
    options: PropertyDef['options'],
    kind: PropertyDef['kind'] = 'token'
): PropertyDef {
    return { id, label, kind, actualId, options };
}

export const STUDIO_ELEMENTS: StudioElement[] = [
    {
        id: 'color',
        label: 'Color',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'Marca, semánticos, neutros, fondos y superficies. TOKENS.md manda. No se inventan hex.',
        blueprintNeedle: '| Color |',
        sourceFiles: ['src/lib/design-system/tokens.ts', 'src/app/globals.css'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'typography',
        label: 'Tipografía',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'Inter. Título de pantalla = PageScreen 18/900 uppercase. El resto de la escala está declarado.',
        blueprintNeedle: '| Tipografía |',
        sourceFiles: ['marbella-os/2-diseno/TOKENS.md'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'spacing',
        label: 'Espaciado',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'Escala de TOKENS.md. Sin valores intermedios. Lo no adoptado en CSS es deuda, no un segundo canon.',
        blueprintNeedle: '| Espaciado |',
        sourceFiles: ['src/app/globals.css'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'radius',
        label: 'Radios',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'espacio.2 (Button), radio.control, radio.superficie. Sin radios intermedios.',
        blueprintNeedle: '| Radios |',
        sourceFiles: ['src/app/globals.css', 'marbella-os/2-diseno/TOKENS.md'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'elevation',
        label: 'Sombras',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'elevacion.pagina y elevacion.superficie. Una elevación, no una paleta de sombras.',
        blueprintNeedle: '| Sombras |',
        sourceFiles: ['src/app/globals.css', 'marbella-os/2-diseno/TOKENS.md'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'touch-target',
        label: 'Táctil',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'Hit mínimo 48 px. 44 px solo escritorio secundario. 40 px no existe.',
        blueprintNeedle: '| Táctil |',
        sourceFiles: ['src/app/globals.css'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'focus-ring',
        label: 'Focus ring',
        group: 'fundamentos',
        status: 'CANON CERRADO',
        summary: 'El anillo de gestión usa color.marca. color.info no es el foco de control.',
        blueprintNeedle: '| Focus ring |',
        sourceFiles: ['src/app/globals.css'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'page-header',
        label: 'Cabecera de página',
        group: 'cabeceras',
        status: 'CANON CERRADO',
        summary:
            'Chrome de PageScreen (T2/T3/T4). Petróleo, título 18/900 uppercase, back a la izquierda, acciones a la derecha.',
        listSummary: 'Canon cerrado · PageScreen',
        blueprintNeedle: '| Cabecera de página |',
        sourceFiles: [
            'src/components/dashboard/DashboardDetailLayout.tsx',
            'src/app/globals.css',
        ],
        impactPatterns: ['PageScreen', 'DashboardDetailLayout'],
        applyKind: 'css-contract',
        warning:
            'Este contrato también comparte chrome con determinadas superficies T1. Cambiarlo puede afectar a esas superficies.',
        facts: [
            { label: 'Geometría', value: 'Altura = estructura.cabecera-modal (36 px). El contenido se escala (36/48) para caber sin recorte ni ellipsis. El toque de Button sigue siendo 48 px.' },
            { label: 'Padding', value: 'espacio.4 horizontal y vertical (canon). En md el CSS sube el horizontal; eso no está congelado.' },
            { label: 'Alineación horizontal', value: 'Extremos' },
            { label: 'Alineación vertical', value: 'Centro' },
            { label: 'Tipografía', value: '18 px · 900 · uppercase · tipo.titulo-pantalla' },
            { label: 'Acciones', value: 'rightSlot a la derecha. Back = Button secondary icon-only, hit 48 px.' },
            { label: 'Responsive', value: 'La alineación no cambia. Padding y título pueden crecer en md (implementación).' },
            { label: 'Impacto', value: 'PageScreen T2/T3/T4. El selector CSS también pinta Surface page > header (T1).' },
        ],
        properties: [
            prop('height', 'Altura', 'estructura.cabecera-modal', PAGE_HEADER_HEIGHT_OPTIONS, 'choice'),
            prop('align-x', 'Alineación', 'edges', ALIGN_X_OPTIONS, 'alignment-x'),
            prop('align-y', 'Vertical', 'center', ALIGN_Y_OPTIONS, 'alignment-y'),
            prop('px', 'Padding horizontal', 'espacio.4', SPACE_OPTIONS),
            prop('py', 'Padding vertical', 'espacio.4', SPACE_OPTIONS),
            prop('title-size', 'Título', 'tipo.titulo-pantalla', TYPE_SIZE_OPTIONS),
        ],
    },
    {
        id: 'block-header',
        label: 'Cabecera de bloque',
        group: 'cabeceras',
        status: 'SIN CANON',
        summary:
            'Existe implementación visual (Surface block > header), pero todavía no existe una decisión canónica. No es PageScreen.',
        listSummary: 'Sin canon · 3 anatomías observadas',
        blueprintNeedle: '| Cabecera de bloque |',
        sourceFiles: ['src/app/globals.css', 'src/components/ui/Surface.tsx'],
        impactPatterns: ['data-element="header"', "data-variant='block'", 'data-variant="block"'],
        applyKind: 'blueprint-only',
        promotePolicy: 'proposal-only',
        examples: [
            'RadarSala — título + meta; no extremos + acción.',
            'PedidosEventoClient — título + Exportar CSV; sí extremos.',
            'AdminDashboardView — cards de cambio de caja; título solo.',
        ],
        facts: [
            { label: 'Decisión', value: 'SIN CANON. El CSS de facto no es contrato.' },
            { label: 'Tipografía observada', value: '11 px / 900 / uppercase' },
            { label: 'Padding observado', value: 'espacio.3 / espacio.2' },
        ],
        properties: [
            prop('align-x', 'Alineación', 'edges', ALIGN_X_OPTIONS, 'alignment-x'),
            prop('title-size', 'Título', 'tipo.minimo', TYPE_SIZE_OPTIONS),
            prop('px', 'Padding horizontal', 'espacio.3', SPACE_OPTIONS),
            prop('py', 'Padding vertical', 'espacio.2', SPACE_OPTIONS),
        ],
    },
    {
        id: 'table-header',
        label: 'Cabecera de tabla',
        group: 'cabeceras',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Parte de la composición T8. No es una familia de cabecera independiente.',
        listSummary: '→ PATTERNS / T8',
        blueprintNeedle: '| Cabecera de tabla |',
        sourceFiles: [],
        impactPatterns: [],
        applyKind: 'unavailable',
        registry: false,
        redirectTo: 'table',
        properties: [],
    },
    {
        id: 'modal-header',
        label: 'Cabecera de modal',
        group: 'cabeceras',
        status: 'CANON CERRADO',
        summary: 'Alto 36 px. Chrome ≠ Button. Inset espacio.4. Una decisión pinta todos los modales.',
        listSummary: 'Canon cerrado · 36 px',
        blueprintNeedle: '| Cabecera de modal |',
        sourceFiles: ['src/components/ui/modal.tsx', 'src/lib/design-system/tokens.ts'],
        impactPatterns: ['<Modal', 'MODAL_COMPONENT_ID'],
        applyKind: 'css-contract',
        facts: [
            { label: 'Altura', value: '36 px · estructura.cabecera-modal. Se puede ensayar 48 px (táctil).' },
            { label: 'Padding', value: 'Inset horizontal espacio.4. El consumidor no lo desplaza.' },
            { label: 'Alineación', value: 'Título a la izquierda. Trailing + cerrar a la derecha.' },
            { label: 'Chrome', value: '≠ Button. Cuadrado al alto de la cabecera.' },
            { label: 'Título', value: 'Misma fila que el subtítulo. La cabecera no crece por encima de su altura.' },
        ],
        properties: [
            prop('height', 'Altura', 'estructura.cabecera-modal', MODAL_HEADER_HEIGHT_OPTIONS, 'choice'),
            prop(
                'inset',
                'Hueco horizontal',
                'espacio.4',
                SPACE_OPTIONS.filter((item) => Boolean(item.cssVar))
            ),
            prop('align-x', 'Alineación del título', 'left', ALIGN_X_OPTIONS, 'alignment-x'),
        ],
    },
    {
        id: 'derived-modal-header',
        label: 'Cabecera de modal derived',
        group: 'cabeceras',
        status: 'HEREDADO',
        inherits: 'modal-header',
        summary:
            'Los modales derived utilizan el mismo contrato visual de cabecera que el Modal base. ADR-0009 define la subordinación del panel, no una segunda anatomía de cabecera.',
        listSummary: 'Hereda Modal Header',
        blueprintNeedle: '| Cabecera de modal derived |',
        sourceFiles: ['src/components/ui/modal.tsx'],
        impactPatterns: ['layer="derived"', "layer={'derived'}"],
        applyKind: 'locked',
        facts: [
            { label: 'Capa', value: 'layer="derived"' },
            { label: 'Navegación', value: 'parentInstance. Un derived no implica chevron ← por sí solo.' },
            { label: 'Subordinación', value: 'ADR-0009 aplica blur/opacity al panel cubierto, no redibuja esta cabecera.' },
            { label: 'Contrato visual', value: 'El mismo que Cabecera de modal (36 px). Sin properties propias.' },
        ],
        properties: [],
    },
    {
        id: 'header-app-navbar',
        label: 'App Navbar',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary: 'Chrome de aplicación (logo, saludo, campanas). Anatomía distinta de PageScreen. No es canon universal.',
        listSummary: 'Especializado · app shell',
        blueprintNeedle: '| App Navbar |',
        sourceFiles: ['src/components/Navbar.tsx'],
        impactPatterns: [],
        applyKind: 'locked',
        examples: ['Navbar global. Oculta en /design-system y /playground.'],
        properties: [],
    },
    {
        id: 'header-t1-sala-staff',
        label: 'T1 · Sala / Staff',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary:
            'Comparte parte del chrome del Page Header, pero T1 no utiliza PageScreen y sus anatomías pueden diferir.',
        listSummary: 'Especializado · Surface page',
        blueprintNeedle: '| T1 · Sala / Staff |',
        sourceFiles: [
            'src/app/dashboard/sala/page.tsx',
            'src/components/dashboards/StaffDashboardView.tsx',
        ],
        impactPatterns: [],
        applyKind: 'locked',
        warning:
            'Sala LIVE y Staff semana usan data-element="header" dentro de Surface page. El CSS de Page Header las pinta. No son PageScreen.',
        examples: ['Sala LIVE — título «Sala» + badge Live.', 'Staff semana — mes/semana + enlace Historial.'],
        properties: [],
    },
    {
        id: 'header-t1-ventas',
        label: 'T1 · Ventas',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary:
            'Ocupa el chrome de Surface page, pero la anatomía es una navegación de fecha propia. No debe convertirse automáticamente en Page Header.',
        listSummary: 'Especializado · date-nav',
        blueprintNeedle: '| T1 · Ventas |',
        sourceFiles: ['src/components/dashboards/DashboardVentasSection.tsx'],
        impactPatterns: [],
        applyKind: 'locked',
        warning:
            'Ventas no es título 18/900 + back + rightSlot. Es un stepper de fecha centrado. No es Page Header.',
        examples: ['DashboardVentasSection — chip «Ventas» + stepper de día centrado.'],
        properties: [],
    },
    {
        id: 'header-bottom-sheet',
        label: 'Bottom Sheet',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary: 'Reutiliza 36 px pero fondo blanco y borde. No es el Modal centrado. Excepción documentada.',
        listSummary: 'Especializado · sheet',
        blueprintNeedle: '| Bottom Sheet |',
        sourceFiles: ['src/components/ui/ConsumptionBottomSheet.tsx'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'header-kds',
        label: 'KDS',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary: 'Pantalla de cocina. Sin Page Header. Chrome propio de dominio.',
        listSummary: 'Especializado · cocina',
        blueprintNeedle: '| KDS |',
        sourceFiles: ['src/components/kds/KDSView.tsx'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'header-calendar',
        label: 'Calendario / ScheduleDayEditor',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary:
            'Chrome de navegación de mes o cuadrante. No es Page Header. El patrón P3 (celdas) sigue en PATTERNS / Calendario.',
        listSummary: 'Especializado · cuadrante',
        blueprintNeedle: '| Calendario / ScheduleDayEditor |',
        sourceFiles: ['src/components/schedule/ScheduleDayEditor.tsx'],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'header-carta-publica',
        label: 'Carta pública / cliente',
        group: 'cabeceras',
        status: 'ESPECIALIZADO',
        summary: 'Cabecera de producto público o encargo cliente. No es pantalla de gestión.',
        listSummary: 'Especializado · cliente',
        blueprintNeedle: '| Carta pública / cliente |',
        sourceFiles: [],
        impactPatterns: [],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'layout-alignment',
        label: 'Layout / alineación',
        group: 'alineacion',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Decisiones de izquierda / centro / extremos. No se expone justify-content.',
        blueprintNeedle: '| Layout / alineación |',
        sourceFiles: [],
        impactPatterns: [],
        applyKind: 'unavailable',
        properties: [
            prop('align-x', 'Horizontal', 'edges', ALIGN_X_OPTIONS, 'alignment-x'),
            prop('align-y', 'Vertical', 'center', ALIGN_Y_OPTIONS, 'alignment-y'),
        ],
    },
    {
        id: 'button',
        label: 'Button',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'Cuatro variantes. XOR texto/icono. Hit 48 / visual abraza el contenido / radio 8. Contrato obligatorio.',
        blueprintNeedle: '| Button |',
        sourceFiles: ['src/components/ui/button.tsx', 'src/lib/design-system/button-contract.ts'],
        impactPatterns: ['<Button', 'data-component="Button"', "data-component='Button'"],
        applyKind: 'css-contract',
        properties: [
            prop('height', 'Hit', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('radius', 'Radio', 'espacio.2', RADIUS_OPTIONS),
            prop('px', 'Padding horizontal', 'espacio.1', SPACE_OPTIONS),
            prop('focus', 'Foco', 'color.marca', FOCUS_OPTIONS),
            prop('align-x', 'Alineación del contenido', 'center', ALIGN_X_OPTIONS, 'alignment-x'),
            prop('fill-primary', 'Color de guardar', 'color.positivo', COLOR_OPTIONS),
            prop('fill-secondary', 'Color de cancelar', 'color.superficie.inactiva', COLOR_OPTIONS),
            prop('fill-tertiary', 'Color de filtro', 'color.marca', COLOR_OPTIONS),
            prop('fill-destructive', 'Color de eliminar', 'color.negativo', COLOR_OPTIONS),
        ],
    },
    {
        id: 'modal',
        label: 'Modal',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'T5/T6. Una pieza. ADR-0007/0008/0009. No se reinterpreta.',
        blueprintNeedle: '| Modal |',
        sourceFiles: ['src/components/ui/modal.tsx'],
        impactPatterns: ['<Modal'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'surface',
        label: 'Surface',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'page y block. Prohibido un tercer envoltorio genérico.',
        blueprintNeedle: '| Surface |',
        sourceFiles: ['src/components/ui/Surface.tsx'],
        impactPatterns: ['<Surface'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'pagescreen',
        label: 'PageScreen',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'Plantilla T2/T3/T4. El chrome es el de PageScreen.',
        blueprintNeedle: '| PageScreen |',
        sourceFiles: ['src/components/dashboard/DashboardDetailLayout.tsx'],
        impactPatterns: ['<PageScreen', 'DashboardDetailLayout'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'field',
        label: 'Field',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Dirección cerrada: controles nativos dentro de Field. El contrato visual completo sigue abierto.',
        blueprintNeedle: '| Field |',
        sourceFiles: ['src/components/ui/Field.tsx', 'src/app/globals.css'],
        impactPatterns: ['<Field', 'FIELD_COMPONENT_ID'],
        legacyPatterns: ['<input', '<select', '<textarea'],
        applyKind: 'css-contract',
        properties: [
            prop('height', 'Altura del control', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('radius', 'Radio', 'radio.control', RADIUS_OPTIONS),
            prop('px', 'Padding horizontal', 'espacio.3', SPACE_OPTIONS),
            prop('focus', 'Foco', 'color.marca', FOCUS_OPTIONS),
            prop('label-gap', 'Separación label / control', 'espacio.1', SPACE_OPTIONS),
        ],
    },
    {
        id: 'search',
        label: 'Search',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'SearchField existe. No es Field. Lupa + input compactos (32 px, 12 px). El contrato visual completo sigue abierto.',
        blueprintNeedle: '| Search |',
        sourceFiles: ['src/components/ui/SearchField.tsx', 'src/app/globals.css'],
        impactPatterns: ['<SearchField', 'SEARCH_FIELD_COMPONENT_ID'],
        applyKind: 'blueprint-only',
        properties: [
            prop('height', 'Altura', 'espacio.8', HEIGHT_OPTIONS),
            prop('radius', 'Radio', 'radio.control', RADIUS_OPTIONS),
            prop('px', 'Padding', 'espacio.2', SPACE_OPTIONS),
        ],
    },
    {
        id: 'select',
        label: 'Select',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Nativo dentro de Field. No nace primitiva Select de design system.',
        blueprintNeedle: '| Select |',
        sourceFiles: ['src/components/ui/Field.tsx'],
        impactPatterns: ['<select', '<Field'],
        applyKind: 'blueprint-only',
        properties: [
            prop('height', 'Altura', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('radius', 'Radio', 'radio.control', RADIUS_OPTIONS),
            prop('align-x', 'Alineación del valor', 'left', ALIGN_X_OPTIONS, 'alignment-x'),
        ],
    },
    {
        id: 'quantity-stepper',
        label: 'QuantityStepper',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Pieza existe. Recuento de efectivo sigue en DenominationStepper.',
        blueprintNeedle: '| QuantityStepper |',
        sourceFiles: ['src/components/ui/QuantityStepper.tsx'],
        impactPatterns: ['<QuantityStepper'],
        applyKind: 'blueprint-only',
        properties: [
            prop('height', 'Caja', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('gap', 'Separación', 'espacio.2', SPACE_OPTIONS),
            prop('align-x', 'Alineación', 'center', ALIGN_X_OPTIONS, 'alignment-x'),
        ],
    },
    {
        id: 'table',
        label: 'Table / T8',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Composición, no Table.tsx. Thead de marca: un cambio pinta todas las tablas operativas.',
        blueprintNeedle: '| Table / T8 |',
        sourceFiles: [
            'src/lib/design-system/table.ts',
            'src/app/globals.css',
            'src/app/dashboard/ventas/page.tsx',
            'src/components/ledger/ManagerLedgerView.tsx',
        ],
        impactPatterns: ['<table', '<thead'],
        applyKind: 'blueprint-only',
        properties: [
            prop('row-height', 'Altura de fila', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('px', 'Padding de celda', 'espacio.3', SPACE_OPTIONS),
            prop('density', 'Densidad', 'comfortable', DENSITY_OPTIONS, 'density'),
            prop('align-x', 'Alineación numérica', 'edges', ALIGN_X_OPTIONS, 'alignment-x'),
        ],
    },
    {
        id: 'empty-state',
        label: 'EmptyState',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Las tres situaciones de producto existen. Cómo se distinguen none y mismatch no está congelado.',
        blueprintNeedle: '| EmptyState |',
        sourceFiles: ['src/components/ui/EmptyState.tsx', 'src/app/globals.css'],
        impactPatterns: ['<EmptyState'],
        applyKind: 'css-contract',
        properties: [
            prop('align-x', 'Alineación', 'center', ALIGN_X_OPTIONS, 'alignment-x'),
            prop('pad-y', 'Padding vertical', 'espacio.8', SPACE_OPTIONS),
            prop('gap', 'Separación título / texto', 'espacio.2', SPACE_OPTIONS),
        ],
    },
    {
        id: 'notice',
        label: 'Notice',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'Cinco variantes. critical usa color.critico. Un pintado igual a negative es deuda.',
        blueprintNeedle: '| Notice |',
        sourceFiles: ['src/components/ui/Notice.tsx', 'src/app/globals.css'],
        impactPatterns: ['<Notice'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'loading-spinner',
        label: 'LoadingSpinner',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Hay tamaños en código. El contrato (tamaños / currentColor) no está congelado.',
        blueprintNeedle: '| LoadingSpinner |',
        sourceFiles: ['src/components/ui/LoadingSpinner.tsx'],
        impactPatterns: ['<LoadingSpinner'],
        applyKind: 'blueprint-only',
        properties: [
            prop('size', 'Tamaño', 'espacio.8', [
                ...SPACE_OPTIONS.filter((item) =>
                    ['espacio.4', 'espacio.6', 'espacio.8', 'espacio.12'].includes(item.id)
                ),
            ]),
            prop('align-x', 'Posición', 'center', ALIGN_X_OPTIONS, 'alignment-x'),
        ],
    },
    {
        id: 'radio-segmented',
        label: 'Radio / Segmented',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'PetroleumSegmented 2–5 está cerrado. Cuándo usar radio nativo sigue abierto.',
        blueprintNeedle: '| Radio / Segmented |',
        sourceFiles: ['src/components/ui/PetroleumSegmented.tsx'],
        impactPatterns: ['<PetroleumSegmented', '<input', 'type="radio"'],
        applyKind: 'blueprint-only',
        properties: [
            prop('density', 'Densidad', 'comfortable', DENSITY_OPTIONS, 'density'),
            prop('height', 'Altura', 'tactil.minimo', HEIGHT_OPTIONS),
        ],
    },
    {
        id: 'checkbox',
        label: 'Checkbox',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'Receta candidata: hit 48, marca, radio 4. No componente.',
        blueprintNeedle: '| Checkbox |',
        sourceFiles: [],
        impactPatterns: ['type="checkbox"', "type={'checkbox'}"],
        applyKind: 'blueprint-only',
        properties: [
            prop('height', 'Hit', 'tactil.minimo', HEIGHT_OPTIONS),
            prop('gap', 'Separación con label', 'espacio.2', SPACE_OPTIONS),
            prop('align-y', 'Alineación con label', 'center', ALIGN_Y_OPTIONS, 'alignment-y'),
        ],
    },
    {
        id: 'calendar',
        label: 'Calendario',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'P3 es patrón, no DatePicker. Las celdas de cuadrante no se convierten en componente universal.',
        blueprintNeedle: '| Calendario |',
        sourceFiles: [],
        impactPatterns: ['month-cal', 'cuadrante'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'timefilter-chrome',
        label: 'TimeFilter (chrome)',
        group: 'piezas',
        status: 'BORRADOR / PROPUESTA',
        summary: 'P7 (vive en cabecera) está cerrado. El chrome visual 32 px no es contrato.',
        blueprintNeedle: '| TimeFilter (chrome) |',
        sourceFiles: ['src/components/time/TimeFilterButton.tsx', 'src/components/time/PeriodNav.tsx'],
        impactPatterns: ['TimeFilterButton', 'PeriodNav'],
        applyKind: 'blueprint-only',
        properties: [
            prop('height', 'Altura', 'espacio.8', HEIGHT_OPTIONS),
            prop('radius', 'Radio', 'radio.control', RADIUS_OPTIONS),
        ],
    },
    {
        id: 'petroleum-segmented',
        label: 'PetroleumSegmented',
        group: 'piezas',
        status: 'CANON CERRADO',
        summary: 'Única pieza 2–5. comfortable / compact. Contrato obligatorio.',
        blueprintNeedle: '| PetroleumSegmented |',
        sourceFiles: ['src/components/ui/PetroleumSegmented.tsx'],
        impactPatterns: ['<PetroleumSegmented'],
        applyKind: 'locked',
        properties: [],
    },
    {
        id: 'document-list-row',
        label: 'DocumentListRow',
        group: 'especializado',
        status: 'ESPECIALIZADO',
        summary: 'Fila de documento. Patrón de dominio. No es una fila universal.',
        blueprintNeedle: '| DocumentListRow |',
        sourceFiles: ['src/lib/design-system/document-list-row.ts'],
        impactPatterns: ['DocumentListRow', 'document-list-row'],
        applyKind: 'locked',
        properties: [],
    },
];

const BY_ID = new Map(STUDIO_ELEMENTS.map((item) => [item.id, item]));

export function seedRegistryElements(): Record<string, RegistryElement> {
    const elements: Record<string, RegistryElement> = {};
    for (const item of STUDIO_ELEMENTS) {
        if (item.registry === false) continue;
        elements[item.id] = {
            status: item.status,
            version: item.status === 'CANON CERRADO' || item.status === 'HEREDADO' ? 1 : 0,
            properties: actualValues(item),
            ...(item.inherits ? { inherits: item.inherits } : {}),
        };
    }
    return elements;
}

export function hydrateElements(
    registryElements: Record<string, { status: StudioElement['status']; properties: Record<string, string>; inherits?: string }>
): StudioElement[] {
    return STUDIO_ELEMENTS.map((def) => {
        const live = registryElements[def.id];
        if (!live) return def;
        return {
            ...def,
            status: live.status,
            inherits: live.inherits ?? def.inherits,
            properties: def.properties.map((property) => ({
                ...property,
                actualId: live.properties[property.id] ?? property.actualId,
            })),
        };
    });
}

export function getStudioElement(id: string): StudioElement | undefined {
    return BY_ID.get(id);
}

export function getHydratedElement(
    id: string,
    registryElements: Record<string, { status: StudioElement['status']; properties: Record<string, string>; inherits?: string }>
): StudioElement | undefined {
    return hydrateElements(registryElements).find((item) => item.id === id);
}

export function elementsByGroup(group: StudioElement['group']): StudioElement[] {
    return STUDIO_ELEMENTS.filter((item) => item.group === group);
}

export function editableElements(): StudioElement[] {
    return STUDIO_ELEMENTS.filter((item) => item.status === 'BORRADOR / PROPUESTA');
}

export function actualValues(element: StudioElement): Record<string, string> {
    const values: Record<string, string> = {};
    for (const property of element.properties) {
        values[property.id] = property.actualId;
    }
    return values;
}

const PATTERN_IDS = new Set([
    'search',
    'select',
    'quantity-stepper',
    'table',
    'calendar',
    'timefilter-chrome',
    'radio-segmented',
    'checkbox',
    'loading-spinner',
    'layout-alignment',
    'document-list-row',
]);

export type StudioNavId =
    | 'foundations'
    | 'components'
    | 'patterns'
    | 'headers'
    | 'compositions'
    | 'canon'
    | 'proposals'
    | 'history';

export function studioNavId(element: StudioElement): Exclude<StudioNavId, 'compositions' | 'canon' | 'proposals' | 'history'> {
    if (element.group === 'fundamentos') return 'foundations';
    if (element.group === 'cabeceras') return 'headers';
    if (PATTERN_IDS.has(element.id) || element.group === 'alineacion' || element.group === 'especializado') {
        return 'patterns';
    }
    return 'components';
}

export const HEADER_PRIMARY_IDS = ['page-header', 'block-header', 'table-header', 'modal-header'] as const;
export const HEADER_DERIVED_ID = 'derived-modal-header';
export const HEADER_SPECIALIZED_IDS = [
    'header-app-navbar',
    'header-t1-sala-staff',
    'header-t1-ventas',
    'header-bottom-sheet',
    'header-kds',
    'header-calendar',
    'header-carta-publica',
] as const;

export function isIndependentVisualCanon(element: StudioElement): boolean {
    if (element.inherits || element.redirectTo) return false;
    if (element.status === 'HEREDADO' || element.status === 'ESPECIALIZADO' || element.status === 'DEPRECADO') {
        return false;
    }
    return element.status === 'CANON CERRADO';
}
