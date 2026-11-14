'use client';

import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

/**
 * Perfil de borde con chaflanes reales y una muesca superior continua.
 * Usa medidas en px, no un border-radius ni un mask de rectángulo:
 * la línea sigue exactamente el mismo polígono que recorta el panel.
 */
export default function MasterHudFrame() {
  const frameRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const gradientId = useId().replaceAll(':', '');

  useLayoutEffect(() => {
    const host = frameRef.current?.parentElement;
    if (!host) return;
    const update = () => {
      const rect = host.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      if (width > 0 && height > 0) {
        setSize((old) =>
          old.width === width && old.height === height ? old : { width, height },
        );
      }
    };
    const observer = new ResizeObserver(update);
    observer.observe(host);
    update();
    return () => observer.disconnect();
  }, []);

  const geometry = useMemo(() => {
    const { width: w, height: h } = size;
    if (!w || !h) return null;

    const bevel = Math.round(Math.max(8, Math.min(16, w * 0.045)));
    const notch = Math.round(Math.max(4, Math.min(6, h * 0.035)));
    const inset = 1.7;
    const start = Math.round(w * 0.26);
    const down = Math.round(w * 0.30);
    const rise = Math.round(w * 0.72);
    const end = Math.round(w * 0.76);
    const edge = (n: number) => n.toFixed(1);

    // El recorte físico del panel no deja esquinas redondeadas detrás del marco.
    const clip = `polygon(
      0px ${bevel}px, ${bevel}px 0px,
      ${start}px 0px, ${down}px ${notch}px,
      ${rise}px ${notch}px, ${end}px 0px,
      calc(100% - ${bevel}px) 0px, 100% ${bevel}px,
      100% calc(100% - ${bevel}px), calc(100% - ${bevel}px) 100%,
      ${bevel}px 100%, 0px calc(100% - ${bevel}px)
    )`;

    const path = [
      `M ${edge(inset)} ${edge(bevel)}`,
      `L ${edge(bevel)} ${edge(inset)}`,
      `L ${edge(start)} ${edge(inset)}`,
      `L ${edge(down)} ${edge(notch + inset)}`,
      `L ${edge(rise)} ${edge(notch + inset)}`,
      `L ${edge(end)} ${edge(inset)}`,
      `L ${edge(w - bevel)} ${edge(inset)}`,
      `L ${edge(w - inset)} ${edge(bevel)}`,
      `L ${edge(w - inset)} ${edge(h - bevel)}`,
      `L ${edge(w - bevel)} ${edge(h - inset)}`,
      `L ${edge(bevel)} ${edge(h - inset)}`,
      `L ${edge(inset)} ${edge(h - bevel)}`,
      'Z',
    ].join(' ');
    const topLeft = `M ${edge(inset)} ${edge(bevel)} L ${edge(bevel)} ${edge(inset)} L ${edge(start)} ${edge(inset)}`;
    const topRight = `M ${edge(end)} ${edge(inset)} L ${edge(w - bevel)} ${edge(inset)} L ${edge(w - inset)} ${edge(bevel)}`;
    const bottom = `M ${edge(w - inset)} ${edge(h - bevel)} L ${edge(w - bevel)} ${edge(h - inset)} L ${edge(bevel)} ${edge(h - inset)}`;
    return { clip, path, topLeft, topRight, bottom };
  }, [size]);

  useLayoutEffect(() => {
    const host = frameRef.current?.parentElement;
    if (!host || !geometry) return;
    const previousClip = host.style.clipPath;
    const previousRadius = host.style.borderRadius;
    host.style.clipPath = geometry.clip;
    host.style.borderRadius = '0px';
    return () => {
      host.style.clipPath = previousClip;
      host.style.borderRadius = previousRadius;
    };
  }, [geometry]);

  return (
    <svg
      ref={frameRef}
      data-element="master-hud-outline"
      className="master-hud-outline"
      aria-hidden="true"
      viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}
      preserveAspectRatio="none"
      style={{ opacity: geometry ? 1 : 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ebadff"/>
          <stop offset="32%" stopColor="#ae61f0"/>
          <stop offset="65%" stopColor="#bd79ff"/>
          <stop offset="100%" stopColor="#e4a2ff"/>
        </linearGradient>
      </defs>
      {geometry && (
        <>
          <path d={geometry.path} fill="none" stroke="#ba64f5" strokeWidth="7" strokeOpacity=".16" />
          <path d={geometry.path} fill="none" stroke={`url(#${gradientId})`} strokeWidth="2.2" strokeLinejoin="bevel" />
          <path d={geometry.topLeft} fill="none" stroke="#f4b6ff" strokeWidth="2.6" strokeOpacity=".95"/>
          <path d={geometry.topRight} fill="none" stroke="#eea2ff" strokeWidth="2.4" strokeOpacity=".88"/>
          <path d={geometry.bottom} fill="none" stroke="#b96cff" strokeWidth="2.4" strokeOpacity=".9"/>
        </>
      )}
    </svg>
  );
}
