/**
 * Manuales del personal (Info → Manuales en `/staff/dashboard`).
 * Coloca los ficheros bajo `public/` con la misma ruta URL (sin prefijo `public`).
 * Ej.: `checkListPdf` → archivo en disco `public/docs/manuals/check-list.pdf`.
 */
export const STAFF_MANUAL_ASSETS = {
    checkListPdf: '/docs/manuals/check-list.pdf?v=20260904',
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
    { id: 'cambios-lluvia', label: 'Cambios lluvia', icon: '/icons/lluvia.png' },
    { id: 'cuadro-electrico', label: 'Cuadro eléctrico', icon: '/icons/electrico.png' },
];

/** Sub-entradas del manual TPV (destinos: pendiente de definir). */
export const STAFF_TPV_MANUAL_ITEMS = [
    'Anulaciones',
    'Descuentos',
    'Cobros',
    'Botonera',
    'Impresoras Tpv',
    'Handy',
] as const;

export type StaffTpvManualItemLabel = (typeof STAFF_TPV_MANUAL_ITEMS)[number];

export const STAFF_TPV_MANUAL_ICONS: Record<StaffTpvManualItemLabel, string> = {
    'Anulaciones': '/icons/reverse.png',
    'Descuentos': '/icons/400.2.png',
    'Cobros': '/icons/wallet.png',
    'Botonera': '/icons/pos.png',
    'Impresoras Tpv': '/icons/notas.png',
    'Handy': '/icons/phone.png',
};

export const STAFF_TPV_MANUAL_VIDEOS: Partial<Record<StaffTpvManualItemLabel, { src: string; title: string }>> = {
    'Anulaciones': { src: STAFF_MANUAL_ASSETS.tpvAnulacionesVideo, title: 'TPV · Anulaciones' },
    'Descuentos': { src: STAFF_MANUAL_ASSETS.tpvDescuentosVideo, title: 'TPV · Descuentos' },
    'Cobros': { src: STAFF_MANUAL_ASSETS.tpvCobrosPendientesVideo, title: 'TPV · Cobros' },
    'Impresoras Tpv': { src: STAFF_MANUAL_ASSETS.tpvImpresorasVideo, title: 'TPV · Impresoras TPV' },
};

export const STAFF_HORNO_MANUAL_ITEMS = [
    { id: 'limpieza', label: 'Limpieza Horno', icon: '/icons/bin.png' },
    { id: 'funcionamiento', label: 'Funcionamiento Horno', icon: '/icons/horno.png' },
] as const;
