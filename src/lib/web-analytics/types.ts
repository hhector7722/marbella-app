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
