import type { SupabaseClient } from '@supabase/supabase-js';

export const CAMERA_LIVE_URL = 'https://video.barlamarbella.com/stream.html?src=reolink';
export const CAMERA_ALLOWED_EMAILS = new Set([
  'fogotorrat@gmail.com',
  'hhector7722@gmail.com',
]);

/**
 * Camera access is intentionally restricted to the two explicitly approved accounts.
 */
export async function canAccessCameras(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data: userResult } = await supabase.auth.getUser();
  const email = userResult.user?.email?.trim().toLowerCase();
  return Boolean(email && CAMERA_ALLOWED_EMAILS.has(email));
}
