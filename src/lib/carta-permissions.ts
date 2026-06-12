/** Roles con edición completa de carta (manager, admin, supervisor). */
const CARTA_ELEVATED_ROLES = new Set(['manager', 'admin', 'supervisor'])

export function canEditCartaMenu(role: string | null | undefined, isCartaEditor = false): boolean {
  if (role && CARTA_ELEVATED_ROLES.has(role)) return true
  return isCartaEditor
}
