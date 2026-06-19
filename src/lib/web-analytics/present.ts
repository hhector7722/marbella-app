import { deriveWebPathLabel, formatDurationMs } from '@/lib/web-analytics/labels';
import type { WebAnalyticsEventRow, WebAnalyticsEventType } from '@/lib/web-analytics/types';

export type WebAnalyticsEventRowForPresent = Pick<
  WebAnalyticsEventRow,
  | 'id'
  | 'event_type'
  | 'path'
  | 'label'
  | 'duration_ms'
  | 'metadata'
  | 'created_at'
  | 'external_referrer'
  | 'device_type'
  | 'locale'
>;

const NOISE_PATH_PREFIXES = ['/_next/', '/images/', '/fonts/'];

export function isNoiseWebPath(path: string | null): boolean {
  if (!path) return false;
  return NOISE_PATH_PREFIXES.some((prefix) => path.startsWith(prefix));
}

export function formatWebActivityTitle(row: WebAnalyticsEventRowForPresent): string {
  const meta = row.metadata ?? {};
  const action = typeof meta.action === 'string' ? meta.action : null;
  const place = deriveWebPathLabel(row.path ?? '/', row.label);

  if (row.event_type === 'session') return 'Nueva visita';
  if (row.event_type === 'click') return `Clic: ${place}`;

  if (row.event_type === 'action') {
    if (action === 'page_dwell') {
      const duration = formatDurationMs(row.duration_ms);
      return duration.trim() ? `${duration} en ${place}` : `Tiempo en ${place}`;
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
    return place;
  }

  return `Vio ${place}`;
}

export function buildWebRecentFeed(
  rows: WebAnalyticsEventRowForPresent[],
  limit = 80,
  offset = 0
) {
  const feed: Array<{ id: string; title: string; createdAt: string }> = [];
  let skipped = 0;

  for (const row of rows) {
    if (isNoiseWebPath(row.path)) continue;
    if (skipped < offset) {
      skipped += 1;
      continue;
    }
    feed.push({
      id: row.id,
      title: formatWebActivityTitle(row),
      createdAt: row.created_at,
    });
    if (feed.length >= limit) break;
  }

  return feed;
}

export function hasMoreWebRecentFeed(
  rows: WebAnalyticsEventRowForPresent[],
  offset: number,
  limit: number
): boolean {
  return buildWebRecentFeed(rows, limit + 1, offset).length > limit;
}

export function summarizeWebBreakdown(
  rows: WebAnalyticsEventRow[],
  key: 'path' | 'external_referrer' | 'device_type' | 'utm_source' | 'locale'
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.event_type !== 'page_view' && row.event_type !== 'click' && row.event_type !== 'session') {
      continue;
    }
    const raw = row[key];
    const label =
      key === 'path'
        ? deriveWebPathLabel(raw ?? '/', row.label)
        : raw?.trim() || 'Directo / desconocido';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

export function formatWebEventType(eventType: WebAnalyticsEventType): string {
  switch (eventType) {
    case 'session':
      return 'Visita';
    case 'page_view':
      return 'Página';
    case 'click':
      return 'Clic';
    case 'action':
      return 'Acción';
    default:
      return eventType;
  }
}
