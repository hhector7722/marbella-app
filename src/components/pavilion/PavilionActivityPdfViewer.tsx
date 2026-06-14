'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

if (typeof window !== 'undefined' && !GlobalWorkerOptions.workerSrc) {
  GlobalWorkerOptions.workerSrc =
    'https://unpkg.com/pdfjs-dist@5.5.207/legacy/build/pdf.worker.min.mjs';
}

type PavilionActivityPdfViewerProps = {
  url: string;
  className?: string;
};

export function PavilionActivityPdfViewer({ url, className }: PavilionActivityPdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [pageCount, setPageCount] = useState(0);

  const clampScale = (s: number) => Math.min(3, Math.max(0.5, s));

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
      setPageCount(pdfDoc.numPages);

      const host = containerRef.current;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: 1.4 * scale });
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
  }, [url, scale]);

  useEffect(() => {
    void renderPdf();
  }, [renderPdf]);

  return (
    <div className={cn('flex flex-col min-h-0 flex-1', className)}>
      <div className="flex items-center justify-center gap-3 py-2 shrink-0 border-b border-zinc-100">
        <button
          type="button"
          onClick={() => setScale((s) => clampScale(s - 0.25))}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:scale-95"
          aria-label="Alejar"
        >
          <Minus size={20} strokeWidth={2.5} />
        </button>
        <span className="text-xs font-black tabular-nums text-zinc-500 min-w-[3rem] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={() => setScale((s) => clampScale(s + 0.25))}
          className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl bg-zinc-100 text-zinc-600 hover:bg-zinc-200 active:scale-95"
          aria-label="Acercar"
        >
          <Plus size={20} strokeWidth={2.5} />
        </button>
        {pageCount > 0 ? (
          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider ml-1">
            {pageCount} {pageCount === 1 ? 'página' : 'páginas'}
          </span>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar p-3 min-h-0 bg-zinc-50/60">
        {loading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner className="text-[#36606F]" />
          </div>
        ) : null}
        {error ? (
          <p className="text-center text-sm font-bold text-rose-600 py-10 px-4">{error}</p>
        ) : null}
        <div ref={containerRef} className={cn(loading ? 'hidden' : 'flex flex-col items-center')} />
      </div>
    </div>
  );
}
