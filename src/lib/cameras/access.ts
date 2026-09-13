import type { SupabaseClient } from '@supabase/supabase-js';

export const CAMERA_LIVE_URL = 'https://video.barlamarbella.com/stream.html?src=reolink';

/**
 * Camera access follows Marbella's normative role model:
 * only manager/admin can access management surfaces.
 */
export async function canAccessCameras(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) return false;

  return data?.role === 'manager' || data?.role === 'admin';
}
