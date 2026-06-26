'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Check, EyeOff, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { ActivityReviewCard } from '@/components/pavilion/ActivityReviewCard';
import {
  prepareReviewAction,
  confirmImportAction,
  type ReviewData,
} from '@/app/staff/actividades/revision/actions';
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

type PageState = 'loading' | 'parsed' | 'importing' | 'error';

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatDate(dateStr: string): string {
  const d = parseLocalSafe(dateStr);
  const raw = format(d, 'EEEE d MMMM yyyy', { locale: es });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function PavilionRevisionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filePath = searchParams.get('filePath');
  const dateParam = searchParams.get('date');

  const [authChecking, setAuthChecking] = useState(true);
  const [state, setState] = useState<PageState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData | null>(null);
  const [hideExisting, setHideExisting] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? '';
      if (!isMasterDashboardUser(email)) {
        router.replace('/staff/actividades');
      } else {
        setAuthChecking(false);
      }
    }
    void checkAuth();
  }, [router]);

  const loadReview = useCallback(async () => {
    if (!filePath) {
      setState('error');
      setError('No s\'ha proporcionat cap fitxer per revisar.');
      return;
    }

    setState('loading');
    setError(null);

    const res = await prepareReviewAction({ filePath });
    if (!res.success) {
      setState('error');
      setError(res.error);
      return;
    }

    setReviewData(res.data);
    setState('parsed');
  }, [filePath]);

  useEffect(() => {
    void loadReview();
  }, [loadReview]);

  const handleAccept = async () => {
    if (!reviewData) return;

    setState('importing');

    const res = await confirmImportAction({
      date: reviewData.date,
      occupations: reviewData.occupations,
    });

    if (!res.success) {
      toast.error(res.error);
      setState('parsed');
      return;
    }

    toast.success(
      `Importació completada: ${res.result.occurrencesInserted} ocurrencies, ` +
      `${res.result.activitiesCreated} activitats noves, ` +
      `${res.result.venuesCreated} espais nous`,
      { duration: 5000 },
    );

    router.push('/staff/actividades');
  };

  const handleCancel = () => {
    router.back();
  };

  const handleRetry = () => {
    void loadReview();
  };

  const date = dateParam || reviewData?.date || null;
  const occupations = reviewData?.occupations ?? [];
  const matches = reviewData?.matches ?? [];

  const filteredIndices = occupations
    .map((_, i) => i)
    .filter((i) => !hideExisting || matches[i]?.status !== 'existing');

  const existingCount = matches.filter((m) => m.status === 'existing').length;
  const newCount = matches.filter((m) => m.status === 'new').length;
  const uncertainCount = matches.filter((m) => m.status === 'uncertain').length;

  const isImporting = state === 'importing';
  const uniqueVenues = new Set(occupations.flatMap((o) => o.venues));
  const uniqueActivities = occupations.length;

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <LoadingSpinner className="text-[#36606F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-6">
      <div className="mx-auto max-w-3xl px-3 pt-4 md:pt-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/40 bg-white shadow-xl">
          {/* ---- Header bar ---- */}
          <div className="flex shrink-0 items-center gap-3 bg-[#36606F] px-4 py-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
              aria-label="Tornar"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="truncate text-sm font-black uppercase tracking-widest text-white">
                Revisar importació
              </h1>
            </div>
          </div>

          {/* ---- Content ---- */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-4 px-6 py-20">
              <LoadingSpinner size="xl" className="text-[#36606F]" />
              <div className="text-center">
                <p className="text-sm font-black text-zinc-800">
                  Analitzant PDF
                </p>
                <p className="mt-1 text-[11px] font-bold text-zinc-400">
                  Gemini Vision OCR en procés...
                </p>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <span className="text-xl font-black text-red-500">!</span>
              </div>
              <div>
                <p className="text-sm font-black text-zinc-800">
                  Error en analitzar el PDF
                </p>
                <p className="mt-1 text-xs font-bold text-zinc-500">
                  {error}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="min-h-12 rounded-xl bg-[#36606F] px-6 font-black text-white hover:bg-[#2A4C58] active:scale-[0.99]"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleCancel}
                  className="min-h-12 rounded-xl border border-zinc-200 bg-white px-6 font-black text-zinc-900 hover:bg-zinc-50"
                >
                  Tornar
                </button>
              </div>
            </div>
          )}

          {state === 'parsed' && reviewData && (
            <>
              {/* ---- Summary card ---- */}
              <div className="border-b border-zinc-100 px-4 py-4">
                <p className="text-sm font-black text-zinc-900">
                  {date ? formatDate(date) : 'Data desconeguda'}
                </p>

                {reviewData.filename && (
                  <p className="mt-1 text-[11px] font-bold text-zinc-400">
                    PDF: {reviewData.filename}
                  </p>
                )}

                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                  <span className="font-bold text-zinc-500">
                    {uniqueActivities} activitats
                  </span>
                  <span className="text-zinc-300">·</span>
                  <span className="font-bold text-zinc-500">
                    {uniqueVenues.size} espais
                  </span>
                  <span className="text-zinc-300">·</span>
                  <span className="font-bold text-emerald-600">
                    {existingCount} existents
                  </span>
                  {newCount > 0 && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span className="font-bold text-amber-600">
                        {newCount} noves
                      </span>
                    </>
                  )}
                  {uncertainCount > 0 && (
                    <>
                      <span className="text-zinc-300">·</span>
                      <span className="font-bold text-blue-600">
                        {uncertainCount} dubtoses
                      </span>
                    </>
                  )}
                </div>

                <div className="mt-3 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-amber-700">
                    <span className="text-xs">{'\u23F3'}</span>
                    Pendent de validar
                  </span>
                </div>

                {existingCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setHideExisting((v) => !v)}
                    className="mt-3 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-zinc-400 transition-colors hover:text-zinc-600"
                  >
                    {hideExisting ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                    {hideExisting
                      ? `Mostrar totes (${occupations.length})`
                      : `Ocultar existents (${existingCount})`}
                  </button>
                )}
              </div>

              {/* ---- Activity cards ---- */}
              <div className="space-y-2 px-4 py-4">
                {filteredIndices.length === 0 && hideExisting ? (
                  <div className="py-8 text-center">
                    <p className="text-xs font-bold text-zinc-400">
                      Totes les activitats ja existeixen
                    </p>
                  </div>
                ) : (
                  filteredIndices.map((i) => (
                    <ActivityReviewCard
                      key={i}
                      occupation={occupations[i]}
                      match={matches[i]}
                    />
                  ))
                )}
              </div>

              {/* ---- Footer actions ---- */}
              <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-4 py-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={isImporting}
                  className="min-h-12 rounded-xl border border-zinc-200 bg-white px-5 font-black text-zinc-900 transition-colors hover:bg-zinc-50 active:scale-[0.99] disabled:opacity-50"
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  onClick={() => void handleAccept()}
                  disabled={isImporting}
                  className={cn(
                    'flex min-h-12 items-center gap-2 rounded-xl px-5 font-black text-white transition-all active:scale-[0.99] disabled:opacity-50',
                    'bg-emerald-600 hover:bg-emerald-700',
                  )}
                >
                  {isImporting ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Check size={18} />
                  )}
                  Acceptar importació
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
