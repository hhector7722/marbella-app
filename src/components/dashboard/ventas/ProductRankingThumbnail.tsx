'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import Image from 'next/image';
import { createPortal } from 'react-dom';
import { useStudioCutout } from '@/components/carta/useStudioCutout';

export function ProductRankingThumbnail({ src, name }: { src?: string; name: string }) {
    const [failed, setFailed] = useState(false);
    const [visible, setVisible] = useState(false);
    const [preview, setPreview] = useState<{ left: number; top: number } | null>(null);
    const tileRef = useRef<HTMLSpanElement>(null);

    // Recortar únicamente el fondo blanco/transparente cuando es seguro;
    // no procesar el catálogo entero si sus filas no se han hecho visibles.
    useEffect(() => {
        const tile = tileRef.current;
        if (!tile || !src) return;
        if (typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry?.isIntersecting) {
                setVisible(true);
                observer.disconnect();
            }
        }, { rootMargin: '80px' });
        observer.observe(tile);
        return () => observer.disconnect();
    }, [src]);
    const cutout = useStudioCutout(visible ? src ?? null : null);
    const displayedSrc = cutout?.isolated ? cutout.href : src;

    const showPreview = (event: MouseEvent<HTMLSpanElement>) => {
        if (!displayedSrc || failed || window.matchMedia('(hover: none)').matches) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const outerSize = 118;
        const left = rect.right + 10 + outerSize <= window.innerWidth
            ? rect.right + 10
            : Math.max(8, rect.left - outerSize - 10);
        const top = Math.max(8, Math.min(rect.top - 40, window.innerHeight - outerSize - 8));
        setPreview({ left, top });
    };

    return (
        <>
            <span ref={tileRef} aria-hidden="true"
                onMouseEnter={showPreview}
                onMouseLeave={() => setPreview(null)}
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-slate-50 p-[2px]">
                {displayedSrc && !failed ? (
                    <Image src={displayedSrc} alt="" width={16} height={16} sizes="16px"
                        loading="lazy" unoptimized={displayedSrc.startsWith('blob:')}
                        onError={() => setFailed(true)}
                        className="block h-[16px] w-[16px] max-h-full max-w-full shrink-0 object-contain"/>
                ) : null}
            </span>
            {preview && displayedSrc && !failed && typeof document !== 'undefined' && createPortal(
                <div role="tooltip" aria-label={'Imagen de ' + name}
                    className="pointer-events-none fixed z-[9999] rounded-xl border border-slate-200/80 bg-white p-2 shadow-[0_12px_32px_rgba(5,20,45,0.22)]"
                    style={{ left: preview.left, top: preview.top }}>
                    <div className="flex h-[100px] w-[100px] items-center justify-center">
                        <Image src={displayedSrc} alt={name} width={100} height={100} sizes="100px"
                            unoptimized={displayedSrc.startsWith('blob:')}
                            className="block h-[100px] w-[100px] object-contain"/>
                    </div>
                </div>, document.body
            )}
        </>
    );
}
