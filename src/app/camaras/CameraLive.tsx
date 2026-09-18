'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';
const RECONNECT_DELAY_MS = 2500;
const WAITING_RECONNECT_DELAY_MS = 5000;
const STARTUP_WATCHDOG_MS = 8000;
const ZOOM_MIN = 1;
const ZOOM_MAX = 4;
const WHEEL_ZOOM_FACTOR = 0.0015;

type IOSVideoElement = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
};

type LandscapeLock = 'landscape' | 'landscape-primary' | 'landscape-secondary';

type ScreenOrientationWithLock = ScreenOrientation & {
  lock?: (orientation: LandscapeLock) => Promise<void>;
  unlock?: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function touchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(a: Touch, b: Touch) {
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

async function tryLockLandscape() {
  const orientation = screen.orientation as ScreenOrientationWithLock | undefined;
  if (!orientation?.lock) return;

  try {
    await orientation.lock('landscape');
  } catch {
    try {
      await orientation.lock('landscape-primary');
    } catch {
      // El SO o el navegador pueden rechazar el bloqueo (p. ej. antirotación).
    }
  }
}

function unlockOrientation() {
  const orientation = screen.orientation as ScreenOrientationWithLock | undefined;
  try {
    orientation?.unlock?.();
  } catch {
    // Sin unlock disponible o fuera de fullscreen.
  }
}

export default function CameraLive({
  recordsButton = null,
}: {
  recordsButton?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scaleRef = useRef(ZOOM_MIN);
  const pinchRef = useRef<{
    startDistance: number;
    startScale: number;
  } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originLeft: number;
    originTop: number;
  } | null>(null);

  const [streamVersion, setStreamVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [scale, setScale] = useState(ZOOM_MIN);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const streamUrl = useMemo(
    () => `${CAMERA_MP4_URL}&reload=${streamVersion}`,
    [streamVersion],
  );

  const applyScaleAtClientPoint = useCallback((nextScale: number, clientX: number, clientY: number) => {
    const scroll = scrollRef.current;
    const frame = frameRef.current;
    if (!scroll || !frame) return;
    if (document.fullscreenElement === frame) return;

    const clamped = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
    const prev = scaleRef.current;

    const rect = scroll.getBoundingClientRect();
    const offsetX = clientX - rect.left;
    const offsetY = clientY - rect.top;
    const contentX = scroll.scrollLeft + offsetX;
    const contentY = scroll.scrollTop + offsetY;
    const ratio = clamped / Math.max(prev, 0.0001);

    scaleRef.current = clamped;
    frame.style.width = `${clamped * 100}%`;
    setScale(clamped);

    if (clamped <= ZOOM_MIN + 0.001) {
      scroll.scrollLeft = 0;
      scroll.scrollTop = 0;
      return;
    }

    const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
    const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    scroll.scrollLeft = clamp(contentX * ratio - offsetX, 0, maxLeft);
    scroll.scrollTop = clamp(contentY * ratio - offsetY, 0, maxTop);
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = ZOOM_MIN;
    setScale(ZOOM_MIN);
    pinchRef.current = null;
    panRef.current = null;
    const scroll = scrollRef.current;
    if (scroll) {
      scroll.scrollLeft = 0;
      scroll.scrollTop = 0;
    }
  }, []);

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
    resetZoom();
    setStreamVersion((version) => version + 1);
  }, [clearReconnectTimer, markUnavailable, resetZoom]);

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

  useEffect(() => {
    const onFullscreenChange = () => {
      const active = document.fullscreenElement === frameRef.current;
      setIsFullscreen(active);
      if (!document.fullscreenElement) unlockOrientation();
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_FACTOR);
      applyScaleAtClientPoint(scaleRef.current * factor, event.clientX, event.clientY);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        panRef.current = null;
        pinchRef.current = {
          startDistance: touchDistance(event.touches[0], event.touches[1]),
          startScale: scaleRef.current,
        };
        return;
      }

      if (event.touches.length === 1 && scaleRef.current > ZOOM_MIN + 0.001) {
        const touch = event.touches[0];
        panRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originLeft: scroll.scrollLeft,
          originTop: scroll.scrollTop,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && pinchRef.current) {
        event.preventDefault();
        const distance = touchDistance(event.touches[0], event.touches[1]);
        const mid = touchMidpoint(event.touches[0], event.touches[1]);
        const nextScale =
          pinchRef.current.startScale * (distance / Math.max(pinchRef.current.startDistance, 1));
        applyScaleAtClientPoint(nextScale, mid.x, mid.y);
        return;
      }

      if (event.touches.length === 1 && panRef.current && scaleRef.current > ZOOM_MIN + 0.001) {
        event.preventDefault();
        const touch = event.touches[0];
        if (touch.identifier !== panRef.current.pointerId) return;
        const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
        const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
        scroll.scrollLeft = clamp(
          panRef.current.originLeft - (touch.clientX - panRef.current.startX),
          0,
          maxLeft,
        );
        scroll.scrollTop = clamp(
          panRef.current.originTop - (touch.clientY - panRef.current.startY),
          0,
          maxTop,
        );
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length === 0) panRef.current = null;

      if (event.touches.length === 1 && scaleRef.current > ZOOM_MIN + 0.001) {
        const touch = event.touches[0];
        panRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originLeft: scroll.scrollLeft,
          originTop: scroll.scrollTop,
        };
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (scaleRef.current <= ZOOM_MIN + 0.001) return;
      if (event.button !== 0) return;

      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originLeft: scroll.scrollLeft,
        originTop: scroll.scrollTop,
      };
      scroll.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
      if (scaleRef.current <= ZOOM_MIN + 0.001) return;

      const maxLeft = Math.max(0, scroll.scrollWidth - scroll.clientWidth);
      const maxTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      scroll.scrollLeft = clamp(
        panRef.current.originLeft - (event.clientX - panRef.current.startX),
        0,
        maxLeft,
      );
      scroll.scrollTop = clamp(
        panRef.current.originTop - (event.clientY - panRef.current.startY),
        0,
        maxTop,
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    };

    scroll.addEventListener('wheel', onWheel, { passive: false });
    scroll.addEventListener('touchstart', onTouchStart, { passive: true });
    scroll.addEventListener('touchmove', onTouchMove, { passive: false });
    scroll.addEventListener('touchend', onTouchEnd);
    scroll.addEventListener('touchcancel', onTouchEnd);
    scroll.addEventListener('pointerdown', onPointerDown);
    scroll.addEventListener('pointermove', onPointerMove);
    scroll.addEventListener('pointerup', onPointerUp);
    scroll.addEventListener('pointercancel', onPointerUp);

    return () => {
      scroll.removeEventListener('wheel', onWheel);
      scroll.removeEventListener('touchstart', onTouchStart);
      scroll.removeEventListener('touchmove', onTouchMove);
      scroll.removeEventListener('touchend', onTouchEnd);
      scroll.removeEventListener('touchcancel', onTouchEnd);
      scroll.removeEventListener('pointerdown', onPointerDown);
      scroll.removeEventListener('pointermove', onPointerMove);
      scroll.removeEventListener('pointerup', onPointerUp);
      scroll.removeEventListener('pointercancel', onPointerUp);
    };
  }, [applyScaleAtClientPoint]);

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
        await tryLockLandscape();
        return;
      }

      const iosVideo = video as IOSVideoElement;
      iosVideo.webkitEnterFullscreen?.();
    } catch {
      const iosVideo = video as IOSVideoElement;
      iosVideo.webkitEnterFullscreen?.();
    }
  };

  const isZoomed = scale > ZOOM_MIN + 0.001;

  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center">
        <section className="w-full">
          <div
            ref={scrollRef}
            className="relative w-full overflow-auto touch-none"
            style={{ cursor: isZoomed ? 'grab' : 'default' }}
          >
            <div
              ref={frameRef}
              className="relative bg-black rounded-xl border-[0.5px] border-white/90 [:fullscreen]:rounded-none [:fullscreen]:border-0"
              style={
                isFullscreen
                  ? { width: '100%', height: '100%' }
                  : {
                      width: `${scale * 100}%`,
                      aspectRatio: '1536 / 432',
                    }
              }
            >
              <video
                ref={videoRef}
                key={streamVersion}
                className="absolute inset-0 h-full w-full rounded-[inherit] object-cover [:fullscreen]:rounded-none"
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
                  className="pointer-events-none absolute right-2 top-2 z-20 h-2.5 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:h-3"
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
          </div>

          <div className="mt-ds-3 flex flex-wrap items-center justify-center gap-ds-2">
            {recordsButton}
            <Button
              variant="secondary"
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
