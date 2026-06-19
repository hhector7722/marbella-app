export const WEB_ANALYTICS_RECENT_PAGE_SIZE = 40;

export type WebAnalyticsDashboardFilters = {
  day: string | null;
};

export type WebAnalyticsRecentEvent = {
  id: string;
  title: string;
  createdAt: string;
  timeLabel: string;
};

export type WebAnalyticsDashboardData = {
  filters: WebAnalyticsDashboardFilters;
  recentEvents: WebAnalyticsRecentEvent[];
  recentHasMore: boolean;
  totals: {
    visitors: number;
    sessions: number;
    pageViews: number;
    clicks: number;
    actions: number;
    avgSessionMs: number;
  };
  topPages: Array<{ label: string; count: number }>;
  topReferrers: Array<{ label: string; count: number }>;
  topDevices: Array<{ label: string; count: number }>;
  topSources: Array<{ label: string; count: number }>;
  topLocales: Array<{ label: string; count: number }>;
};

export type WebAnalyticsEventType = 'session' | 'page_view' | 'click' | 'action';

export type WebAnalyticsEventRow = {
  id: string;
  visitor_id: string;
  session_id: string;
  event_type: WebAnalyticsEventType;
  path: string | null;
  label: string | null;
  search: string | null;
  referrer_path: string | null;
  external_referrer: string | null;
  duration_ms: number | null;
  locale: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string | null;
  viewport_width: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};
