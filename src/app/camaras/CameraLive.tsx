'use client';

import Image from 'next/image';
import CameraPlayer from './CameraPlayer';

export default function CameraLive() {
  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center gap-3">
        <header className="flex w-full items-center justify-center pt-1" aria-label="Cámara en directo">
          <Image
            src="/icons/live.png"
            alt="LIVE"
            width={120}
            height={27}
            className="h-auto w-[96px] object-contain sm:w-[120px]"
            priority
          />
        </header>

        <section className="w-full overflow-hidden rounded-2xl border border-white/90 bg-black">
          <div className="relative aspect-[1536/432] w-full overflow-hidden rounded-[inherit] bg-black">
            <CameraPlayer />
          </div>
        </section>
      </div>
    </main>
  );
}
