'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PinchZoomViewport } from '@/components/ui/PinchZoomViewport';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs';
}

const PDF_RENDER_SCALE = 1.4;

type PavilionActivityPdfViewerProps = {
  url: string;
  className?: string;
};

export function PavilionActivityPdfViewer({ url, className }: PavilionActivityPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const renderPdf = useCallback(async () => {
    if (!url || !containerRef.current) return;
    setLoading(true);
    setError(null);
    containerRef.current.innerHTML = '';

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error('No se pudo descargar el PDF');
      const buffer = await res.arrayBuffer();
      const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;

      const host = containerRef.current;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: PDF_RENDER_SCALE });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.className = 'mx-auto mb-3 max-w-full rounded-lg shadow-sm bg-white';
        await page.render({ canvas, viewport }).promise;
        host.appendChild(canvas);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al renderizar el PDF';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    void renderPdf();
  }, [renderPdf]);

  return (
    <div className={cn('flex flex-col min-h-0 flex-1', className)}>
      <div className="relative flex flex-1 min-h-0">
        {loading ? (
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
          className="flex-1 min-h-0 bg-zinc-50/60 p-3"
        >
          <div ref={containerRef} className="flex flex-col items-center" />
        </PinchZoomViewport>
      </div>
    </div>
  );
}
