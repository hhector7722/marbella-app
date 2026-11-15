import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveUsageLabel } from '@/lib/usage/labels';
import type { AppUsageEventInput, AppUsageEventType } from '@/lib/usage/types';
import { createClient } from '@/utils/supabase/server';
import { isUsageTrackingId } from '@/lib/usage/browser-context';

export type { AppUsageEventType };

export async function recordAppUsageEventWithClient(
  supabase: SupabaseClient,
  profileId: string,
  input: AppUsageEventInput,
  options: { strict?: boolean } = {},
): Promise<void> {
  const path = input.path ?? null;
  const label =
    input.label ??
    deriveUsageLabel(path ?? '', input.metadata ?? null, input.eventType);

  const candidateId = input.metadata?.usageEventId;
  const eventId = isUsageTrackingId(candidateId) ? candidateId : null;
  const { error } = await supabase.from('app_usage_events').insert({
    ...(eventId ? { id: eventId } : {}),
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
    // El mismo ID en un reintento confirma que el evento ya se insertó.
    if (eventId && error.code === '23505') return;
    console.error('[usage] record failed:', error.code ?? 'unknown', error.message);
    if (options.strict) throw new Error('No se pudo persistir el evento de uso');
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
