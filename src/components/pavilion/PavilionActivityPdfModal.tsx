'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Trash2, Upload, X } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { useModalUsageTracking } from '@/hooks/useModalUsageTracking';
import { useTrackModalApply } from '@/hooks/useTrackModalApply';
import { formatYmdShort } from '@/lib/usage/modal-apply';
import { PavilionActivityPdfViewer } from '@/components/pavilion/PavilionActivityPdfViewer';
import {
  deletePavilionActivityAction,
  getPavilionActivitySignedUrlAction,
  uploadPavilionActivityAction,
} from '@/app/staff/actividades/actions';

type PavilionActivityPdfModalProps = {
  open: boolean;
  onClose: () => void;
  activityDate: string | null;
  filePath: string | null;
  canUpload: boolean;
  onUploaded: () => void;
  onNavigateDay: (delta: -1 | 1) => void;
};

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

const headerIconBtn =
  'min-h-[48px] min-w-[48px] flex items-center justify-center text-white hover:bg-white/10 rounded-xl transition-colors disabled:opacity-50 shrink-0';

export function PavilionActivityPdfModal({
  open,
  onClose,
  activityDate,
  filePath,
  canUpload,
  onUploaded,
  onNavigateDay,
}: PavilionActivityPdfModalProps) {
  useModalUsageTracking({
    open,
    usageId: 'pavilion-activity-pdf',
    usageLabel: 'Actividades pabellón',
  });

  const trackPavilionPdf = useTrackModalApply('pavilion-activity-pdf', 'Actividades pabellón');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadPdf = useCallback(async () => {
    if (!open || !filePath) {
      setPdfUrl(null);
      setLoadError(null);
      return;
    }

    setLoading(true);
    setLoadError(null);
    const res = await getPavilionActivitySignedUrlAction({ filePath });
    if (!res.success) {
      setLoadError(res.error);
      setPdfUrl(null);
      setLoading(false);
      return;
    }
    setPdfUrl(res.url);
    setLoading(false);
  }, [open, filePath]);

  useEffect(() => {
    void loadPdf();
  }, [loadPdf]);

  const handleUploadFile = useCallback(async (file: File) => {
    if (!activityDate || !canUpload) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se admiten archivos PDF.');
      return;
    }

    setUploading(true);
    try {
      const fileBase64 = await fileToBase64(file);
      const res = await uploadPavilionActivityAction({
        activityDate,
        fileBase64,
        filename: file.name,
      });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success('PDF subido correctamente');
      trackPavilionPdf(`PDF subido · ${formatYmdShort(activityDate)}`, { activityDate });
      onUploaded();
    } catch {
      toast.error('Error al subir el PDF');
    } finally {
      setUploading(false);
    }
  }, [activityDate, canUpload, onUploaded, trackPavilionPdf]);

  const handleDelete = useCallback(async () => {
    if (!activityDate || !canUpload || !filePath) return;
    if (!confirm('¿Eliminar el PDF de actividades de este día?')) return;

    setDeleting(true);
    try {
      const res = await deletePavilionActivityAction({ activityDate });
      if (!res.success) {
        toast.error(res.error);
        return;
      }
      toast.success('PDF eliminado');
      setPdfUrl(null);
      setLoadError(null);
      onUploaded();
    } catch {
      toast.error('Error al eliminar el PDF');
    } finally {
      setDeleting(false);
    }
  }, [activityDate, canUpload, filePath, onUploaded]);

  if (!open || !activityDate) return null;

  const hasPdf = Boolean(filePath && pdfUrl && !loadError);
  const busy = uploading || deleting;

  return typeof document !== 'undefined'
    ? createPortal(
        <div
          className="fixed inset-0 z-[10050] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
          role="presentation"
        >
          <div
            className="bg-white rounded-[2rem] w-full max-w-lg max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUploadFile(file);
                e.target.value = '';
              }}
            />

            <div className="bg-[#36606F] px-2 py-2 text-white shrink-0 flex items-center gap-0.5">
              <div className="flex items-center justify-center gap-0 shrink-0 min-w-0 flex-1">
                <button
                  type="button"
                  onClick={() => {
                    if (activityDate) {
                      const [y, m, d] = activityDate.split('-').map(Number);
                      const next = new Date(y, m - 1, d - 1);
                      const nextStr = format(next, 'yyyy-MM-dd');
                      trackPavilionPdf(formatYmdShort(nextStr), { selectedDate: nextStr, direction: 'prev' });
                    }
                    onNavigateDay(-1);
                  }}
                  className="min-h-[48px] min-w-[36px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors shrink-0"
                  aria-label="Día anterior"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-center capitalize px-0.5 truncate">
                  {format(parseLocalSafe(activityDate), 'EEEE d MMM', { locale: es })}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    if (activityDate) {
                      const [y, m, d] = activityDate.split('-').map(Number);
                      const next = new Date(y, m - 1, d + 1);
                      const nextStr = format(next, 'yyyy-MM-dd');
                      trackPavilionPdf(formatYmdShort(nextStr), { selectedDate: nextStr, direction: 'next' });
                    }
                    onNavigateDay(1);
                  }}
                  className="min-h-[48px] min-w-[36px] flex items-center justify-center hover:bg-white/10 rounded-full transition-colors shrink-0"
                  aria-label="Día siguiente"
                >
                  <ChevronRight size={20} />
                </button>
              </div>

              <div className="flex items-center shrink-0">
                {canUpload ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => fileInputRef.current?.click()}
                      className={headerIconBtn}
                      aria-label="Subir PDF"
                      title="Subir PDF"
                    >
                      {uploading ? (
                        <LoadingSpinner size="sm" className="text-white" />
                      ) : (
                        <Upload size={20} />
                      )}
                    </button>
                    {filePath ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void handleDelete()}
                        className={headerIconBtn}
                        aria-label="Eliminar PDF"
                        title="Eliminar PDF"
                      >
                        {deleting ? (
                          <LoadingSpinner size="sm" className="text-white" />
                        ) : (
                          <Trash2 size={20} />
                        )}
                      </button>
                    ) : null}
                  </>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className={headerIconBtn}
                  aria-label="Cerrar"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex flex-col min-h-0 min-w-0 w-full overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center bg-zinc-50/60 py-16 px-6">
                  <LoadingSpinner className="text-[#36606F]" />
                </div>
              ) : loadError ? (
                <div className="flex flex-col items-center justify-center text-center gap-3 py-12 px-6">
                  <p className="text-sm font-black text-zinc-800">
                    {filePath ? 'No se pudo cargar el PDF' : 'Sin hoja de actividades este día'}
                  </p>
                  {loadError ? (
                    <p className="text-xs font-bold text-zinc-500 max-w-[22rem]">{loadError}</p>
                  ) : null}
                  {canUpload ? (
                    <p className="text-[11px] text-zinc-400 font-bold">Sube un PDF con el icono superior</p>
                  ) : null}
                </div>
              ) : hasPdf && pdfUrl ? (
                <PavilionActivityPdfViewer url={pdfUrl} className="min-w-0 w-full" />
              ) : (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-2">
                  <p className="text-sm font-black text-zinc-700">Sin hoja de actividades</p>
                  {canUpload ? (
                    <p className="text-xs font-bold text-zinc-400">Sube un PDF con el icono superior</p>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;
}
