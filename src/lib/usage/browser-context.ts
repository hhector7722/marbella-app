/**
 * Identificadores de seguimiento no sensibles, compartidos entre el proxy
 * (servidor) y las acciones de navegación (cliente).
 *
 * - browser: instalación del navegador; compartido entre sus pestañas.
 * - browser session: periodo de actividad del navegador (30 min de inactividad).
 * - usageSessionId: pestaña individual; NUNCA debe atribuirse al proxy.
 */
export const USAGE_BROWSER_COOKIE = 'mb_usage_browser';
export const USAGE_BROWSER_SESSION_COOKIE = 'mb_usage_browser_context';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUsageTrackingId(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4.test(value);
}
