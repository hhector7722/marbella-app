'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Check, Loader2, Trash2, Plus, RefreshCw, Merge } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  prepareReviewAction,
  fetchVenuesAction,
  getActivitiesByDateAction,
  saveActivitiesAction,
  type VenueOption,
} from '@/app/staff/actividades/revision/actions';
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import type { Occupation } from '@/lib/pavilion/parser';

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
  
  const [dateStr, setDateStr] = useState<string | null>(dateParam);
  const [editableOccupations, setEditableOccupations] = useState<Occupation[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [allVenues, setAllVenues] = useState<VenueOption[]>([]);
  const [loadedFromDb, setLoadedFromDb] = useState(false);

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

  const loadData = useCallback(async (forceOcr = false) => {
    setState('loading');
    setError(null);

    // If date exists and we don't force OCR, try to get from DB
    if (dateParam && !forceOcr) {
      const res = await getActivitiesByDateAction({ date: dateParam });
      if (res.success && res.data.occupations.length > 0) {
        setEditableOccupations(res.data.occupations);
        setDateStr(res.data.date);
        setLoadedFromDb(true);
        setState('parsed');
        return;
      }
    }

    if (!filePath) {
      setState('error');
      setError('No hay datos para esta fecha y no se ha proporcionado un archivo PDF.');
      return;
    }

    const res = await prepareReviewAction({ filePath });
    if (!res.success) {
      setState('error');
      setError(res.error);
      return;
    }

    setEditableOccupations(res.data.occupations);
    setDateStr(res.data.date);
    setLoadedFromDb(false);
    setState('parsed');
  }, [dateParam, filePath]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleAccept = async () => {
    if (!dateStr) return;
    
    setState('importing');

    const res = await saveActivitiesAction({
      date: dateStr,
      occupations: editableOccupations,
    });

    if (!res.success) {
      toast.error(res.error);
      setState('parsed');
      return;
    }

    toast.success(
      `Guardado correctamente: ${res.result.occurrencesInserted} ocurrencias.`,
      { duration: 5000 },
    );

    router.push('/staff/actividades');
  };

  const handleCancel = () => router.back();
  const handleRetry = () => void loadData();

  const updateOccupation = (index: number, field: keyof Occupation, value: any) => {
    setEditableOccupations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const toggleVenue = (index: number, venueCode: string) => {
    setEditableOccupations((prev) => {
      const next = [...prev];
      const venues = new Set(next[index].venues);
      if (venues.has(venueCode)) venues.delete(venueCode);
      else venues.add(venueCode);
      next[index] = { ...next[index], venues: Array.from(venues) };
      return next;
    });
  };

  const removeRow = (index: number) => {
    if (!confirm('¿Eliminar actividad?')) return;
    setEditableOccupations((prev) => prev.filter((_, i) => i !== index));
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const addRow = () => {
    setEditableOccupations((prev) => [
      ...prev,
      { activity: '', start_time: '09:00', end_time: '10:00', venues: [], date: dateStr! },
    ]);
  };

  const toggleSelect = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const handleMerge = () => {
    if (selectedIndices.size < 2) return;
    const arr = Array.from(selectedIndices).sort((a, b) => a - b);
    const first = editableOccupations[arr[0]];
    const name = prompt('Nombre unificado:', first.activity);
    if (!name) return;
    
    let start = first.start_time;
    let end = first.end_time;
    const venues = new Set<string>();

    for (const i of arr) {
      const o = editableOccupations[i];
      if (o.start_time < start) start = o.start_time;
      if (o.end_time > end) end = o.end_time;
      for (const v of o.venues) venues.add(v);
    }

    const merged: Occupation = {
      ...first,
      activity: name,
      start_time: start,
      end_time: end,
      venues: Array.from(venues),
    };

    const toRemove = new Set(arr.slice(1));
    setEditableOccupations((prev) => {
      const next = [...prev];
      next[arr[0]] = merged;
      return next.filter((_, i) => !toRemove.has(i));
    });
    setSelectedIndices(new Set());
  };

  if (authChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <LoadingSpinner className="text-[#36606F]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 pb-6">
      <div className="mx-auto max-w-5xl px-3 pt-4 md:pt-8">
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
                Editar horario
              </h1>
            </div>
            {loadedFromDb && filePath && (
              <button
                type="button"
                onClick={() => void loadData(true)}
                className="flex items-center gap-2 rounded-xl bg-white/20 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-white/30"
              >
                <RefreshCw size={14} />
                Re-procesar con OCR
              </button>
            )}
          </div>

          {/* ---- Content ---- */}
          {state === 'loading' && (
            <div className="flex flex-col items-center gap-4 px-6 py-20">
              <LoadingSpinner size="xl" className="text-[#36606F]" />
              <div className="text-center">
                <p className="text-sm font-black text-zinc-800">
                  Cargando datos
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
                  Error
                </p>
                <p className="mt-1 text-xs font-bold text-zinc-500">
                  {error}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="min-h-12 rounded-xl bg-[#36606F] px-6 font-black text-white hover:bg-[#2A4C58]"
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

          {(state === 'parsed' || state === 'importing') && (
            <>
              {/* ---- Info ---- */}
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
                <p className="text-sm font-black text-zinc-900">
                  {dateStr ? formatDate(dateStr) : 'Data desconeguda'}
                </p>
                {selectedIndices.size > 1 && (
                  <button
                    type="button"
                    onClick={handleMerge}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-blue-700 hover:bg-blue-100"
                  >
                    <Merge size={14} />
                    Unificar seleccionadas ({selectedIndices.size})
                  </button>
                )}
              </div>

              {/* ---- Table Editor ---- */}
              <div className="w-full overflow-x-auto">
                <table className="w-full table-auto border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/50">
                      <th className="w-10 px-3 py-2 text-center"></th>
                      <th className="min-w-[150px] px-3 py-2 font-bold text-zinc-500">Actividad</th>
                      <th className="w-24 px-3 py-2 font-bold text-zinc-500">Inicio</th>
                      <th className="w-24 px-3 py-2 font-bold text-zinc-500">Fin</th>
                      <th className="min-w-[200px] px-3 py-2 font-bold text-zinc-500">Pistas</th>
                      <th className="w-12 px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {editableOccupations.map((occ, i) => (
                      <tr key={i} className="border-b border-zinc-50 hover:bg-zinc-50/30">
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIndices.has(i)}
                            onChange={() => toggleSelect(i)}
                            className="rounded border-zinc-300"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={occ.activity}
                            onChange={(e) => updateOccupation(i, 'activity', e.target.value)}
                            className="w-full rounded-md border border-zinc-200 px-2 py-1 text-sm focus:border-[#36606F] focus:outline-none"
                            placeholder="Nombre de la actividad"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="time"
                            value={occ.start_time}
                            onChange={(e) => updateOccupation(i, 'start_time', e.target.value)}
                            className="w-full rounded-md border border-zinc-200 px-1 py-1 text-sm focus:border-[#36606F] focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="time"
                            value={occ.end_time}
                            onChange={(e) => updateOccupation(i, 'end_time', e.target.value)}
                            className="w-full rounded-md border border-zinc-200 px-1 py-1 text-sm focus:border-[#36606F] focus:outline-none"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-wrap gap-1">
                            {allVenues.map((v) => {
                              const active = occ.venues.includes(v.code);
                              return (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => toggleVenue(i, v.code)}
                                  className={cn(
                                    'rounded px-2 py-0.5 text-xs font-bold transition-colors border',
                                    active
                                      ? 'bg-zinc-800 text-white border-zinc-800'
                                      : 'bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-100',
                                  )}
                                >
                                  {v.code}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            type="button"
                            onClick={() => removeRow(i)}
                            className="rounded p-1 text-zinc-300 hover:bg-red-50 hover:text-red-500"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              
              <div className="p-4">
                <button
                  type="button"
                  onClick={addRow}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 px-4 py-2 text-sm font-bold text-zinc-500 hover:border-zinc-400 hover:text-zinc-700"
                >
                  <Plus size={16} />
                  Añadir actividad
                </button>
              </div>

              {/* ---- Footer actions ---- */}
              <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-4 py-4">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={state === 'importing'}
                  className="min-h-12 rounded-xl border border-zinc-200 bg-white px-5 font-black text-zinc-900 transition-colors hover:bg-zinc-50 disabled:opacity-50"
                >
                  Cancel·lar
                </button>
                <button
                  type="button"
                  onClick={() => void handleAccept()}
                  disabled={state === 'importing'}
                  className="flex min-h-12 items-center gap-2 rounded-xl bg-emerald-600 px-5 font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {state === 'importing' ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                  Guardar horario
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
