'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';
const RECONNECT_DELAY_MS = 2500;
const WAITING_RECONNECT_DELAY_MS = 5000;
const STARTUP_WATCHDOG_MS = 8000;

type IOSVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

export default function CameraLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [streamVersion, setStreamVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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

  const markUnavailable = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const refreshStream = useCallback(() => {
    clearReconnectTimer();
    markUnavailable();
    setStreamVersion((version) => version + 1);
  }, [clearReconnectTimer, markUnavailable]);

  const ensurePlaying = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return false;

    try {
      video.muted = true;
      await video.play();
      return true;
    } catch {
      markUnavailable();
      return false;
    }
  }, [markUnavailable]);

  const scheduleReconnect = useCallback(
    (delay = RECONNECT_DELAY_MS) => {
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        refreshStream();
      }, delay);
    },
    [clearReconnectTimer, refreshStream],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    markUnavailable();
    video.load();
    void ensurePlaying();

    const watchdog = setTimeout(() => {
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || video.paused) {
        refreshStream();
      }
    }, STARTUP_WATCHDOG_MS);

    return () => clearTimeout(watchdog);
  }, [ensurePlaying, markUnavailable, refreshStream, streamVersion]);

  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== 'visible') return;

      const video = videoRef.current;
      if (!video) return;

      if (video.paused || video.ended || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        markUnavailable();
      }

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
  }, [clearReconnectTimer, ensurePlaying, markUnavailable, refreshStream]);

  const handlePlaying = () => {
    clearReconnectTimer();
    setIsPlaying(true);
  };

  const handleWaiting = () => {
    markUnavailable();
    scheduleReconnect(WAITING_RECONNECT_DELAY_MS);
  };

  const handleStalled = () => {
    markUnavailable();
    scheduleReconnect();
  };

  const handlePause = () => {
    markUnavailable();
    if (document.visibilityState !== 'visible') return;

    void (async () => {
      const resumed = await ensurePlaying();
      if (!resumed) scheduleReconnect();
    })();
  };

  const handleError = () => {
    markUnavailable();
    scheduleReconnect(1000);
  };

  const handleEnded = () => {
    markUnavailable();
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
              onLoadStart={markUnavailable}
              onCanPlay={() => void ensurePlaying()}
              onPlaying={handlePlaying}
              onWaiting={handleWaiting}
              onStalled={handleStalled}
              onPause={handlePause}
              onError={handleError}
              onEnded={handleEnded}
            />

            {isPlaying ? (
              <Image
                src="/icons/live.png"
                alt=""
                width={160}
                height={72}
                className="pointer-events-none absolute right-2 top-2 z-20 h-4 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:h-5"
                aria-hidden
                priority
              />
            ) : (
              <div
                className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-black/35"
                aria-label="Cargando vídeo"
              >
                <LoadingSpinner size="lg" className="text-white" />
              </div>
            )}
          </div>

          <div className="mt-ds-3 flex flex-wrap items-center justify-center gap-ds-2">
            <Button
              variant="tertiary"
              instance="camaras-actualizar"
              type="button"
              onClick={refreshStream}
            >
              Actualizar
            </Button>
            <Button
              variant="primary"
              instance="camaras-pantalla-completa"
              type="button"
              onClick={() => void handleFullscreen()}
            >
              Pantalla completa
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
