'use client';

import { useEffect, useRef, useState } from 'react';

const CAMERA_MP4_URL = 'https://video.barlamarbella.com/api/stream.mp4?src=reolink';

export default function CameraPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let stopped = false;

    const start = async () => {
      setError(false);

      // The go2rtc fragmented-MP4 endpoint is the most reliable path for this
      // camera. It also avoids leaving the UI stuck on a broken MSE/WebSocket
      // session when the upstream RTSP producer reconnects.
      video.src = CAMERA_MP4_URL;
      video.controls = false;
      video.playsInline = true;
      video.autoplay = true;
      video.muted = true;

      try {
        await video.play();
      } catch {
        if (!stopped) setError(true);
      }
    };

    const handlePlaying = () => setError(false);
    const handleError = () => {
      if (!stopped) setError(true);
    };

    video.addEventListener('playing', handlePlaying);
    video.addEventListener('error', handleError);
    void start();

    return () => {
      stopped = true;
      video.removeEventListener('playing', handlePlaying);
      video.removeEventListener('error', handleError);
      video.pause();
      video.removeAttribute('src');
      video.load();
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
