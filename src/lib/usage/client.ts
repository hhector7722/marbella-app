import { MAX_DISTANCE_METERS, type GeofenceClockAction } from '@/lib/location';
import type { UsageClientEventPayload } from '@/lib/usage/types';

/**
 * ID de seguimiento por pestaña, independiente de las sesiones del chat
 * y de la cookie de middleware (compartida entre pestañas).
 * El reposo de 30 minutos inicia un recorrido nuevo.
 */
const USAGE_TAB_SESSION_KEY = 'mb_usage_tab_session_v1';
const SESSION_IDLE_MS = 30 * 60 * 1000;
let fallbackSession: { id: string; last: number } | null = null;

function currentUsageSessionId(): string {
  const now = Date.now();
  let stored: { id?: string; last?: number } | null = null;
  try {
    stored = JSON.parse(sessionStorage.getItem(USAGE_TAB_SESSION_KEY) || 'null') as typeof stored;
  } catch {
    stored = fallbackSession;
  }
  const valid = typeof stored?.id === 'string'
    && /^[0-9a-f-]{36}$/i.test(stored.id)
    && typeof stored.last === 'number'
    && now >= stored.last
    && now - stored.last < SESSION_IDLE_MS;
  const id = valid ? stored!.id! : crypto.randomUUID();
  const next = { id, last: now };
  fallbackSession = next;
  try { sessionStorage.setItem(USAGE_TAB_SESSION_KEY, JSON.stringify(next)); } catch { /* Modo privado */ }
  return id;
}

export async function sendUsageEvent(payload: UsageClientEventPayload): Promise<void> {
  try {
    await fetch('/api/usage/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        metadata: { ...payload.metadata, usageSessionId: currentUsageSessionId(), source: 'client' },
      }),
      keepalive: true,
    });
  } catch {
    // No bloquear UX si falla el tracking.
  }
}

export function trackUsageTabSwitch(fromPath: string, toHref: string, tabLabel: string): void {
  void sendUsageEvent({
    eventType: 'action',
    path: toHref,
    referrerPath: fromPath || null,
    label: `Pestaña: ${tabLabel}`,
    metadata: {
      action: 'tab_switch',
      tabLabel,
      tabHref: toHref,
    },
  });
}

export function trackUsagePageDwell(
  path: string,
  search: string,
  label: string,
  durationMs: number
): void {
  if (durationMs < 1000) return;

  void sendUsageEvent({
    eventType: 'action',
    path,
    search: search || null,
    label,
    durationMs,
    metadata: {
      action: 'page_dwell',
    },
  });
}

export function trackUsageClientPageView(
  path: string,
  search: string,
  label: string,
  referrerPath: string | null
): void {
  void sendUsageEvent({
    eventType: 'page_view',
    path,
    search: search || null,
    label,
    referrerPath,
    metadata: { source: 'client' },
  });
}

export function trackUsageModalOpen(modalId: string, label: string, pagePath: string): void {
  void sendUsageEvent({
    eventType: 'action',
    path: pagePath,
    label,
    metadata: {
      action: 'modal_open',
      modalId,
      modalLabel: label,
    },
  });
}

export function trackUsageModalDwell(
  modalId: string,
  label: string,
  pagePath: string,
  durationMs: number
): void {
  if (durationMs < 500) return;

  void sendUsageEvent({
    eventType: 'action',
    path: pagePath,
    label,
    durationMs,
    metadata: {
      action: 'modal_dwell',
      modalId,
      modalLabel: label,
    },
  });
}

/** Registra la selección o filtro aplicado dentro de un modal (no solo apertura). */
export function trackUsageModalApply(
  modalId: string,
  modalLabel: string,
  pagePath: string,
  applySummary: string,
  extra?: Record<string, string | null | undefined>
): void {
  const summary = applySummary.trim();
  if (!summary) return;

  void sendUsageEvent({
    eventType: 'action',
    path: pagePath,
    label: `${summary} · ${modalLabel}`,
    metadata: {
      action: 'modal_apply',
      modalId,
      modalLabel,
      applySummary: summary,
      ...extra,
    },
  });
}

export function trackGeofenceRejection(
  action: GeofenceClockAction,
  lat: number,
  lng: number,
  distanceMeters: number,
  pagePath: string,
): void {
  void sendUsageEvent({
    eventType: 'action',
    path: pagePath,
    label: `Fichaje ${action === 'in' ? 'entrada' : 'salida'} rechazado (GPS)`,
    metadata: {
      action: 'geofence_rejected',
      clockAction: action,
      lat,
      lng,
      distanceMeters: Math.round(distanceMeters),
      maxDistanceMeters: MAX_DISTANCE_METERS,
    },
  });
}

export function trackUsageLogin(path = '/login'): void {
  void sendUsageEvent({
    eventType: 'login',
    path,
    label: 'Inicio de sesión',
    metadata: { source: 'client' },
  });
}
