import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { MASTER_VIEW_AS_COOKIE } from '@/lib/master-view-as';

export const CAMERA_LIVE_URL = 'https://video.barlamarbella.com/stream.html?src=reolink';
export const CAMERA_ACCESS_EMAILS = new Set([
  'fogotorrat@gmail.com',
  'hhector7722@gmail.com',
]);

/**
 * Camera access is intentionally narrower than the general management role model.
 * Only the two explicitly approved effective accounts can access the camera surface.
 * When Master is using view-as, permissions must follow the simulated user.
 */
export async function canAccessCameras(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: actorProfile, error } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();

  if (error) return false;

  const actorEmail = actorProfile?.email?.trim().toLowerCase();
  if (!actorEmail) return false;

  let effectiveEmail = actorEmail;

  if (isMasterDashboardUser(actorEmail)) {
    const cookieStore = await cookies();
    const viewAsUserId = cookieStore.get(MASTER_VIEW_AS_COOKIE)?.value?.trim() || null;

    if (viewAsUserId && viewAsUserId !== userId) {
      const { data: viewedProfile, error: viewedProfileError } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', viewAsUserId)
        .maybeSingle();

      if (viewedProfileError || !viewedProfile?.email) return false;
      effectiveEmail = viewedProfile.email.trim().toLowerCase();
    }
  }

  return CAMERA_ACCESS_EMAILS.has(effectiveEmail);
}
