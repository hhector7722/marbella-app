import { deriveUsageLabel, formatDurationMs } from '@/lib/usage/labels';
import type { AppUsageEventType } from '@/lib/usage/types';

export type UsageEventRowForPresent = {
  id: string;
  event_type: AppUsageEventType;
  path: string | null;
  search: string | null;
  label: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const NOISE_PATH_PREFIXES = ['/fonts/', '/images/', '/_next/', '/icons/', '/icon', '/sw.js'];

export function isNoiseUsagePath(path: string | null): boolean {
  if (!path) return false;
  return NOISE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

function resolvePlaceName(
  path: string | null,
  label: string | null,
  metadata: Record<string, unknown> | null,
  eventType: AppUsageEventType
): string {
  if (label?.trim()) return label;
  if (path) {
    const derived = deriveUsageLabel(path, metadata as never, eventType);
    if (derived !== path) return derived;
  }
  return ' ';
}

export function formatUsageActivityTitle(row: UsageEventRowForPresent): string {
  const meta = row.metadata ?? {};
  const action = typeof meta.action === 'string' ? meta.action : null;
  const place = resolvePlaceName(row.path, row.label, meta, row.event_type);

  if (row.event_type === 'login') return 'Inicio de sesión';
  if (row.event_type === 'session') return 'Abrió la app';

  if (row.event_type === 'action') {
    if (action === 'page_dwell') {
      const duration = formatDurationMs(row.duration_ms);
      return duration.trim() ? `${duration} en ${place}` : `Tiempo en ${place}`;
    }
    if (action === 'tab_switch') {
      const tabLabel = typeof meta.tabLabel === 'string' ? meta.tabLabel : place;
      return `Pestaña ${tabLabel}`;
    }
    if (action === 'modal_open') {
      const modalLabel = typeof meta.modalLabel === 'string' ? meta.modalLabel : place;
      return `Abrió ${modalLabel}`;
    }
    if (action === 'modal_dwell') {
      const modalLabel = typeof meta.modalLabel === 'string' ? meta.modalLabel : place;
      const duration = formatDurationMs(row.duration_ms);
      return duration.trim() ? `${duration} en ${modalLabel}` : `Tiempo en ${modalLabel}`;
    }
    if (action === 'clock_in') return 'Fichó entrada';
    if (action === 'clock_out') return 'Fichó salida';
    if (action === 'consumption_saved') return 'Registró consumo';
    return place;
  }

  return `Vio ${place}`;
}

function isDuplicateEvent(
  candidate: UsageEventRowForPresent,
  included: UsageEventRowForPresent[]
): boolean {
  const candidateTs = new Date(candidate.created_at).getTime();

  for (const prev of included) {
    const prevTs = new Date(prev.created_at).getTime();
    const delta = Math.abs(prevTs - candidateTs);

    if (
      prev.path === candidate.path &&
      prev.event_type === candidate.event_type &&
      delta < 3000
    ) {
      return true;
    }

    if (
      candidate.event_type === 'page_view' &&
      prev.event_type === 'action' &&
      prev.metadata?.action === 'tab_switch' &&
      delta < 5000
    ) {
      const tabHref = (prev.metadata?.tabHref as string | undefined) ?? prev.path;
      if (tabHref === candidate.path) return true;
    }
  }

  return false;
}

export function buildUsageRecentFeed(
  rows: UsageEventRowForPresent[],
  limit = 80
): Array<{ id: string; title: string; createdAt: string }> {
  const included: UsageEventRowForPresent[] = [];
  const feed: Array<{ id: string; title: string; createdAt: string }> = [];

  for (const row of rows) {
    if (isNoiseUsagePath(row.path)) continue;
    if (isDuplicateEvent(row, included)) continue;

    included.push(row);
    feed.push({
      id: row.id,
      title: formatUsageActivityTitle(row),
      createdAt: row.created_at,
    });

    if (feed.length >= limit) break;
  }

  return feed;
}
