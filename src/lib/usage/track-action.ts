import { recordAppUsageEvent } from '@/lib/usage/record';
import type { AppUsageEventInput } from '@/lib/usage/types';

export async function trackUsageAction(
  profileId: string,
  input: Omit<AppUsageEventInput, 'eventType'> & { eventType?: 'action' }
): Promise<void> {
  await recordAppUsageEvent(profileId, 'action', input.path ?? null, {
    label: input.label,
    search: input.search,
    referrerPath: input.referrerPath,
    durationMs: input.durationMs,
    metadata: input.metadata,
  });
}
