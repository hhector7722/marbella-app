'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  getDocument,
  GlobalWorkerOptions,
  type PDFDocumentProxy,
} from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport';
import {
  clearHost,
  computeFitScale,
  renderPdfPageHiDpiCrop,
} from '@/lib/pdf/hidpi-render';
import {
  detectCropBoundsThroughP4,
  type PavilionCropBounds,
} from '@/lib/pdf/pavilion-crop';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs';
}

/** Raster extra para pellizco nítido hasta ~4× sobre el zoom base */
const ZOOM_HEADROOM = 4;
const VIEWER_MIN_HEIGHT_PX = 420;
const VIEWER_MAX_HEIGHT_VH = 70;
const VIEWER_PADDING_PX = 24;

type PavilionActivityPdfViewerProps = {
  url: string;
  className?: string;
};

type ContainerSize = { width: number; height: number };

function measureContainer(el: HTMLElement | null): ContainerSize {
  if (!el) return { width: 0, height: 0 };

  const width = el.clientWidth;
  const height = el.clientHeight;

  if (width > 0 && height > 0) {
    return {
      width: Math.max(1, width - VIEWER_PADDING_PX),
      height: Math.max(1, height - VIEWER_PADDING_PX),
    };
  }

  const parent = el.parentElement;
  if (parent && parent.clientWidth > 0) {
    const maxH =
      typeof window !== 'undefined'
        ? Math.floor(window.innerHeight * (VIEWER_MAX_HEIGHT_VH / 100))
        : VIEWER_MIN_HEIGHT_PX;
    return {
      width: Math.max(1, parent.clientWidth - VIEWER_PADDING_PX),
      height: Math.max(VIEWER_MIN_HEIGHT_PX, maxH) - VIEWER_PADDING_PX,
    };
  }

  if (typeof window !== 'undefined') {
    const maxH = Math.floor(window.innerHeight * (VIEWER_MAX_HEIGHT_VH / 100));
    return {
      width: Math.max(1, Math.min(window.innerWidth, 512) - 48),
      height: Math.max(VIEWER_MIN_HEIGHT_PX, maxH) - VIEWER_PADDING_PX,
    };
  }

  return { width: 0, height: 0 };
}

export function PavilionActivityPdfViewer({ url, className }: PavilionActivityPdfViewerProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [hasRenderedPage, setHasRenderedPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState<ContainerSize>({ width: 0, height: 0 });
  const [cropBounds, setCropBounds] = useState<PavilionCropBounds | null>(null);
  const [docReady, setDocReady] = useState(false);

  const updateSize = useCallback(() => {
    const next = measureContainer(measureRef.current);
    if (next.width > 0 && next.height > 0) {
      setContainerSize(next);
    }
  }, []);

  useLayoutEffect(() => {
    updateSize();
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateSize());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateSize, url]);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setCropBounds(null);
    setDocReady(false);
    setHasRenderedPage(false);
    setError(null);

    async function loadDocument() {
      setLoadingDoc(true);
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error('No se pudo descargar el PDF');
        const buffer = await res.arrayBuffer();
        const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;
        if (cancelled) {
          if (typeof pdfDoc.destroy === 'function') pdfDoc.destroy();
          return;
        }

        const page1 = await pdfDoc.getPage(1);
        const bounds = await detectCropBoundsThroughP4(page1);

        pdfDocRef.current = pdfDoc;
        setCropBounds(bounds);
        setDocReady(true);
      } catch (err) {
        if (!cancelled) {
          const raw = err instanceof Error ? err.message : String(err);
          const msg = raw.includes('is not a function') || raw.includes('undefined')
            ? 'No se pudo cargar el PDF en este dispositivo.'
            : raw || 'Error al cargar el PDF';
          setError(msg);
        }
      } finally {
        if (!cancelled) setLoadingDoc(false);
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      const doc = pdfDocRef.current;
      if (doc && typeof doc.destroy === 'function') doc.destroy();
      pdfDocRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (!loadingDoc) {
      requestAnimationFrame(() => updateSize());
    }
  }, [loadingDoc, updateSize]);

  const renderAllPages = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    const host = pagesHostRef.current;
    if (!pdfDoc || !host || !cropBounds || containerSize.width <= 0 || containerSize.height <= 0) {
      return;
    }

    const generation = ++renderGenRef.current;

    try {
      const cropWidthPt = cropBounds.rightPt - cropBounds.leftPt;
      const fitScale = computeFitScale(cropWidthPt, containerSize.width);
      const rasterScale = fitScale * ZOOM_HEADROOM;

      clearHost(host);

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (generation !== renderGenRef.current) return;

        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.createElement('canvas');
        canvas.className = 'block rounded-lg shadow-sm bg-white';
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.dataset.pageNumber = String(pageNum);

        await renderPdfPageHiDpiCrop(
          page,
          canvas,
          rasterScale,
          cropBounds.rightPt,
          cropBounds.leftPt,
        );

        if (generation !== renderGenRef.current) return;
        if (canvas.height < 2) {
          throw new Error('El PDF no se pudo mostrar correctamente');
        }

        const cssW = parseFloat(canvas.style.width) / ZOOM_HEADROOM;
        const cssH = parseFloat(canvas.style.height) / ZOOM_HEADROOM;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;

        host.appendChild(canvas);

        if (pageNum === 1) {
          setHasRenderedPage(true);
        }
      }
    } catch (err) {
      if (generation === renderGenRef.current) {
        const raw = err instanceof Error ? err.message : String(err);
        const msg = raw.includes('is not a function') || raw.includes('undefined')
          ? 'No se pudo mostrar el PDF en este dispositivo.'
          : raw || 'Error al renderizar el PDF';
        setError(msg);
      }
    }
  }, [containerSize, cropBounds]);

  useEffect(() => {
    if (loadingDoc || !docReady || !cropBounds) return;
    if (containerSize.width <= 0 || containerSize.height <= 0) return;
    void renderAllPages();
  }, [loadingDoc, docReady, containerSize, cropBounds, url, renderAllPages]);

  const showSpinner = loadingDoc || (!hasRenderedPage && !error);

  return (
    <div ref={measureRef} className={cn('flex flex-col w-full min-h-0', className)}>
      <div
        className="relative w-full flex-1 min-h-0"
        style={{ minHeight: VIEWER_MIN_HEIGHT_PX, maxHeight: `${VIEWER_MAX_HEIGHT_VH}vh` }}
      >
        {showSpinner ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-zinc-50/80">
            <LoadingSpinner className="text-[#36606F]" />
          </div>
        ) : null}

        {error ? (
          <p className="absolute inset-0 z-10 flex items-center justify-center text-center text-sm font-bold text-rose-600 px-4">
            {error}
          </p>
        ) : null}

        <PinchZoomViewport
          resetKey={url}
          minScale={0.65}
          maxScale={4}
          className="h-full w-full bg-zinc-50/60 p-3"
          style={{ minHeight: VIEWER_MIN_HEIGHT_PX, maxHeight: `${VIEWER_MAX_HEIGHT_VH}vh` }}
        >
          <div ref={pagesHostRef} className="flex w-full min-w-0 flex-col gap-3" />
        </PinchZoomViewport>
      </div>
    </div>
  );
}
