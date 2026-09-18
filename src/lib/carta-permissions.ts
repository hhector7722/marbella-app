/** Roles con edición completa de carta. El staff consulta; no hay editores delegados. */
const CARTA_ELEVATED_ROLES = new Set(['manager', 'admin', 'supervisor']);

export function canEditCartaMenu(role: string | null | undefined): boolean {
    return Boolean(role && CARTA_ELEVATED_ROLES.has(role));
}
