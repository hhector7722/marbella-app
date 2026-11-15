import { MAX_DISTANCE_METERS, type GeofenceClockAction } from '@/lib/location';
import type { UsageClientEventPayload } from '@/lib/usage/types';
import {
  isUsageTrackingId,
  USAGE_BROWSER_COOKIE,
  USAGE_BROWSER_SESSION_COOKIE,
} from '@/lib/usage/browser-context';
import { isTabSessionOccupied, shouldAcknowledgeTabClaim, type UsageTabSignal } from '@/lib/usage/tab-isolation';

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

const USAGE_BROWSER_KEY = 'mb_usage_browser_v1';

function readUsageCookie(name: string): string | null {
  const value = document.cookie.split('; ')
    .find((entry) => entry.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return isUsageTrackingId(value) ? value : null;
}

function writeBrowserCookie(id: string): void {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${USAGE_BROWSER_COOKIE}=${id}; Path=/; Max-Age=2592000; SameSite=Lax${secure}`;
}
let fallbackBrowserId: string | null = null;

/** Identificador anónimo del navegador; distinto del identificador de cada sesión/pestaña. */
function currentBrowserId(): string {
  // La cookie emitida por el proxy tiene prioridad: ambos extremos
  // deben registrar EXACTAMENTE el mismo identificador de navegador.
  const cookieId = readUsageCookie(USAGE_BROWSER_COOKIE);
  if (cookieId) return cookieId;

  let id = fallbackBrowserId;
  if (!id) {
    try {
      const stored = localStorage.getItem(USAGE_BROWSER_KEY);
      id = isUsageTrackingId(stored) ? stored : crypto.randomUUID();
      localStorage.setItem(USAGE_BROWSER_KEY, id);
    } catch {
      id = crypto.randomUUID();
    }
    fallbackBrowserId = id;
  }
  // Si el proxy no había emitido cookie (p.ej. primera página tras login),
  // se establece ahora para que la siguiente petición del proxy la reciba.
  try { writeBrowserCookie(id); } catch { /* Seguimiento no bloqueante */ }
  return id;
}

/**
 * UA no siempre distingue iPad/móvil con modo escritorio.
 * La señal de pantalla/táctil ayuda a identificar futuros eventos sin
 * atribuir retrospectivamente dispositivos a registros desconocidos.
 */
function clientDeviceEvidence(): { clientDeviceType: 'smartphone' | 'tablet' | 'desktop'; deviceEvidence: string } {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const touch = navigator.maxTouchPoints ?? 0;
  const width = window.screen?.width || 0;
  const mobileHint = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData?.mobile === true;
  if (mobileHint || /iPhone|iPod|Android.*Mobile|Windows Phone/i.test(ua)) {
    return { clientDeviceType: 'smartphone', deviceEvidence: 'mobile-ua' };
  }
  if (/iPad|Tablet|Kindle|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return { clientDeviceType: 'tablet', deviceEvidence: 'tablet-ua' };
  }
  if (/MacIntel/i.test(platform) && touch >= 2 && width > 0) {
    return { clientDeviceType: width <= 600 ? 'smartphone' : 'tablet', deviceEvidence: 'mac-touch' };
  }
  return { clientDeviceType: 'desktop', deviceEvidence: 'desktop-ua' };
}


const USAGE_TAB_CHANNEL = 'mb_usage_tab_exclusivity_v1';
let tabRuntimeId: string | null = null;
let activeTabSessionId: string | null = null;
let tabChannel: BroadcastChannel | null = null;
let sessionHandshake: Promise<void> | null = null;

function tabRuntimeIdentifier(): string {
  tabRuntimeId ??= crypto.randomUUID();
  return tabRuntimeId;
}

function rotateCopiedSession(): void {
  const next = { id: crypto.randomUUID(), last: Date.now() };
  activeTabSessionId = next.id;
  fallbackSession = next;
  try { sessionStorage.setItem(USAGE_TAB_SESSION_KEY, JSON.stringify(next)); } catch {
    // Entornos que bloquean sessionStorage.
  }
}

/** Antes del primer evento detecta si otra pestaña activa heredó el mismo ID. */
function ensureUniqueTabSession(): Promise<void> {
  if (sessionHandshake) return sessionHandshake;
  sessionHandshake = new Promise<void>((resolve) => {
    activeTabSessionId = currentUsageSessionId();
    if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
      resolve();
      return;
    }
    try {
      const self = tabRuntimeIdentifier();
      const current = new BroadcastChannel(USAGE_TAB_CHANNEL);
      tabChannel = current;
      let collision = false;

      current.onmessage = (event: MessageEvent<UsageTabSignal>) => {
        const signal = event.data;
        if (!signal || typeof signal !== 'object') return;
        if (shouldAcknowledgeTabClaim(signal, activeTabSessionId ?? '', self)) {
          current.postMessage({
            kind: 'occupied', sessionId: signal.sessionId, targetId: signal.runtimeId,
          } satisfies UsageTabSignal);
        }
        if (isTabSessionOccupied(signal, activeTabSessionId ?? '', self)) {
          collision = true;
        }
      };

      current.postMessage({
        kind: 'claim', sessionId: activeTabSessionId, runtimeId: self,
      } satisfies UsageTabSignal);
      window.setTimeout(() => {
        if (collision) rotateCopiedSession();
        resolve();
      }, 140);
    } catch {
      tabChannel?.close();
      tabChannel = null;
      resolve();
    }
  });
  return sessionHandshake;
}

const RETRY_DELAYS_MS = [0, 450, 1500] as const;
function usageDelay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function sendUsageEvent(payload: UsageClientEventPayload): Promise<void> {
  try {
    await ensureUniqueTabSession();
    const browserSessionId = readUsageCookie(USAGE_BROWSER_SESSION_COOKIE);
    // Se crea el ID una sola vez: todos los reintentos envían el mismo body.
    const body = JSON.stringify({
      ...payload,
      metadata: {
        ...payload.metadata,
        ...clientDeviceEvidence(),
        usageEventId: crypto.randomUUID(),
        usageBrowserId: currentBrowserId(),
        ...(browserSessionId ? { usageBrowserSessionId: browserSessionId } : {}),
        usageSessionId: currentUsageSessionId(),
        source: 'client',
      },
    });

    for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt += 1) {
      if (attempt) await usageDelay(RETRY_DELAYS_MS[attempt]);
      try {
        const response = await fetch('/api/usage/event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          cache: 'no-store',
          keepalive: true,
        });
        if (response.ok) return;
        if (response.status !== 429 && response.status < 500) {
          console.warn('[usage] movimiento rechazado', response.status, payload.eventType);
          return;
        }
      } catch {
        // Error transitorio de red; siguiente intento reutiliza el mismo ID.
      }
    }
    console.error('[usage] movimiento no confirmado tras reintentos', payload.eventType);
  } catch (error) {
    // El tracking no bloquea las operaciones del usuario.
    console.error('[usage] no se pudo enviar movimiento', payload.eventType, error);
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
