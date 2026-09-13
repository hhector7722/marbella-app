'use client';

import Image from 'next/image';

const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';

export default function CameraLive() {
  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center">
        <header className="flex w-full items-center justify-center py-1.5" aria-label="Cámara en directo">
          <Image
            src="/icons/live.png"
            alt="LIVE"
            width={64}
            height={14}
            className="h-auto w-[56px] object-contain sm:w-[64px]"
            priority
          />
        </header>

        <section className="w-full overflow-hidden rounded-xl border-[0.5px] border-white/90 bg-black">
          <div className="relative aspect-[1536/432] w-full overflow-hidden rounded-[inherit] bg-black">
            <video
              className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
              src={CAMERA_MP4_URL}
              autoPlay
              muted
              playsInline
              controls={false}
              preload="none"
              aria-label="Cámara sala en directo"
            />
          </div>
        </section>
      </div>
    </main>
  );
}
