import { fromZonedTime } from 'date-fns-tz';
import { usageDisplayName } from '@/lib/usage/display-name';
import {
  defaultUsageProfileIds,
  parseProfileIdsParam,
  resolveUsageProfileIds,
  USAGE_RECENT_PAGE_SIZE,
} from '@/lib/usage/filters';
import { buildUsageRecentFeed, hasMoreUsageRecentFeed } from '@/lib/usage/present';
import type { AppUsageEventType } from '@/lib/usage/types';
import { createClient } from '@/utils/supabase/server';

export { USAGE_RECENT_PAGE_SIZE } from '@/lib/usage/filters';

const MADRID_TZ = 'Europe/Madrid';
/** Filas por página al agregar resúmenes (PostgREST). */
const USAGE_SUMMARY_PAGE_SIZE = 1000;
/** Tope de seguridad al paginar resúmenes (evita bucles infinitos). */
const USAGE_SUMMARY_MAX_ROWS = 100_000;
/** Eventos crudos para el feed reciente (dedupe en memoria). */
const USAGE_RECENT_FETCH_LIMIT = 2000;

export type UsageFilterUser = {
  profileId: string;
  email: string;
  displayName: string;
};

export type UsageDashboardFilters = {
  /** YYYY-MM-DD civil Madrid; null = todos los días. */
  day: string | null;
  /** null = todos los usuarios seleccionados; [] = ninguno. */
  profileIds: string[] | null;
};

export type UsageUserSummary = {
  profileId: string;
  email: string;
  displayName: string;
  loginCount: number;
  sessionCount: number;
  pageViewCount: number;
  actionCount: number;
  totalEvents: number;
  lastSeenAt: string | null;
  firstSeenAt: string | null;
};

export type UsageRecentEvent = {
  id: string;
  profileId: string;
  email: string;
  displayName: string;
  title: string;
  createdAt: string;
  timeLabel: string;
};

export type UsageDashboardData = {
  summaries: UsageUserSummary[];
  recentEvents: UsageRecentEvent[];
  recentHasMore: boolean;
  filterUsers: UsageFilterUser[];
  filters: UsageDashboardFilters;
  totals: {
    activeUsers: number;
    eventsCount: number;
    sessionsCount: number;
    loginsCount: number;
    actionsCount: number;
  };
};

type UsageEventProfile = {
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type UsageEventRow = {
  id: string;
  event_type: AppUsageEventType;
  path: string | null;
  search: string | null;
  label: string | null;
  duration_ms: number | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  profile_id: string;
  profiles: UsageEventProfile | UsageEventProfile[] | null;
};

function resolveUsageEventProfile(
  profiles: UsageEventProfile | UsageEventProfile[] | null | undefined
): UsageEventProfile | null {
  if (!profiles) return null;
  return Array.isArray(profiles) ? (profiles[0] ?? null) : profiles;
}

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

function profileDisplayName(profile: UsageEventProfile | null, fallbackEmail = '?'): string {
  return usageDisplayName(profile, fallbackEmail);
}

export function parseUsageDashboardFilters(searchParams: {
  dia?: string;
  usuario?: string;
  usuarios?: string;
}): UsageDashboardFilters {
  const dayParam = searchParams.dia?.trim();
  const day =
    !dayParam || dayParam === 'todos'
      ? null
      : /^\d{4}-\d{2}-\d{2}$/.test(dayParam)
        ? dayParam
        : todayMadridDate();

  const profileIds = parseProfileIdsParam(searchParams.usuarios, searchParams.usuario);

  return { day, profileIds };
}

/**
 * Usuarios disponibles en el filtro de analytics.
 * Incluye inactivos / fuera de plantilla y nombres ocultos en selectores
 * de plantilla (p.ej. Ramon), para que el histórico de uso sea auditable.
 */
async function getUsageFilterUsers(): Promise<UsageFilterUser[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, first_name, last_name')
    .order('first_name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((profile) => ({
    profileId: profile.id,
    email: profile.email ?? '?',
    displayName: profileDisplayName(profile),
  }));
}

type UsageSummaryRow = {
  profile_id: string;
  event_type: AppUsageEventType;
  created_at: string;
};

async function fetchUsageSummaryRows(
  day: string | null,
  profileIds: string[]
): Promise<UsageSummaryRow[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const supabase = await createClient();
  const rows: UsageSummaryRow[] = [];
  let offset = 0;

  while (offset < USAGE_SUMMARY_MAX_ROWS) {
    let eventsQuery = supabase
      .from('app_usage_events')
      .select('profile_id, event_type, created_at')
      .in('profile_id', profileIds)
      .order('created_at', { ascending: false })
      .range(offset, offset + USAGE_SUMMARY_PAGE_SIZE - 1);

    if (day) {
      const { start, end } = madridDayRange(day);
      eventsQuery = eventsQuery.gte('created_at', start).lte('created_at', end);
    }

    const { data: events, error } = await eventsQuery;

    if (error) {
      throw new Error(error.message);
    }

    const page = (events ?? []) as UsageSummaryRow[];
    rows.push(...page);

    if (page.length < USAGE_SUMMARY_PAGE_SIZE) {
      break;
    }

    offset += USAGE_SUMMARY_PAGE_SIZE;
  }

  return rows;
}

