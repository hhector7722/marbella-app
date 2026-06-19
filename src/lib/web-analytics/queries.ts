import 'server-only';

import { fromZonedTime } from 'date-fns-tz';
import {
  buildWebRecentFeed,
  hasMoreWebRecentFeed,
  summarizeWebBreakdown,
} from '@/lib/web-analytics/present';
import {
  WEB_ANALYTICS_RECENT_PAGE_SIZE,
  type WebAnalyticsDashboardData,
  type WebAnalyticsDashboardFilters,
  type WebAnalyticsEventRow,
  type WebAnalyticsRecentEvent,
} from '@/lib/web-analytics/types';
import { createClient } from '@/utils/supabase/server';

export { WEB_ANALYTICS_RECENT_PAGE_SIZE };
export type {
  WebAnalyticsDashboardData,
  WebAnalyticsDashboardFilters,
  WebAnalyticsRecentEvent,
};

const MADRID_TZ = 'Europe/Madrid';

function formatDateTimeMadrid(iso: string): string {
  return new Intl.DateTimeFormat('es-ES', {
    timeZone: MADRID_TZ,
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

export function todayMadridDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MADRID_TZ }).format(new Date());
}

function madridDayRange(day: string): { start: string; end: string } {
  const start = fromZonedTime(`${day}T00:00:00`, MADRID_TZ);
  const end = fromZonedTime(`${day}T23:59:59.999`, MADRID_TZ);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function parseWebAnalyticsFilters(searchParams: {
  dia?: string;
}): WebAnalyticsDashboardFilters {
  const day = searchParams.dia?.trim() || null;
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return { day: null };
  }
  return { day };
}

async function fetchWebAnalyticsRows(filters: WebAnalyticsDashboardFilters): Promise<WebAnalyticsEventRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from('web_analytics_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000);

  if (filters.day) {
    const { start, end } = madridDayRange(filters.day);
    query = query.gte('created_at', start).lte('created_at', end);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as WebAnalyticsEventRow[];
}

function computeTotals(rows: WebAnalyticsEventRow[]) {
  const visitors = new Set<string>();
  const sessions = new Set<string>();
  let pageViews = 0;
  let clicks = 0;
  let actions = 0;
  const sessionDurations = new Map<string, number>();

  for (const row of rows) {
    visitors.add(row.visitor_id);
    sessions.add(row.session_id);

    if (row.event_type === 'page_view') pageViews += 1;
    if (row.event_type === 'click') clicks += 1;
    if (row.event_type === 'action') {
      actions += 1;
      const action = typeof row.metadata?.action === 'string' ? row.metadata.action : null;
      if (action === 'page_dwell' || action === 'modal_dwell') {
        const duration = row.duration_ms ?? 0;
        sessionDurations.set(row.session_id, (sessionDurations.get(row.session_id) ?? 0) + duration);
      }
    }
  }

  const durationValues = [...sessionDurations.values()];
  const avgSessionMs =
    durationValues.length > 0
      ? Math.round(durationValues.reduce((sum, value) => sum + value, 0) / durationValues.length)
      : 0;

  return {
    visitors: visitors.size,
    sessions: sessions.size,
    pageViews,
    clicks,
    actions,
    avgSessionMs,
  };
}

export async function getWebAnalyticsDashboardData(
  filters: WebAnalyticsDashboardFilters
): Promise<WebAnalyticsDashboardData> {
  const rows = await fetchWebAnalyticsRows(filters);
  const recentFeed = buildWebRecentFeed(rows, WEB_ANALYTICS_RECENT_PAGE_SIZE, 0);

  return {
    filters,
    recentEvents: recentFeed.map((item) => ({
      ...item,
      timeLabel: formatDateTimeMadrid(item.createdAt),
    })),
    recentHasMore: hasMoreWebRecentFeed(rows, 0, WEB_ANALYTICS_RECENT_PAGE_SIZE),
    totals: computeTotals(rows),
    topPages: summarizeWebBreakdown(rows, 'path'),
    topReferrers: summarizeWebBreakdown(rows, 'external_referrer'),
    topDevices: summarizeWebBreakdown(rows, 'device_type'),
    topSources: summarizeWebBreakdown(rows, 'utm_source'),
    topLocales: summarizeWebBreakdown(rows, 'locale'),
  };
}

export async function getWebAnalyticsRecentEventsPage(
  filters: WebAnalyticsDashboardFilters,
  offset: number,
  limit: number
): Promise<{ events: WebAnalyticsRecentEvent[]; hasMore: boolean }> {
  const rows = await fetchWebAnalyticsRows(filters);
  const feed = buildWebRecentFeed(rows, limit, offset);

  return {
    events: feed.map((item) => ({
      ...item,
      timeLabel: formatDateTimeMadrid(item.createdAt),
    })),
    hasMore: hasMoreWebRecentFeed(rows, offset, limit),
  };
}
