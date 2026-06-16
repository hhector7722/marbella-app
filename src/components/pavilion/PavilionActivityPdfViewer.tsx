'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { computeFitScale, renderPdfPageHiDpiCrop } from '@/lib/pdf/hidpi-render';
import { detectCropRightThroughP4 } from '@/lib/pdf/pavilion-crop';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs';
}

const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const SCROLL_PADDING_PX = 24;

type PavilionActivityPdfViewerProps = {
  url: string;
  className?: string;
};

function touchDistance(touches: ReactTouchEvent['touches']) {
  if (touches.length < 2) return 0;
  const a = touches.item(0);
  const b = touches.item(1);
  if (!a || !b) return 0;
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

export function PavilionActivityPdfViewer({ url, className }: PavilionActivityPdfViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const cropRightPtRef = useRef<number | null>(null);
  const renderGenRef = useRef(0);
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const isPinchingRef = useRef(false);
  const zoomRef = useRef(1);

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [renderingPages, setRenderingPages] = useState(false);
  const [hasRenderedPage, setHasRenderedPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);

  zoomRef.current = zoom;

  const syncZoom = useCallback((next: number) => {
    const clamped = clampZoom(next);
    zoomRef.current = clamped;
    setZoom(clamped);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth - SCROLL_PADDING_PX;
      if (w > 0) setContainerWidth(w);
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    cropRightPtRef.current = null;
    setHasRenderedPage(false);
    syncZoom(1);

    async function loadDocument() {
      setLoadingDoc(true);
      setError(null);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('No se pudo descargar el PDF');
        const buffer = await res.arrayBuffer();
        const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;
        if (cancelled) {
          void pdfDoc.destroy();
          return;
        }

        const page1 = await pdfDoc.getPage(1);
        const cropRight = await detectCropRightThroughP4(page1);

        pdfDocRef.current = pdfDoc;
        cropRightPtRef.current = cropRight;
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Error al cargar el PDF';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      void pdfDocRef.current?.destroy();
      pdfDocRef.current = null;
      cropRightPtRef.current = null;
    };
  }, [url, syncZoom]);

  const renderAllPages = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    const host = pagesHostRef.current;
    const cropRightPt = cropRightPtRef.current;
    if (!pdfDoc || !host || containerWidth <= 0 || cropRightPt == null) return;

    const generation = ++renderGenRef.current;
    setRenderingPages(true);

    try {
      const fitScale = computeFitScale(cropRightPt, containerWidth);
      const renderScale = fitScale * zoomRef.current;

      host.replaceChildren();

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (generation !== renderGenRef.current) return;

        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.createElement('canvas');
        canvas.className = 'mx-auto mb-3 block max-w-full rounded-lg shadow-sm bg-white';
        canvas.dataset.pageNumber = String(pageNum);

        await renderPdfPageHiDpiCrop(page, canvas, renderScale, cropRightPt);

        if (generation !== renderGenRef.current) return;
        host.appendChild(canvas);

        if (pageNum === 1) {
          setHasRenderedPage(true);
        }
      }
    } catch (err) {
      if (generation === renderGenRef.current) {
        const msg = err instanceof Error ? err.message : 'Error al renderizar el PDF';
        setError(msg);
      }
    } finally {
      if (generation === renderGenRef.current) {
        setRenderingPages(false);
      }
    }
  }, [containerWidth]);

  useEffect(() => {
    if (loadingDoc || containerWidth <= 0 || !pdfDocRef.current || cropRightPtRef.current == null) {
      return;
    }

    const debounceMs = isPinchingRef.current ? 100 : 0;
    const timer = window.setTimeout(() => {
      void renderAllPages();
    }, debounceMs);

    return () => window.clearTimeout(timer);
  }, [loadingDoc, containerWidth, zoom, url, renderAllPages]);

  const onTouchStart = (e: ReactTouchEvent) => {
    if (e.touches.length === 2) {
      const distance = touchDistance(e.touches);
      if (distance > 0) {
        isPinchingRef.current = true;
        pinchRef.current = { distance, zoom: zoomRef.current };
      }
    }
  };

  const onTouchMove = (e: ReactTouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      e.preventDefault();
      const distance = touchDistance(e.touches);
      if (distance <= 0) return;
      const ratio = distance / pinchRef.current.distance;
      syncZoom(pinchRef.current.zoom * ratio);
    }
  };

  const onTouchEnd = (e: ReactTouchEvent) => {
    if (e.touches.length < 2) {
      pinchRef.current = null;
      isPinchingRef.current = false;
      if (e.touches.length === 0 && zoomRef.current <= 1.02) {
        syncZoom(1);
      }
    }
  };

  const showInitialSpinner = loadingDoc || (!hasRenderedPage && renderingPages);

  return (
    <div className={cn('flex flex-col min-h-0 min-w-0 w-full', className)}>
      <div className="relative flex min-h-0 min-w-0 w-full max-h-[70vh]">
        {showInitialSpinner ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80 min-h-[200px]">
            <LoadingSpinner className="text-[#36606F]" />
          </div>
        ) : null}

        {renderingPages && hasRenderedPage ? (
          <div className="absolute top-2 right-2 z-10 rounded-full bg-white/90 p-1.5 shadow-sm">
            <LoadingSpinner size="sm" className="text-[#36606F]" />
          </div>
        ) : null}

        {error ? (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-center text-sm font-bold text-rose-600 px-4 min-h-[120px]">
            {error}
          </p>
        ) : null}

        <div
          ref={scrollRef}
          className="w-full min-w-0 max-w-full min-h-0 max-h-[70vh] overflow-auto overscroll-contain bg-zinc-50/60 p-3"
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-x pan-y' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div ref={pagesHostRef} className="flex flex-col items-center w-full min-w-0" />
        </div>
      </div>
    </div>
  );
}