async function fetchUsageEventRows(
  day: string | null,
  profileIds: string[]
): Promise<UsageEventRow[]> {
  if (profileIds.length === 0) {
    return [];
  }

  const supabase = await createClient();

  let eventsQuery = supabase
    .from('app_usage_events')
    .select(
      `
      id,
      event_type,
      path,
      search,
      label,
      duration_ms,
      metadata,
      created_at,
      profile_id,
      profiles (
        email,
        first_name,
        last_name
      )
    `
    )
    .in('profile_id', profileIds)
    .order('created_at', { ascending: false })
    .limit(USAGE_RECENT_FETCH_LIMIT);

  if (day) {
    const { start, end } = madridDayRange(day);
    eventsQuery = eventsQuery.gte('created_at', start).lte('created_at', end);
  }

  const { data: events, error } = await eventsQuery;

  if (error) {
    throw new Error(error.message);
  }

  return (events ?? []) as UsageEventRow[];
}

function mapRecentFeedToEvents(
  rows: UsageEventRow[],
  feed: ReturnType<typeof buildUsageRecentFeed>
): UsageRecentEvent[] {
  const rowById = new Map(rows.map((row) => [row.id, row]));

  return feed.map((item) => {
    const row = rowById.get(item.id);
    const profile = row ? resolveUsageEventProfile(row.profiles) : null;
    const email = profile?.email ?? '?';

    return {
      id: item.id,
      profileId: row?.profile_id ?? '',
      email,
      displayName: profileDisplayName(profile, email),
      title: item.title,
      createdAt: item.createdAt,
      timeLabel: formatDateTimeMadrid(item.createdAt),
    };
  });
}

export async function getUsageRecentEventsPage(
  filters: UsageDashboardFilters,
  offset: number,
  limit = USAGE_RECENT_PAGE_SIZE
): Promise<{ events: UsageRecentEvent[]; hasMore: boolean }> {
  const filterUsers = await getUsageFilterUsers();
  const resolvedIds = resolveUsageProfileIds(filters.profileIds, filterUsers);
  const rows = await fetchUsageEventRows(filters.day, resolvedIds);
  const feed = buildUsageRecentFeed(rows, limit, offset);
  const events = mapRecentFeedToEvents(rows, feed);
  const hasMore = hasMoreUsageRecentFeed(rows, offset, limit);

  return { events, hasMore };
}

export async function getUsageDashboardData(
  filters: UsageDashboardFilters
): Promise<UsageDashboardData> {
  const filterUsers = await getUsageFilterUsers();
  const resolvedIds = resolveUsageProfileIds(filters.profileIds, filterUsers);
  const profileById = new Map(filterUsers.map((user) => [user.profileId, user]));

  const [summaryRows, recentRows] = await Promise.all([
    fetchUsageSummaryRows(filters.day, resolvedIds),
    fetchUsageEventRows(filters.day, resolvedIds),
  ]);

  const summaryMap = new Map<string, UsageUserSummary>();

  let eventsCount = 0;
  let sessionsCount = 0;
  let loginsCount = 0;
  let actionsCount = 0;

  for (const row of summaryRows) {
    const known = profileById.get(row.profile_id);
    const email = known?.email ?? '?';
    const displayName = known?.displayName ?? email;
    const existing = summaryMap.get(row.profile_id);

    if (!existing) {
      summaryMap.set(row.profile_id, {
        profileId: row.profile_id,
        email,
        displayName,
        loginCount: row.event_type === 'login' ? 1 : 0,
        sessionCount: row.event_type === 'session' ? 1 : 0,
        pageViewCount: row.event_type === 'page_view' ? 1 : 0,
        actionCount: row.event_type === 'action' ? 1 : 0,
        totalEvents: 1,
        lastSeenAt: row.created_at,
        firstSeenAt: row.created_at,
      });
    } else {
      existing.totalEvents += 1;
      if (row.event_type === 'login') existing.loginCount += 1;
      if (row.event_type === 'session') existing.sessionCount += 1;
      if (row.event_type === 'page_view') existing.pageViewCount += 1;
      if (row.event_type === 'action') existing.actionCount += 1;
      if (row.created_at > (existing.lastSeenAt ?? '')) {
        existing.lastSeenAt = row.created_at;
      }
      if (row.created_at < (existing.firstSeenAt ?? '')) {
        existing.firstSeenAt = row.created_at;
      }
    }

    eventsCount += 1;
    if (row.event_type === 'session') sessionsCount += 1;
    if (row.event_type === 'login') loginsCount += 1;
    if (row.event_type === 'action') actionsCount += 1;
  }

  const summaries = [...summaryMap.values()].sort((a, b) => {
    const aTime = a.lastSeenAt ?? '';
    const bTime = b.lastSeenAt ?? '';
    return bTime.localeCompare(aTime);
  });

  const recentFeed = buildUsageRecentFeed(recentRows, USAGE_RECENT_PAGE_SIZE, 0);
  const recentEvents = mapRecentFeedToEvents(recentRows, recentFeed);
  const recentHasMore = hasMoreUsageRecentFeed(recentRows, 0, USAGE_RECENT_PAGE_SIZE);

  return {
    summaries,
    recentEvents,
    recentHasMore,
    filterUsers,
    filters,
    totals: {
      activeUsers: summaries.length,
      eventsCount,
      sessionsCount,
      loginsCount,
      actionsCount,
    },
  };
}
