export type AppUsageEventType = 'login' | 'session' | 'page_view' | 'action';

export type AppUsageActionKind =
  | 'tab_switch'
  | 'page_dwell'
  | 'modal_open'
  | 'modal_dwell'
  | 'modal_apply'
  | 'clock_in'
  | 'clock_out'
  | 'consumption_saved'
  | 'geofence_rejected';

export type AppUsageMetadata = {
  action?: AppUsageActionKind;
  modalId?: string;
  modalLabel?: string;
  /** Valor legible de la selección o filtro aplicado (ej. nombre trabajador, mes). */
  applySummary?: string;
  tabLabel?: string;
  tabHref?: string;
  source?: 'client' | 'middleware' | 'server';
  [key: string]: string | number | boolean | null | undefined;
};

export type AppUsageEventInput = {
  eventType: AppUsageEventType;
  path?: string | null;
  label?: string | null;
  search?: string | null;
  referrerPath?: string | null;
  durationMs?: number | null;
  metadata?: AppUsageMetadata;
};

export type UsageClientEventPayload = AppUsageEventInput;
