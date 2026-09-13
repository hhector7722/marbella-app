'use client';

import { useEffect, useRef, useState } from 'react';

const CAMERA_WS_URL = 'wss://video.barlamarbella.com/api/ws?src=reolink';
const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';

const CODECS = [
  'avc1.640029',
  'avc1.64002A',
  'avc1.640033',
  'hvc1.1.6.L153.B0',
  'mp4a.40.2',
  'mp4a.40.5',
  'flac',
  'opus',
];

type MediaSourceLike = MediaSource & {
  setLiveSeekableRange?: (start: number, end: number) => void;
};

export default function CameraPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSourceLike | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<ArrayBuffer[]>([]);
  const objectUrlRef = useRef<string | null>(null);
  const reconnectRef = useRef<number | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;

    const cleanup = () => {
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current);
        reconnectRef.current = null;
      }

      wsRef.current?.close();
      wsRef.current = null;
      sourceBufferRef.current = null;
      mediaSourceRef.current = null;
      queueRef.current = [];

      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      video.removeAttribute('src');
      video.srcObject = null;
      video.load();
    };

    const play = () => {
      video.play().catch(() => {
        video.muted = true;
        video.play().catch(() => undefined);
      });
    };

    const flushQueue = () => {
      const sourceBuffer = sourceBufferRef.current;
      if (!sourceBuffer || sourceBuffer.updating || queueRef.current.length === 0) return;

      const next = queueRef.current.shift();
      if (!next) return;

      try {
        sourceBuffer.appendBuffer(next);
      } catch {
        queueRef.current.unshift(next);
      }
    };

    const trimBuffer = () => {
      const sourceBuffer = sourceBufferRef.current;
      const mediaSource = mediaSourceRef.current;
      if (!sourceBuffer || sourceBuffer.updating || !sourceBuffer.buffered.length) return;

      const end = sourceBuffer.buffered.end(sourceBuffer.buffered.length - 1);
      const start = Math.max(sourceBuffer.buffered.start(0), end - 5);

      if (start > sourceBuffer.buffered.start(0)) {
        try {
          sourceBuffer.remove(sourceBuffer.buffered.start(0), start);
          mediaSource?.setLiveSeekableRange?.(start, end);
        } catch {
          // The next update cycle will retry the trim.
        }
      }

      if (video.currentTime < start) {
        video.currentTime = start;
      }

      const lag = end - video.currentTime;
      video.playbackRate = lag > 0.1 ? Math.min(lag, 1.5) : 1;
    };

    const connect = () => {
      if (stopped) return;

      const ManagedMediaSource = (window as typeof window & {
        ManagedMediaSource?: typeof MediaSource;
      }).ManagedMediaSource;
      const MediaSourceCtor = ManagedMediaSource ?? window.MediaSource;

      if (!MediaSourceCtor) {
        video.src = CAMERA_MP4_URL;
        video.controls = false;
        play();
        return;
      }

      const mediaSource = new MediaSourceCtor() as MediaSourceLike;
      mediaSourceRef.current = mediaSource;

      const isManaged = Boolean(ManagedMediaSource);
      const codecs = CODECS
        .filter((codec) => MediaSourceCtor.isTypeSupported(`video/mp4; codecs="${codec}"`))
        .filter((codec) =>
          codec.startsWith('avc') ||
          codec.startsWith('hvc') ||
          codec.startsWith('mp4a') ||
          codec === 'flac' ||
          codec === 'opus',
        )
        .join();

      const openSocket = () => {
        const ws = new WebSocket(CAMERA_WS_URL);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.addEventListener('open', () => {
          ws.send(JSON.stringify({ type: 'mse', value: codecs }));
        });

        ws.addEventListener('message', (event) => {
          if (typeof event.data === 'string') {
            let message: { type?: string; value?: string };
            try {
              message = JSON.parse(event.data);
            } catch {
              return;
            }

            if (message.type === 'mse' && message.value && mediaSource.readyState === 'open') {
              try {
                const sourceBuffer = mediaSource.addSourceBuffer(message.value);
                sourceBuffer.mode = 'segments';
                sourceBufferRef.current = sourceBuffer;

                sourceBuffer.addEventListener('updateend', () => {
                  trimBuffer();
                  flushQueue();
                  play();
                });

                flushQueue();
              } catch {
                setError(true);
                ws.close();
              }
            }

            if (message.type === 'error') {
              setError(true);
            }
            return;
          }

          queueRef.current.push(event.data as ArrayBuffer);
          flushQueue();
        });

        ws.addEventListener('close', () => {
          wsRef.current = null;
          if (!stopped) {
            reconnectRef.current = window.setTimeout(() => {
              reconnectRef.current = null;
              connect();
            }, 1500);
          }
        });

        ws.addEventListener('error', () => {
          setError(true);
        });
      };

      if (isManaged) {
        mediaSource.addEventListener('sourceopen', openSocket, { once: true });
        video.disableRemotePlayback = true;
        video.srcObject = mediaSource;
      } else {
        const objectUrl = URL.createObjectURL(mediaSource);
        objectUrlRef.current = objectUrl;
        mediaSource.addEventListener('sourceopen', openSocket, { once: true });
        video.src = objectUrl;
      }

      video.controls = false;
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;
      play();
    };

    setError(false);
    connect();

    return () => {
      stopped = true;
      cleanup();
    };
  }, []);

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        className="absolute inset-0 h-full w-full object-cover"
        playsInline
        muted
        autoPlay
        aria-label="Cámara sala en directo"
      />
      {error ? (
        <div className="absolute inset-0 grid place-items-center bg-black/80 px-4 text-center text-sm text-white/80">
          No se ha podido conectar con la cámara.
        </div>
      ) : null}
    </div>
  );
}
