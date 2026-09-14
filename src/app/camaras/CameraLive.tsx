'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type ZoomState = {
  scale: number;
  x: number;
  y: number;
};

const ZOOM_IDENTITY: ZoomState = { scale: ZOOM_MIN, x: 0, y: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function clampPan(scale: number, x: number, y: number, width: number, height: number): ZoomState {
  if (scale <= ZOOM_MIN + 0.001) return ZOOM_IDENTITY;
  const minX = width * (1 - scale);
  const minY = height * (1 - scale);
  return {
    scale,
    x: clamp(x, minX, 0),
    y: clamp(y, minY, 0),
  };
}

function zoomAroundPoint(
  current: ZoomState,
  nextScale: number,
  pointX: number,
  pointY: number,
  width: number,
  height: number,
): ZoomState {
  const scale = clamp(nextScale, ZOOM_MIN, ZOOM_MAX);
  if (scale <= ZOOM_MIN + 0.001) return ZOOM_IDENTITY;

  const ratio = scale / current.scale;
  return clampPan(
    scale,
    pointX - (pointX - current.x) * ratio,
    pointY - (pointY - current.y) * ratio,
    width,
    height,
  );
}

function touchDistance(a: Touch, b: Touch) {
  const dx = a.clientX - b.clientX;
  const dy = a.clientY - b.clientY;
  return Math.hypot(dx, dy);
}

function touchMidpoint(a: Touch, b: Touch, frame: DOMRect) {
  return {
    x: (a.clientX + b.clientX) / 2 - frame.left,
    y: (a.clientY + b.clientY) / 2 - frame.top,
  };
}

export default function CameraLive() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const zoomLayerRef = useRef<HTMLDivElement>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zoomRef = useRef<ZoomState>(ZOOM_IDENTITY);
  const pinchRef = useRef<{
    startDistance: number;
    startZoom: ZoomState;
  } | null>(null);
  const panRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const [streamVersion, setStreamVersion] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState<ZoomState>(ZOOM_IDENTITY);

  const streamUrl = useMemo(
    () => `${CAMERA_MP4_URL}&reload=${streamVersion}`,
    [streamVersion],
  );

  const applyZoom = useCallback((next: ZoomState) => {
    zoomRef.current = next;
    setZoom(next);
    const layer = zoomLayerRef.current;
    if (!layer) return;
    layer.style.transform = `translate(${next.x}px, ${next.y}px) scale(${next.scale})`;
  }, []);

  const resetZoom = useCallback(() => {
    applyZoom(ZOOM_IDENTITY);
    pinchRef.current = null;
    panRef.current = null;
  }, [applyZoom]);

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
    const frame = frameRef.current;
    if (!frame) return;

    const getFrameRect = () => frame.getBoundingClientRect();

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = getFrameRect();
      const pointX = event.clientX - rect.left;
      const pointY = event.clientY - rect.top;
      const factor = Math.exp(-event.deltaY * WHEEL_ZOOM_FACTOR);
      applyZoom(
        zoomAroundPoint(
          zoomRef.current,
          zoomRef.current.scale * factor,
          pointX,
          pointY,
          rect.width,
          rect.height,
        ),
      );
    };

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length === 2) {
        panRef.current = null;
        pinchRef.current = {
          startDistance: touchDistance(event.touches[0], event.touches[1]),
          startZoom: { ...zoomRef.current },
        };
        return;
      }

      if (event.touches.length === 1 && zoomRef.current.scale > ZOOM_MIN + 0.001) {
        const touch = event.touches[0];
        panRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: zoomRef.current.x,
          originY: zoomRef.current.y,
        };
      }
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && pinchRef.current) {
        event.preventDefault();
        const rect = getFrameRect();
        const distance = touchDistance(event.touches[0], event.touches[1]);
        const mid = touchMidpoint(event.touches[0], event.touches[1], rect);
        const nextScale =
          pinchRef.current.startZoom.scale * (distance / Math.max(pinchRef.current.startDistance, 1));
        applyZoom(
          zoomAroundPoint(
            pinchRef.current.startZoom,
            nextScale,
            mid.x,
            mid.y,
            rect.width,
            rect.height,
          ),
        );
        return;
      }

      if (event.touches.length === 1 && panRef.current && zoomRef.current.scale > ZOOM_MIN + 0.001) {
        event.preventDefault();
        const touch = event.touches[0];
        if (touch.identifier !== panRef.current.pointerId) return;
        const rect = getFrameRect();
        applyZoom(
          clampPan(
            zoomRef.current.scale,
            panRef.current.originX + (touch.clientX - panRef.current.startX),
            panRef.current.originY + (touch.clientY - panRef.current.startY),
            rect.width,
            rect.height,
          ),
        );
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length === 0) panRef.current = null;

      if (event.touches.length === 1 && zoomRef.current.scale > ZOOM_MIN + 0.001) {
        const touch = event.touches[0];
        panRef.current = {
          pointerId: touch.identifier,
          startX: touch.clientX,
          startY: touch.clientY,
          originX: zoomRef.current.x,
          originY: zoomRef.current.y,
        };
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (zoomRef.current.scale <= ZOOM_MIN + 0.001) return;
      if (event.button !== 0) return;

      panRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: zoomRef.current.x,
        originY: zoomRef.current.y,
      };
      frame.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (!panRef.current || panRef.current.pointerId !== event.pointerId) return;
      if (zoomRef.current.scale <= ZOOM_MIN + 0.001) return;

      const rect = getFrameRect();
      applyZoom(
        clampPan(
          zoomRef.current.scale,
          panRef.current.originX + (event.clientX - panRef.current.startX),
          panRef.current.originY + (event.clientY - panRef.current.startY),
          rect.width,
          rect.height,
        ),
      );
    };

    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    };

    frame.addEventListener('wheel', onWheel, { passive: false });
    frame.addEventListener('touchstart', onTouchStart, { passive: true });
    frame.addEventListener('touchmove', onTouchMove, { passive: false });
    frame.addEventListener('touchend', onTouchEnd);
    frame.addEventListener('touchcancel', onTouchEnd);
    frame.addEventListener('pointerdown', onPointerDown);
    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerup', onPointerUp);
    frame.addEventListener('pointercancel', onPointerUp);

    return () => {
      frame.removeEventListener('wheel', onWheel);
      frame.removeEventListener('touchstart', onTouchStart);
      frame.removeEventListener('touchmove', onTouchMove);
      frame.removeEventListener('touchend', onTouchEnd);
      frame.removeEventListener('touchcancel', onTouchEnd);
      frame.removeEventListener('pointerdown', onPointerDown);
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerup', onPointerUp);
      frame.removeEventListener('pointercancel', onPointerUp);
    };
  }, [applyZoom]);

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

  const isZoomed = zoom.scale > ZOOM_MIN + 0.001;

  return (
    <main className="min-h-screen px-2 pb-4 pt-header-safe md:px-3">
      <div className="mx-auto flex w-full max-w-none flex-col items-center">
        <section className="w-full">
          <div
            ref={frameRef}
            className="relative aspect-[1536/432] w-full overflow-hidden rounded-xl border-[0.5px] border-white/90 bg-black touch-none"
            style={{ cursor: isZoomed ? 'grab' : 'default' }}
          >
            <div
              ref={zoomLayerRef}
              className="absolute inset-0 origin-top-left will-change-transform"
              style={{
                transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
              }}
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
            </div>

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

          <div className="mt-ds-3 flex flex-wrap items-center justify-center gap-ds-2">
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
