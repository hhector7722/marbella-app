'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Check, EyeOff, Eye, Loader2, Trash2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PavilionMatchingBadge } from '@/components/pavilion/PavilionMatchingBadge';
import { PavilionTimeSlot } from '@/components/pavilion/PavilionTimeSlot';
import {
  prepareReviewAction,
  confirmImportAction,
  fetchVenuesAction,
  type ReviewData,
  type VenueOption,
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
  const [deletedIndices, setDeletedIndices] = useState<Set<number>>(new Set());
  const [editedVenues, setEditedVenues] = useState<Map<number, string[]>>(new Map());
  const [allVenues, setAllVenues] = useState<VenueOption[]>([]);
  const [addingVenueFor, setAddingVenueFor] = useState<number | null>(null);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? '';
      if (!isMasterDashboardUser(email)) {
        router.replace('/staff/actividades');
      } else {
        const res = await fetchVenuesAction();
        if (res.success) setAllVenues(res.data);
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

    const adjustedOccupations = [];
    for (let i = 0; i < reviewData.occupations.length; i++) {
      if (deletedIndices.has(i)) continue;
      const occ = reviewData.occupations[i];
      const edited = editedVenues.get(i);
      adjustedOccupations.push(edited ? { ...occ, venues: edited } : occ);
    }

    setState('importing');

    const res = await confirmImportAction({
      date: reviewData.date,
      occupations: adjustedOccupations,
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

  const toggleDelete = (index: number) => {
    setDeletedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const removeVenue = (occIndex: number, venueCode: string) => {
    setEditedVenues((prev) => {
      const next = new Map(prev);
      const current = next.get(occIndex) ?? reviewData!.occupations[occIndex].venues;
      next.set(occIndex, current.filter((v) => v !== venueCode));
      return next;
    });
  };

  const addVenue = (occIndex: number, venueCode: string) => {
    setEditedVenues((prev) => {
      const next = new Map(prev);
      const current = next.get(occIndex) ?? reviewData!.occupations[occIndex].venues;
      if (!current.includes(venueCode)) {
        next.set(occIndex, [...current, venueCode]);
      }
      return next;
    });
    setAddingVenueFor(null);
  };

  const getVenues = (occIndex: number): string[] => {
    return editedVenues.get(occIndex) ?? reviewData!.occupations[occIndex].venues;
  };

  const availableVenuesFor = (occIndex: number): VenueOption[] => {
    const current = getVenues(occIndex);
    return allVenues.filter((v) => !current.includes(v.code));
  };

  const date = dateParam || reviewData?.date || null;
  const occupations = reviewData?.occupations ?? [];
  const matches = reviewData?.matches ?? [];

  const filteredIndices = occupations
    .map((_, i) => i)
    .filter((i) => !deletedIndices.has(i))
    .filter((i) => !hideExisting || matches[i]?.status !== 'existing');

  const existingCount = matches.filter((m, i) => m.status === 'existing' && !deletedIndices.has(i)).length;
  const newCount = matches.filter((m, i) => m.status === 'new' && !deletedIndices.has(i)).length;
  const uncertainCount = matches.filter((m, i) => m.status === 'uncertain' && !deletedIndices.has(i)).length;

  const isImporting = state === 'importing';
  const visibleOccupationsIndices = occupations.map((_, i) => i).filter((i) => !deletedIndices.has(i));
  const uniqueVenues = new Set(visibleOccupationsIndices.flatMap((i) => getVenues(i)));
  const uniqueActivities = visibleOccupationsIndices.length;

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
                  filteredIndices.map((i) => {
                    const occ = occupations[i];
                    const match = matches[i];
                    const venues = getVenues(i);
                    const availableVenues = availableVenuesFor(i);
                    const isDeleted = deletedIndices.has(i);

                    return (
                      <div
                        key={i}
                        className={cn(
                          'rounded-2xl border bg-white px-4 py-3 shadow-sm',
                          isDeleted ? 'border-red-200 opacity-50' : 'border-zinc-100',
                        )}
                      >
                        {/* Header */}
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <h3 className="text-sm font-black text-zinc-900 uppercase tracking-tight leading-tight">
                            {occ.activity}
                          </h3>
                          <div className="flex items-center gap-1 shrink-0">
                            <PavilionMatchingBadge status={match.status} confidence={match.confidence} />
                            <button
                              type="button"
                              onClick={() => toggleDelete(i)}
                              className={cn(
                                'flex items-center justify-center rounded-lg p-1.5 transition-colors',
                                isDeleted
                                  ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                  : 'text-zinc-300 hover:bg-red-50 hover:text-red-500',
                              )}
                              aria-label={isDeleted ? 'Restaurar' : 'Eliminar'}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        {/* Time + Venues */}
                        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                          <PavilionTimeSlot startTime={occ.start_time} endTime={occ.end_time} />
                          <div className="flex flex-wrap gap-1 items-center">
                            {venues.map((v) => (
                              <span
                                key={v}
                                className="inline-flex items-center gap-0.5 rounded-md bg-zinc-100 pl-2 pr-1 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-600"
                              >
                                {v}
                                <button
                                  type="button"
                                  onClick={() => removeVenue(i, v)}
                                  className="ml-0.5 rounded p-0.5 text-zinc-400 hover:bg-red-100 hover:text-red-500"
                                >
                                  <X size={10} />
                                </button>
                              </span>
                            ))}
                            {availableVenues.length > 0 && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setAddingVenueFor(addingVenueFor === i ? null : i)}
                                  className="inline-flex items-center gap-0.5 rounded-md border border-dashed border-zinc-300 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:border-zinc-500 hover:text-zinc-600"
                                >
                                  <Plus size={10} />
                                  Espai
                                </button>
                                {addingVenueFor === i && (
                                  <div className="absolute left-0 top-full z-10 mt-1 max-h-48 w-40 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-1 shadow-lg">
                                    {availableVenues.map((v) => (
                                      <button
                                        key={v.id}
                                        type="button"
                                        onClick={() => addVenue(i, v.code)}
                                        className="block w-full rounded-lg px-3 py-1.5 text-left text-[11px] font-bold text-zinc-700 hover:bg-zinc-100"
                                      >
                                        {v.code}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        <hr className="my-2 border-zinc-100" />

                        {/* OCR text */}
                        <div className="text-[11px] leading-relaxed">
                          <span className="font-bold text-zinc-400 uppercase tracking-wider">Text OCR</span>
                          <span className="ml-2 font-bold text-zinc-500">{occ.activity}</span>
                        </div>

                        {match.status === 'uncertain' && match.matchedName && (
                          <div className="mt-1 text-[11px] leading-relaxed">
                            <span className="font-bold text-zinc-400 uppercase tracking-wider">Millor coincidència</span>
                            <span className="ml-2 font-bold text-blue-600">{match.matchedName}</span>
                          </div>
                        )}

                        {match.status === 'existing' && match.matchedName && match.matchedName !== occ.activity.trim() && (
                          <div className="mt-1 text-[11px] leading-relaxed">
                            <span className="font-bold text-zinc-400 uppercase tracking-wider">Existent com</span>
                            <span className="ml-2 font-bold text-emerald-600">{match.matchedName}</span>
                          </div>
                        )}
                      </div>
                    );
                  })
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
