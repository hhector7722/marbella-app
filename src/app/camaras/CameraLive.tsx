'use client';

import Image from 'next/image';
import { CAMERA_LIVE_URL } from '@/lib/cameras/access';

export default function CameraLive() {
  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center gap-3">
        <header className="flex w-full items-center justify-center pt-1" aria-label="Cámara en directo">
          <Image
            src="/icons/live.png"
            alt="LIVE"
            width={72}
            height={16}
            className="h-auto w-[64px] object-contain sm:w-[72px]"
            priority
          />
        </header>

        <section className="w-full overflow-hidden rounded-2xl border border-white/90 bg-black">
          <div className="relative aspect-[1536/432] w-full overflow-hidden rounded-[inherit] bg-black">
            <iframe
              title="Cámara sala"
              src={CAMERA_LIVE_URL}
              className="absolute inset-0 h-full w-full rounded-[inherit] border-0"
              allow="autoplay; fullscreen; microphone"
              referrerPolicy="no-referrer"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
