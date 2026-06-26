export interface BarActivity {
  activityName: string;
  activityIcon: string | null;
  startTime: string;
  endTime: string;
  venueCodes: string[];
}

export interface DayCalendarData {
  date: string;
  totalCount: number;
  barActivities: BarActivity[];
}

export interface DayDetail {
  date: string;
  barActivities: BarActivity[];
  hasPdf: boolean;
  pdfFilePath: string | null;
  pdfFilename: string | null;
  summary: {
    totalCount: number;
    barCount: number;
    uniqueVenues: number;
    peakHour: string;
    peakCount: number;
    venueUsage: { venueCode: string; count: number }[];
    hourlyBreakdown: { hour: string; count: number }[];
  };
}

export interface PavilionActivityRow {
  activityDate: string;
  filePath: string;
  source: 'email' | 'manual';
  originalFilename: string | null;
}

export interface VenueOption {
  id: string;
  code: string;
  name?: string;
}

export interface UnifiedActivity extends BarActivity {
  isUnified?: boolean;
  originalNames?: string[];
  modified?: boolean;
}

export interface ActivityConflict {
  activity1: UnifiedActivity;
  activity2: UnifiedActivity;
  similarity: number;
}

export interface UnifyResult {
  unified: UnifiedActivity[];
  conflicts?: ActivityConflict[];
}

export interface UpdateHoursParams {
  activityId: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  activityName?: string;
  activityIcon?: string | null;
}

function normalizeForMatch(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9\s]/g, '');
}

function similarityScore(a: string, b: string): number {
  const normA = normalizeForMatch(a);
  const normB = normalizeForMatch(b);

  if (normA === normB) return 1.0;
  if (!normA || !normB) return 0;

  const maxLen = Math.max(normA.length, normB.length);
  const longer = normA.length >= normB.length ? normA : normB;
  const shorter = normA.length < normB.length ? normA : normB;

  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    for (let j = 0; j < longer.length; j++) {
      if (shorter[i] === longer[j]) {
        matches++;
        break;
      }
    }
  }

  return matches / maxLen;
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function formatTime(hours: number, minutes: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function buildHourlyBreakdown(
  activities: BarActivity[],
): { hour: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const activity of activities) {
    const { hours } = parseTime(activity.startTime);
    const hour = `${String(hours).padStart(2, '0')}:00`;
    counts.set(hour, (counts.get(hour) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour, count }));
}

export function buildVenueUsage(
  activities: BarActivity[],
): { venueCode: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const activity of activities) {
    for (const venueCode of activity.venueCodes) {
      counts.set(venueCode, (counts.get(venueCode) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([venueCode, count]) => ({ venueCode, count }));
}

export function unifyActivities(
  activities: BarActivity[],
  similarityThreshold: number = 0.8,
  venueOverlapThreshold: number = 0.5,
): UnifyResult {
  const unified: UnifiedActivity[] = [];
  const conflicts: ActivityConflict[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < activities.length; i++) {
    if (processed.has(i)) continue;

    const current = activities[i];
    const group = [current];
    processed.add(i);

    // Find similar activities
    for (let j = i + 1; j < activities.length; j++) {
      if (processed.has(j)) continue;

      const other = activities[j];
      const nameSim = similarityScore(current.activityName, other.activityName);

      // Check if activities share at least one venue
      const sharedVenues = current.venueCodes.filter((vc) => other.venueCodes.includes(vc));
      const venueOverlap =
        sharedVenues.length / Math.max(current.venueCodes.length, other.venueCodes.length);

      if (nameSim >= similarityThreshold && venueOverlap >= venueOverlapThreshold) {
        // Merge activities - update the current one with merged data
        current.venueCodes = [...new Set([...current.venueCodes, ...other.venueCodes])];

        // Merge time ranges
        const curStart = parseTime(current.startTime);
        const curEnd = parseTime(current.endTime);
        const otherStart = parseTime(other.startTime);
        const otherEnd = parseTime(other.endTime);

        const startH = Math.min(curStart.hours, otherStart.hours);
        const startM =
          curStart.hours === otherStart.hours
            ? Math.min(curStart.minutes, otherStart.minutes)
            : curStart.hours < otherStart.hours
              ? curStart.minutes
              : otherStart.minutes;

        const endH = Math.max(curEnd.hours, otherEnd.hours);
        const endM =
          curEnd.hours === otherEnd.hours
            ? Math.max(curEnd.minutes, otherEnd.minutes)
            : curEnd.hours > otherEnd.hours
              ? curEnd.minutes
              : otherEnd.minutes;

        // Ensure minimum duration of 30 minutes and round to nearest 30 min
        const totalMinutes = endH * 60 + endM - (startH * 60 + startM);
        const roundedMinutes = Math.ceil(totalMinutes / 30) * 30;
        const newEndH = startH + Math.floor(roundedMinutes / 60);
        const newEndM = roundedMinutes % 60;

        current.startTime = formatTime(startH, startM);
        current.endTime = formatTime(newEndH, newEndM);

        // Keep the non-null icon if one is null
        if (current.activityIcon === null && other.activityIcon !== null) {
          current.activityIcon = other.activityIcon;
        }

        processed.add(j);
      } else if (nameSim > 0.6 && sharedVenues.length === 0) {
        // Check if it's a potential conflict (high name similarity but no venue overlap)
        conflicts.push({
          activity1: { ...current, originalNames: [current.activityName] },
          activity2: { ...other, originalNames: [other.activityName] },
          similarity: nameSim,
        });
      }
    }

    unified.push({
      ...current,
      isUnified: group.length > 1,
      originalNames: group.map((g) => g.activityName),
      modified: false,
    });
  }

  return { unified, conflicts };
}
