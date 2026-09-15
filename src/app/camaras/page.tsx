import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { canAccessCameras } from '@/lib/cameras/access';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import CameraLive from './CameraLive';
import CameraRecordsButton from './CameraRecordsButton';
import CameraViewerPresence from './CameraViewerPresence';

export default async function CamerasPage() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

  if (!user) redirect('/login');

  const allowed = await canAccessCameras(supabase, user.id);
  if (!allowed) redirect('/dashboard');

  const canSeeRecords = isMasterDashboardUser(user.email);

  return (
    <div className="relative">
      <CameraViewerPresence />
      {canSeeRecords ? (
        <div className="absolute right-4 top-3 z-30">
          <CameraRecordsButton />
        </div>
      ) : null}
      <CameraLive />
    </div>
  );
}
