import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveUsageLabel } from '@/lib/usage/labels';
import type { AppUsageEventInput, AppUsageEventType } from '@/lib/usage/types';
import { createClient } from '@/utils/supabase/server';

export type { AppUsageEventType };

export async function recordAppUsageEventWithClient(
  supabase: SupabaseClient,
  profileId: string,
  input: AppUsageEventInput
): Promise<void> {
  const path = input.path ?? null;
  const label =
    input.label ??
    deriveUsageLabel(path ?? '', input.metadata ?? null, input.eventType);

  const { error } = await supabase.from('app_usage_events').insert({
    profile_id: profileId,
    event_type: input.eventType,
    path,
    label,
    search: input.search ?? null,
    referrer_path: input.referrerPath ?? null,
    duration_ms: input.durationMs ?? null,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.error('[usage] record failed:', error.message);
  }
}

export async function recordAppUsageEvent(
  profileId: string,
  eventType: AppUsageEventType,
  path?: string | null,
  extra?: Omit<AppUsageEventInput, 'eventType' | 'path'>
): Promise<void> {
  const supabase = await createClient();
  await recordAppUsageEventWithClient(supabase, profileId, {
    eventType,
    path,
    ...extra,
  });
}
