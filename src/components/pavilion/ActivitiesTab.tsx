
import type { BarActivity } from '@/app/staff/actividades/unify';
import { ActivityTimelineCard } from './ActivityTimelineCard';

export interface UnifiedActivity {
  activityName: string;
  activityIcon: string | null;
  startTime: string;
  endTime: string;
  venueCodes: string[];
  isUnified?: boolean;
  originalNames: string[];
  modified?: boolean;
  name?: string;
}

export interface UnifyResult {
  unified: UnifiedActivity[];
  conflicts: ActivityConflict[];
}

export interface ActivityConflict {
  activity1: UnifiedActivity;
  activity2: UnifiedActivity;
  similarity: number;
}

export function ActivitiesTab({ activities }: { activities: BarActivity[] }) {
  if (activities.length === 0) {
    return (
      <div className="px-4 py-12 text-center">
        <p className="text-xs font-bold text-zinc-400">
          No hi ha activitats de bar per aquest dia.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 px-4 py-4">
      {activities.map((activity, index) => (
        <ActivityTimelineCard
          key={`${activity.activityName}-${activity.startTime}-${activity.endTime}-${index}`}
          activity={activity}
        />
      ))}
    </div>
  );
}

/**
 * Unifies activities with similar names and location
 * Returns unified activities and any conflicts that need manual resolution
 */
export function unifyActivities(
  activities: BarActivity[],
  similarityThreshold: number = 0.8
): UnifyResult {
  const unified: UnifiedActivity[] = [];
  const conflicts: ActivityConflict[] = [];
  const processed = new Set<number>();

  // Helper functions
  const normalize = (str: string): string =>
    str
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s]/g, '');

  const similarity = (a: string, b: string): number => {
    const normA = normalize(a);
    const normB = normalize(b);
    
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
  };

  for (let i = 0; i < activities.length; i++) {
    if (processed.has(i)) continue;

    const current = activities[i];
    const group = [current];
    processed.add(i);

    // Find similar activities
    for (let j = i + 1; j < activities.length; j++) {
      if (processed.has(j)) continue;

      const other = activities[j];
      const nameSim = similarity(current.activityName, other.activityName);

      if (nameSim >= similarityThreshold && current.venueCodes.some(vc => other.venueCodes.includes(vc))) {
        // Merge activities
        group.push(other);
        processed.add(j);

        // Merge venues
        current.venueCodes = [...new Set([...current.venueCodes, ...other.venueCodes])];

        // Merge time ranges
        const curStartH = parseInt(current.startTime.split(':')[0]);
        const curStartM = parseInt(current.startTime.split(':')[1]);
        const curEndH = parseInt(current.endTime.split(':')[0]);
        const curEndM = parseInt(current.endTime.split(':')[1]);

        const otherStartH = parseInt(other.startTime.split(':')[0]);
        const otherStartM = parseInt(other.startTime.split(':')[1]);
        const otherEndH = parseInt(other.endTime.split(':')[0]);
        const otherEndM = parseInt(other.endTime.split(':')[1]);

        const startH = Math.min(curStartH, otherStartH);
        const startM = curStartH === otherStartH ? Math.min(curStartM, otherStartM) : (curStartH < otherStartH ? curStartM : otherStartM);

        let endH = Math.max(curEndH, otherEndH);
        let endM = curEndH === otherEndH ? Math.max(curEndM, otherEndM) : (curEndH > otherEndH ? curEndM : otherEndM);

        // Ensure minimum duration of 30 minutes
        if (endM % 30 !== 0) {
          const minutes = Math.round(endM / 30) * 30;
          if (minutes < 60) {
            endH += Math.floor(minutes / 60);
            endM = minutes % 60;
          } else {
            endH += Math.floor(minutes / 60);
            endM = minutes % 60;
          }
        }

        current.startTime = formatTime(startH, startM);
        current.endTime = formatTime(endH, endM);

        if (current.activityIcon === null) {
          current.activityIcon = other.activityIcon;
        }
      } else {
        // Too different, could be a conflict
        if (nameSim > 0.6) {
          conflicts.push({
            activity1: { ...current, originalNames: [current.activityName] },
            activity2: { ...other, originalNames: [other.activityName] },
            similarity: nameSim,
          });
        }
      }
    }

    // Get unique activity names from the group
    const uniqueNames = [...new Set(group.map(g => g.activityName))];

    unified.push({
      ...current,
      isUnified: group.length > 1,
      originalNames: group.map(g => g.activityName),
      name: uniqueNames.length === 1 ? uniqueNames[0] : `Unificado_${Date.now()}`, // Will be overridden by user
    });
  }

  return { unified, conflicts };
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return { hours, minutes };
}

function formatTime(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
