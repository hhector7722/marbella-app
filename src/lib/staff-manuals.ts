/**
 * Manuales del personal (Info → Manuales en `/staff/dashboard`).
 * Coloca los ficheros bajo `public/` con la misma ruta URL (sin prefijo `public`).
 * Ej.: `checkListPdf` → archivo en disco `public/docs/manuals/check-list.pdf`.
 */
export const STAFF_MANUAL_ASSETS = {
    checkListPdf: '/docs/manuals/check-list.pdf',
    /** PDF: Limpieza Horno (submenú desde entrada «Horno»). */
    hornoLimpiezaPdf: '/docs/manuals/horno-limpieza.pdf',
    /** Vídeo: Funcionamiento Horno (visor embebido en modal). */
    hornoFuncionamientoVideo: '/docs/manuals/horno-funcionamiento.mp4',
    altavocesVideo: '/docs/manuals/altavoces.mp4',
    bebidasImage: '/docs/manuals/bebidas.png',
    cambiosLluviaImage: '/docs/manuals/cambios-lluvia.png',
    cuadroElectricoImage: '/docs/manuals/cuadro-electrico.png',
    /** Vídeos submenú TPV (visor embebido en modal). */
    tpvAnulacionesVideo: '/docs/manuals/abono.mp4',
    tpvDescuentosVideo: '/docs/manuals/descuento.mp4',
    tpvCobrosPendientesVideo: '/docs/manuals/cobros.mp4',
    tpvImpresorasVideo: '/docs/manuals/tickets.mp4',
} as const;

export type StaffManualMenuId =
    | 'check-list'
    | 'tpv'
    | 'altavoces'
    | 'bebidas'
    | 'horno'
    | 'cambios-lluvia'
    | 'cuadro-electrico';

export const STAFF_MANUAL_MENU: Array<{
    id: StaffManualMenuId;
    label: string;
    icon: string;
}> = [
    { id: 'check-list', label: 'Check List', icon: '/icons/inventory.png' },
    { id: 'tpv', label: 'Tpv', icon: '/icons/pos.png' },
    { id: 'altavoces', label: 'Altavoces', icon: '/icons/altav.png' },
    { id: 'bebidas', label: 'Bebidas', icon: '/icons/ingrediente.png' },
    { id: 'horno', label: 'Horno', icon: '/icons/horno.png' },
    { id: 'cambios-lluvia', label: 'Cambios por Lluvia', icon: '/icons/lluvia.png' },
    { id: 'cuadro-electrico', label: 'Acceso Cuadro Eléctrico', icon: '/icons/electrico.png' },
];

/** Sub-entradas del manual TPV (destinos: pendiente de definir). */
export const STAFF_TPV_MANUAL_ITEMS = [
    'Anulaciones',
    'Descuentos',
    'Cobros Pendientes',
    'Conceptos Botonera',
    'Impresoras Tpv',
    'Instrucciones Handy',
] as const;

export type StaffTpvManualItemLabel = (typeof STAFF_TPV_MANUAL_ITEMS)[number];

export const STAFF_TPV_MANUAL_VIDEOS: Partial<Record<StaffTpvManualItemLabel, { src: string; title: string }>> = {
    'Anulaciones': { src: STAFF_MANUAL_ASSETS.tpvAnulacionesVideo, title: 'TPV · Anulaciones' },
    'Descuentos': { src: STAFF_MANUAL_ASSETS.tpvDescuentosVideo, title: 'TPV · Descuentos' },
    'Cobros Pendientes': { src: STAFF_MANUAL_ASSETS.tpvCobrosPendientesVideo, title: 'TPV · Cobros Pendientes' },
    'Impresoras Tpv': { src: STAFF_MANUAL_ASSETS.tpvImpresorasVideo, title: 'TPV · Impresoras TPV' },
};
