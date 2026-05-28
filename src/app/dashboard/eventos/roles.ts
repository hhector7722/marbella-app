export function canViewEventos(role: string | null): boolean {
  return role === 'staff' || role === 'supervisor' || role === 'manager' || role === 'admin'
}

export function canManageEventos(role: string | null): boolean {
  return role === 'manager' || role === 'admin'
}
