'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';
const RECONNECT_DELAY_MS = 2500;
const WAITING_RECONNECT_DELAY_MS = 5000;

type IOSVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

export default function CameraLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const [loading, setLoading] = useState(true);

  const streamUrl = useMemo(
    () => `${CAMERA_MP4_URL}&reload=${streamVersion}`,
    [streamVersion],
  );

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const refreshStream = useCallback(() => {
    clearReconnectTimer();
    setLoading(true);
    setStreamVersion((version) => version + 1);
  }, [clearReconnectTimer]);

  const ensurePlaying = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;

    try {
      video.muted = true;
      await video.play();
    } catch {
      setLoading(true);
    }
  }, []);

  const scheduleReconnect = useCallback(
    (delay = RECONNECT_DELAY_MS) => {
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        refreshStream();
      }, delay);
    },
    [clearReconnectTimer, refreshStream],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLoading(true);
    video.load();
    void ensurePlaying();

    const watchdog = setTimeout(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.paused) {
        refreshStream();
      }
    }, 8000);

    return () => clearTimeout(watchdog);
  }, [ensurePlaying, refreshStream, streamVersion]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible') return;

      const video = videoRef.current;
      if (!video) return;

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        void ensurePlaying();
      } else {
        refreshStream();
      }
    };

    const handleOnline = () => refreshStream();

    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', resume);
    window.addEventListener('online', handleOnline);

    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', handleOnline);
      clearReconnectTimer();
    };
  }, [clearReconnectTimer, ensurePlaying, refreshStream]);

  const handlePlaying = () => {
    clearReconnectTimer();
    setLoading(false);
  };

  const handleWaiting = () => {
    setLoading(true);
    scheduleReconnect(WAITING_RECONNECT_DELAY_MS);
  };

  const handleStalled = () => {
    setLoading(true);
    scheduleReconnect();
  };

  const handleError = () => {
    setLoading(true);
    scheduleReconnect(1000);
  };

  const handleEnded = () => {
    setLoading(true);
    scheduleReconnect(500);
  };

  const handleFullscreen = async () => {
    const frame = frameRef.current;
    const video = videoRef.current;
    if (!video) return;

    await ensurePlaying();

    try {
      if (frame?.requestFullscreen) {
        await frame.requestFullscreen();
        return;
      }

      const iosVideo = video as IOSVideoElement;
      iosVideo.webkitEnterFullscreen?.();
    } catch {
      const iosVideo = video as IOSVideoElement;
      iosVideo.webkitEnterFullscreen?.();
    }
  };

  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center">
        <header className="flex h-[58px] w-full items-start justify-center pt-0.5" aria-label="Cámara en directo">
          <Image
            src="/icons/live.png"
            alt="LIVE"
            width={52}
            height={12}
            className="h-auto w-[44px] object-contain sm:w-[52px]"
            priority
          />
        </header>

        <section className="w-full">
          <div
            ref={frameRef}
            className="relative aspect-[1536/432] w-full overflow-hidden rounded-xl border-[0.5px] border-white/90 bg-black"
          >
            <video
              ref={videoRef}
              key={streamVersion}
              className="absolute inset-0 h-full w-full rounded-[inherit] object-cover"
              src={streamUrl}
              autoPlay
              muted
              playsInline
              controls={false}
              preload="auto"
              disablePictureInPicture
              aria-label="Cámara sala en directo"
              onLoadStart={() => setLoading(true)}
              onCanPlay={() => void ensurePlaying()}
              onPlaying={handlePlaying}
              onWaiting={handleWaiting}
              onStalled={handleStalled}
              onError={handleError}
              onEnded={handleEnded}
            />

            {loading ? (
              <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/35" aria-label="Cargando vídeo">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              </div>
            ) : null}
          </div>

          <div className="mt-3 grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={refreshStream}
              className="min-h-11 rounded-xl border-[0.5px] border-white/90 bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-75"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => void handleFullscreen()}
              className="min-h-11 rounded-xl border-[0.5px] border-white/90 bg-green-600 px-3 py-2.5 text-sm font-semibold text-white transition-opacity active:opacity-75"
            >
              Pantalla completa
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
