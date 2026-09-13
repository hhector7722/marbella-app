import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { canAccessCameras } from '@/lib/cameras/access';
import CameraLive from './CameraLive';

export default async function CamerasPage() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

  if (!user) redirect('/login');

  const allowed = await canAccessCameras(supabase, user.id);
  if (!allowed) redirect('/dashboard');

  return <CameraLive />;
}
