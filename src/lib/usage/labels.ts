import type { AppUsageMetadata } from '@/lib/usage/types';

const STATIC_ROUTE_LABELS: Record<string, string> = {
  '/master/dashboard': 'Hub master',
  '/dashboard': 'Dashboard admin',
  '/dashboard/uso': 'Uso de la app',
  '/dashboard/albaranes': 'Albaranes',
  '/dashboard/scanner': 'Escáner albaranes',
  '/dashboard/insights': 'Rentabilidad',
  '/dashboard/propinas': 'Propinas',
  '/dashboard/movements': 'Tesorería',
  '/dashboard/overtime': 'Horas extras',
  '/dashboard/labor': 'Coste laboral',
  '/dashboard/consumo-personal': 'Consumo personal',
  '/dashboard/eventos': 'Eventos',
  '/dashboard/history': 'Historial cierres',
  '/dashboard/instalacion-app': 'Instalar app',
  '/dashboard/kds': 'KDS cocina',
  '/dashboard/sala': 'Radar sala',
  '/dashboard/recetas-tpv': 'Recetas TPV',
  '/staff/dashboard': 'Dashboard staff',
  '/staff/history': 'Asistencia',
  '/staff/carta': 'Carta staff',
  '/staff/propinas': 'Mis propinas',
  '/staff/reservas': 'Reservas',
  '/recipes': 'Recetas',
  '/ingredients': 'Ingredientes',
  '/suppliers': 'Proveedores',
  '/orders/new': 'Pedidos',
  '/profile': 'Perfil',
  '/login': 'Login',
  '/carta': 'Carta pública',
};

const ACTION_LABELS: Record<string, string> = {
  tab_switch: 'Cambio de pestaña',
  page_dwell: 'Tiempo en pantalla',
  modal_open: 'Modal abierto',
  modal_dwell: 'Tiempo en modal',
  clock_in: 'Entrada fichada',
  clock_out: 'Salida fichada',
  consumption_saved: 'Consumo registrado',
};

export function deriveUsageLabel(
  pathname: string,
  metadata?: AppUsageMetadata | null,
  eventType?: string
): string {
  if (eventType === 'action' && metadata?.action) {
    const base = ACTION_LABELS[metadata.action] ?? 'Acción';
    if (metadata.action === 'tab_switch' && metadata.tabLabel) {
      return `${base}: ${metadata.tabLabel}`;
    }
    if (metadata.action === 'modal_open' && metadata.modalLabel) {
      return String(metadata.modalLabel);
    }
    return base;
  }

  if (STATIC_ROUTE_LABELS[pathname]) {
    return STATIC_ROUTE_LABELS[pathname]!;
  }

  if (/^\/dashboard\/eventos\/[^/]+/.test(pathname)) {
    return 'Pedidos evento';
  }

  if (/^\/recipes\/[^/]+$/.test(pathname)) {
    return 'Ficha receta';
  }

  if (/^\/dashboard\/albaranes/.test(pathname)) {
    return 'Albaranes';
  }

  return pathname;
}

export function formatUsagePathLine(
  path: string | null,
  search: string | null,
  label: string | null
): string {
  const route = path ? `${path}${search ?? ''}` : '';
  if (label && route && label !== route) {
    return `${label} · ${route}`;
  }
  return label ?? route ?? ' ';
}

export function formatDurationMs(durationMs: number | null | undefined): string {
  if (durationMs == null || durationMs <= 0) return ' ';
  const totalSeconds = Math.round(durationMs / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
