'use client';

import Image from 'next/image';
import { catalogTitleFont } from '@/lib/fonts/catalog-title';
import { CAMERA_LIVE_URL } from '@/lib/cameras/access';

export default function CameraLive() {
  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center gap-3">
        <header className="flex w-full items-center justify-center pt-1" aria-label="Cámara en directo">
          <h1
            className={`${catalogTitleFont.className} flex items-center justify-center gap-2 text-3xl uppercase leading-none text-white sm:text-4xl`}
          >
            <span>Cámara</span>
            <span className="relative inline-flex h-[0.8em] w-[2.45em] items-center justify-center align-middle" aria-label="LIVE">
              <Image
                src="/images/live-badge.png"
                alt="LIVE"
                fill
                className="object-contain"
                sizes="120px"
                priority
              />
            </span>
          </h1>
        </header>

        <section className="w-full overflow-hidden border-[0.5px] border-white/90 bg-black">
          <div className="relative aspect-[1536/432] w-full overflow-hidden bg-black">
            <iframe
              title="Cámara sala"
              src={CAMERA_LIVE_URL}
              className="absolute inset-0 h-full w-full border-0"
              allow="autoplay; fullscreen; microphone"
              referrerPolicy="no-referrer"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
