'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PavilionActivityPdfViewer } from '@/components/pavilion/PavilionActivityPdfViewer';
import { getPavilionActivitySignedUrlAction } from '@/app/staff/actividades/actions';

interface Props {
  filePath: string | null;
}

export function PdfTab({ filePath }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!filePath) {
      setPdfUrl(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await getPavilionActivitySignedUrlAction({ filePath });
    if (!res.success) {
      setError(res.error);
      setPdfUrl(null);
      setLoading(false);
      return;
    }
    setPdfUrl(res.url);
    setLoading(false);
  }, [filePath]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!filePath) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-sm font-medium text-zinc-400">
          No hi ha PDF per aquest dia
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <LoadingSpinner className="text-ds-marca" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <p className="text-sm font-medium text-zinc-700">Error en carregar el PDF</p>
        <p className="text-xs font-medium text-zinc-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 w-full overflow-hidden">
      {pdfUrl && (
        <PavilionActivityPdfViewer url={pdfUrl} className="min-w-0 w-full" />
      )}
    </div>
  );
}
