/**
 * Iconos estáticos en `public/icons`.
 * Sube `APP_ICON_REV` al sustituir el pack para invalidar caché del navegador.
 */
export const APP_ICON_REV = '202609021';

export function withAppIconRev(path: string): string {
    if (!path.startsWith('/icons/') || path.includes('?')) {
        return path;
    }
    return `${path}?v=${APP_ICON_REV}`;
}
