import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { resolveSessionUser } from '@/lib/auth/resolve-session-user';
import { canAccessCameras, CAMERA_LIVE_URL } from '@/lib/cameras/access';

export default async function CamerasPage() {
  const supabase = await createClient();
  const user = await resolveSessionUser(supabase);

  if (!user) redirect('/login');

  const allowed = await canAccessCameras(supabase, user.id);
  if (!allowed) redirect('/dashboard');

  return (
    <main className="min-h-screen p-4 md:p-6">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <header>
          <h1 className="text-2xl font-semibold">Cámaras</h1>
          <p className="text-sm opacity-70">Vista en directo</p>
        </header>

        <section className="overflow-hidden rounded-2xl border bg-black">
          <iframe
            title="Cámara sala"
            src={CAMERA_LIVE_URL}
            className="aspect-video w-full"
            allow="autoplay; fullscreen; microphone"
            referrerPolicy="no-referrer"
          />
        </section>
      </div>
    </main>
  );
}
