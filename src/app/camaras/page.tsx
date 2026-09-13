import Image from 'next/image';
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
    <main className="min-h-screen px-2 pb-6 pt-4 md:px-3 lg:px-4">
      <div className="mx-auto w-full max-w-[1800px] space-y-5">
        <header className="flex items-center justify-center gap-2 text-center">
          <h1
            className="font-[var(--font-easports)] text-2xl leading-none md:text-3xl"
            style={{ fontFamily: 'var(--font-easports)' }}
          >
            Cámara
          </h1>
          <Image
            src="/icons/live.png"
            alt="Live"
            width={48}
            height={24}
            className="h-5 w-auto md:h-6"
            priority
          />
        </header>

        <section className="overflow-hidden rounded-2xl border border-white/50 bg-black">
          <iframe
            title="Cámara sala"
            src={CAMERA_LIVE_URL}
            className="block aspect-[1536/432] w-full scale-[1.001]"
            allow="autoplay; fullscreen; microphone"
            referrerPolicy="no-referrer"
          />
        </section>
      </div>
    </main>
  );
}
