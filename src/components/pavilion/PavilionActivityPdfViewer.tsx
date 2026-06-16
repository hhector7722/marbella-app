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
import { computeFitScale, clearHost, renderPdfPageHiDpiCrop } from '@/lib/pdf/hidpi-render';
import { detectCropRightThroughP4 } from '@/lib/pdf/pavilion-crop';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs';
}

/** Raster extra para que el zoom CSS (pellizco) siga siendo nítido hasta ~2.5× */
const ZOOM_HEADROOM = 2.5;
const VIEWER_MIN_HEIGHT_PX = 420;

type PavilionActivityPdfViewerProps = {
  url: string;
  className?: string;
};

function measureContainerWidth(el: HTMLElement | null): number {
  if (!el) return 0;
  const w = el.clientWidth;
  if (w > 0) return Math.max(1, w - 24);
  const parent = el.parentElement;
  if (parent && parent.clientWidth > 0) return Math.max(1, parent.clientWidth - 24);
  if (typeof window !== 'undefined') {
    return Math.max(1, Math.min(window.innerWidth, 512) - 48);
  }
  return 0;
}

export function PavilionActivityPdfViewer({ url, className }: PavilionActivityPdfViewerProps) {
  const measureRef = useRef<HTMLDivElement>(null);
  const pagesHostRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderGenRef = useRef(0);

  const [loadingDoc, setLoadingDoc] = useState(true);
  const [renderingPages, setRenderingPages] = useState(false);
  const [hasRenderedPage, setHasRenderedPage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [cropRightPt, setCropRightPt] = useState<number | null>(null);
  const [docReady, setDocReady] = useState(false);

  const updateWidth = useCallback(() => {
    const w = measureContainerWidth(measureRef.current);
    if (w > 0) setContainerWidth(w);
  }, []);

  useLayoutEffect(() => {
    updateWidth();
    const el = measureRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => updateWidth());
    ro.observe(el);
    return () => ro.disconnect();
  }, [updateWidth, url]);

  useEffect(() => {
    let cancelled = false;
    pdfDocRef.current = null;
    setCropRightPt(null);
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
        const cropRight = await detectCropRightThroughP4(page1);

        pdfDocRef.current = pdfDoc;
        setCropRightPt(cropRight);
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
      requestAnimationFrame(() => updateWidth());
    }
  }, [loadingDoc, updateWidth]);

  const renderAllPages = useCallback(async () => {
    const pdfDoc = pdfDocRef.current;
    const host = pagesHostRef.current;
    if (!pdfDoc || !host || containerWidth <= 0 || cropRightPt == null) return;

    const generation = ++renderGenRef.current;
    setRenderingPages(true);

    try {
      const fitScale = computeFitScale(cropRightPt, containerWidth);
      const rasterScale = fitScale * ZOOM_HEADROOM;

      clearHost(host);

      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        if (generation !== renderGenRef.current) return;

        const page = await pdfDoc.getPage(pageNum);
        const canvas = document.createElement('canvas');
        canvas.className = 'mx-auto mb-3 block rounded-lg shadow-sm bg-white';
        canvas.dataset.pageNumber = String(pageNum);

        await renderPdfPageHiDpiCrop(page, canvas, rasterScale, cropRightPt);

        if (generation !== renderGenRef.current) return;
        if (canvas.height < 2) {
          throw new Error('El PDF no se pudo mostrar correctamente');
        }

        const cssW = parseFloat(canvas.style.width) / ZOOM_HEADROOM;
        const cssH = parseFloat(canvas.style.height) / ZOOM_HEADROOM;
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.style.maxWidth = '100%';

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
    } finally {
      if (generation === renderGenRef.current) {
        setRenderingPages(false);
      }
    }
  }, [containerWidth, cropRightPt]);

  useEffect(() => {
    if (loadingDoc || !docReady || containerWidth <= 0 || cropRightPt == null) return;
    void renderAllPages();
  }, [loadingDoc, docReady, containerWidth, cropRightPt, url, renderAllPages]);

  const showSpinner = loadingDoc || (!hasRenderedPage && !error);

  return (
    <div ref={measureRef} className={cn('flex flex-col w-full', className)}>
      <div
        className="relative w-full"
        style={{ minHeight: VIEWER_MIN_HEIGHT_PX, maxHeight: '70vh' }}
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
          className="w-full bg-zinc-50/60 p-3"
          style={{ minHeight: VIEWER_MIN_HEIGHT_PX, maxHeight: '70vh' }}
        >
          <div ref={pagesHostRef} className="flex flex-col items-center w-full min-w-0" />
        </PinchZoomViewport>
      </div>
    </div>
  );
}
