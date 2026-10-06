import { isMasterDashboardUser } from '../staff/simulation-identity.ts';
import { STAFF_MANUAL_MENU } from '../staff-manuals.ts';

export type SearchIdentity = { userId: string; role: string | null; email: string | null; isViewingAs: boolean };
export type SearchResult = { type: 'function' | 'ingredient' | 'recipe' | 'supplier' | 'employee' | 'invoice'; id: string; title: string; subtitle: string; icon?: string; image?: string; href: string; score: number };
type CatalogItem = { id: string; label: string; aliases: string[]; description: string; icon: string; href: (identity: SearchIdentity) => string; access: 'all' | 'management' | 'master' };

const CATALOG: CatalogItem[] = [
  { id: 'stock', label: 'Stock', aliases: ['existencias', 'stock teórico'], description: 'Existencias y movimientos', icon: '/icons/productes.png', href: () => '/dashboard/inventory/ledger', access: 'management' },
  { id: 'inventory', label: 'Inventario', aliases: ['recuento', 'contar stock'], description: 'Recuento de existencias', icon: '/icons/inventory.png', href: () => '/dashboard/inventory', access: 'all' },
  { id: 'schedules', label: 'Horarios', aliases: ['horas', 'turnos'], description: 'Horario de trabajo', icon: '/icons/schedule.png', href: () => '/horario', access: 'all' },
  { id: 'attendance', label: 'Asistencia', aliases: ['fichaje', 'fichajes', 'horas'], description: 'Historial de asistencia', icon: '/icons/calendar.png', href: () => '/staff/history', access: 'all' },
  { id: 'team', label: 'Plantilla', aliases: ['personal', 'empleados', 'trabajadores'], description: 'Equipo de trabajo', icon: '/icons/staff-card.png', href: () => '/profile?open=plantilla', access: 'management' },
  { id: 'recipes', label: 'Recetas', aliases: ['receta', 'elaboraciones'], description: 'Recetario', icon: '/icons/recipes.png', href: (i) => !canManageSearch(i) && (i.role === 'staff' || i.role === 'user') ? '/recipes?view=staff' : '/recipes', access: 'all' },
  { id: 'ingredients', label: 'Ingredientes', aliases: ['ingrediente', 'materias primas'], description: 'Catálogo de ingredientes', icon: '/icons/productes.png', href: () => '/ingredients', access: 'all' },
  { id: 'suppliers', label: 'Proveedores', aliases: ['proveedor'], description: 'Catálogo de proveedores', icon: '/icons/suplier.png', href: () => '/suppliers', access: 'all' },
  { id: 'invoices', label: 'Albaranes', aliases: ['factura proveedor', 'factura compra', 'albarán'], description: 'Compras recibidas', icon: '/icons/scan.png', href: () => '/dashboard/albaranes', access: 'all' },
  { id: 'orders', label: 'Pedidos', aliases: ['pedido proveedor'], description: 'Pedidos a proveedores', icon: '/icons/shipment.png', href: (i) => canManageSearch(i) && !isMasterDashboardUser(i.email) ? '/dashboard?open=pedidos' : '/staff/dashboard?open=pedidos', access: 'all' },
  { id: 'menu', label: 'Carta', aliases: ['menú', 'menu'], description: 'Carta del restaurante', icon: '/icons/menu.png', href: () => '/staff/carta', access: 'all' },
  { id: 'closing', label: 'Cierre', aliases: ['cierre de caja', 'cerrar caja'], description: 'Cierre de caja', icon: '/icons/lock.png', href: (i) => isMasterDashboardUser(i.email) && !i.isViewingAs ? '/master/dashboard?open=cierre' : canManageSearch(i) ? '/dashboard?open=cierre' : '/staff/dashboard?open=cierre', access: 'all' },
  { id: 'tips', label: 'Propinas', aliases: ['propina'], description: 'Botes de propinas', icon: '/icons/tip.png', href: (i) => i.role === 'manager' || i.role === 'admin' || isMasterDashboardUser(i.email) && !i.isViewingAs ? '/dashboard/propinas' : '/staff/propinas', access: 'all' },
  { id: 'reservations', label: 'Reservas', aliases: ['reserva', 'mesas'], description: 'Gestión de reservas', icon: '/icons/reservas.png', href: () => '/staff/reservas', access: 'all' },
  { id: 'profile', label: 'Perfil', aliases: ['mi cuenta', 'datos personales'], description: 'Datos de usuario', icon: '/icons/admin.png', href: () => '/profile', access: 'all' },
  { id: 'cash-change', label: 'Cambio', aliases: ['caja cambio', 'efectivo'], description: 'Cambio de efectivo', icon: '/icons/change.png', href: () => '/staff/dashboard?open=cambio', access: 'all' },
  { id: 'purchase', label: 'Compra', aliases: ['compras', 'registrar compra'], description: 'Registrar una compra', icon: '/icons/shop.png', href: () => '/staff/dashboard?open=compra', access: 'all' },
  { id: 'cash-movements', label: 'Movimientos de caja', aliases: ['movimientos', 'caja inicial'], description: 'Movimientos de efectivo', icon: '/icons/change.png', href: () => '/dashboard/movements', access: 'management' },
  { id: 'labor', label: 'Mano de obra', aliases: ['m obra', 'coste laboral', 'horas extra'], description: 'Coste laboral y horas', icon: '/icons/overtime.png', href: () => '/dashboard/labor', access: 'management' },
  { id: 'personal-consumption', label: 'Consumo', aliases: ['consumo personal'], description: 'Consumo del personal', icon: '/icons/consum.png', href: () => '/dashboard/consumo-personal', access: 'management' },
  { id: 'profitability', label: 'Rentabilidad', aliases: ['margen', 'beneficios', 'insights'], description: 'Rentabilidad del negocio', icon: '/icons/rent.png', href: () => '/dashboard/insights', access: 'management' },
  { id: 'app-usage', label: 'Uso de la app', aliases: ['uso app', 'actividad'], description: 'Actividad en la aplicación', icon: '/icons/uso.png', href: () => '/dashboard/uso', access: 'master' },
  { id: 'new-hires', label: 'Altas', aliases: ['alta empleado', 'incorporaciones'], description: 'Altas de personal', icon: '/icons/staff-card.png', href: () => '/dashboard/altas', access: 'master' },
  { id: 'showcase-menu', label: 'Vitrina', aliases: ['carta vitrina'], description: 'Carta de vitrina', icon: '/icons/menu2.png', href: () => '/master/carta', access: 'master' },
  ...STAFF_MANUAL_MENU.map((manual) => ({
    id: `manual-${manual.id}`,
    label: manual.label,
    aliases: [manual.id.replace(/-/g, ' '), 'manual', 'guía'],
    description: 'Manual de trabajo',
    icon: manual.icon,
    href: () => `/staff/dashboard?manual=${encodeURIComponent(manual.id)}`,
    access: 'all' as const,
  })),
];

export function normalizeSearchText(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); }
export function canManageSearch(identity: SearchIdentity): boolean { return identity.role === 'manager' || identity.role === 'admin' || (!identity.isViewingAs && isMasterDashboardUser(identity.email)); }
export function searchFunctions(query: string, identity: SearchIdentity): SearchResult[] {
  const term = normalizeSearchText(query);
  if (!term) return [];
  return CATALOG.flatMap((item) => {
    if (item.access === 'management' && !canManageSearch(identity)) return [];
    if (item.access === 'master' && (identity.isViewingAs || !isMasterDashboardUser(identity.email))) return [];
    const matches = [item.label, ...item.aliases].map(normalizeSearchText);
    const score = matches.reduce((best, candidate) => Math.max(best, candidate === term ? 110 : candidate.startsWith(term) ? 90 : candidate.includes(term) ? 70 : 0), 0);
    return score ? [{ type: 'function' as const, id: item.id, title: item.label, subtitle: item.description, icon: item.icon, href: item.href(identity), score }] : [];
  }).sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'));
}
