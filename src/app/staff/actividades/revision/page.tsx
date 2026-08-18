'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, Check, Trash2, Plus, RefreshCw, Merge } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import {
  prepareReviewAction,
  fetchVenuesAction,
  getActivitiesByDateAction,
  saveActivitiesAction,
  type VenueOption,
} from '@/app/staff/actividades/revision/actions';
import { getParticipantCategoriesAction } from '@/app/reporte/actions';
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
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [loadedFromDb, setLoadedFromDb] = useState(false);

  useEffect(() => {
    async function checkAuth() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const email = session?.user?.email ?? '';
      if (!isMasterDashboardUser(email)) {
        router.replace('/staff/actividades');
      } else {
        const [venuesRes, cats] = await Promise.all([
          fetchVenuesAction(),
          getParticipantCategoriesAction(),
        ]);
        if (venuesRes.success) setAllVenues(venuesRes.data);
        setCategories(cats);
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
      if (dateParam) {
        // Permite crear desde cero si hay fecha pero no archivo
        setEditableOccupations([]);
        setDateStr(dateParam);
        setLoadedFromDb(false);
        setState('parsed');
        return;
      }
      
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

    const occupationsWithColor = res.data.occupations.map((occ, i) => ({
      ...occ,
      color: res.data.matches[i]?.matchedColor || undefined,
    }));

    setEditableOccupations(occupationsWithColor);
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

  const handleCancel = () => {
    if (dateStr) {
      router.push(`/staff/actividades?date=${dateStr}`);
    } else {
      router.back();
    }
  };
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
    <div className="min-h-screen bg-zinc-50 pb-6 lg:pb-10">
      <div className="mx-auto max-w-5xl px-3 pt-4 md:pt-8 lg:max-w-6xl lg:px-8 lg:pt-10">
        <div className="overflow-hidden bg-zinc-50 lg:rounded-2xl lg:border lg:border-zinc-100 lg:bg-white lg:shadow-sm">
          {/* ---- Header bar ---- */}
          <div className="flex shrink-0 items-center gap-3 bg-zinc-50 px-4 py-4 lg:bg-white lg:px-6 lg:py-5 lg:border-b lg:border-zinc-100">
            <button
              type="button"
              onClick={handleCancel}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-zinc-900 transition-colors hover:bg-zinc-200"
              aria-label="Tornar"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="truncate text-sm font-black uppercase tracking-widest text-zinc-900 lg:text-base">
                {dateStr ? format(parseLocalSafe(dateStr), 'EEEE d MMMM yyyy', { locale: es }) : ''}
              </h1>
            </div>
            {loadedFromDb && filePath && (
              <Button
                type="button"
                variant="secondary"
                instance="pavilion-revision-reprocess"
                icon={<RefreshCw size={14} />}
                onClick={() => void loadData(true)}
              >
                Re-procesar con OCR
              </Button>
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
                <Button
                  type="button"
                  variant="primary"
                  instance="pavilion-revision-retry"
                  onClick={handleRetry}
                >
                  Reintentar
                </Button>
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
              <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 lg:px-6">
                <div />
                {selectedIndices.size > 1 && (
                  <Button
                    type="button"
                    variant="secondary"
                    instance="pavilion-revision-merge"
                    icon={<Merge size={14} />}
                    onClick={handleMerge}
                  >
                    Unificar seleccionadas ({selectedIndices.size})
                  </Button>
                )}
              </div>

              {/* ---- Desktop column headers ---- */}
              <div className="hidden lg:grid lg:grid-cols-[2.5rem_minmax(14rem,1.4fr)_minmax(16rem,1.2fr)_5.5rem_4rem_5.5rem_minmax(10rem,1fr)_2.5rem] lg:gap-3 lg:items-center lg:border-b lg:border-zinc-100 lg:bg-zinc-50/80 lg:px-6 lg:py-2.5">
                <span className="sr-only">Seleccionar</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Actividad</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Horario</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Cat</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Pax</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Color</span>
                <span className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Espacios</span>
                <span className="sr-only">Eliminar</span>
              </div>

              {/* ---- List Editor ---- */}
              <div className="w-full divide-y divide-zinc-100 px-4 lg:px-0">
                {editableOccupations.map((occ, i) => (
                  <div key={i} className="py-4 flex flex-col gap-3 lg:grid lg:grid-cols-[2.5rem_minmax(14rem,1.4fr)_minmax(16rem,1.2fr)_5.5rem_4rem_5.5rem_minmax(10rem,1fr)_2.5rem] lg:gap-3 lg:items-start lg:px-6 lg:py-4">
                    {/* Row 1 (móvil): checkbox + nombre + horas + borrar */}
                    <div className="flex flex-wrap items-center gap-2 lg:contents">
                      <div className="flex items-center lg:pt-2.5">
                        <input
                          type="checkbox"
                          checked={selectedIndices.has(i)}
                          onChange={() => toggleSelect(i)}
                          className="rounded border-zinc-300 size-4"
                        />
                      </div>
                      <input
                        type="text"
                        value={occ.activity}
                        onChange={(e) => updateOccupation(i, 'activity', e.target.value)}
                        className="flex-1 rounded-md border border-zinc-200 px-2 py-1.5 text-sm focus:border-[#36606F] focus:outline-none min-w-[120px] lg:min-h-12 lg:w-full lg:px-3 lg:text-sm"
                        placeholder="Nombre de la actividad"
                      />

                      {/* TIME SELECTION */}
                      <div className="flex flex-col gap-2 ml-2 border-l border-zinc-200 pl-3 lg:ml-0 lg:border-l-0 lg:pl-0 lg:gap-1.5 lg:pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase w-10 shrink-0">INICIO</span>
                          {occ.form_start_time ? (
                            <>
                              <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                                <input type="radio" checked={occ.preferred_start_time !== 'form'} onChange={() => updateOccupation(i, 'preferred_start_time', 'pdf')} className="accent-[#36606F]" />
                                PDF:
                                <input type="time" value={occ.start_time} onChange={(e) => updateOccupation(i, 'start_time', e.target.value)} className="w-[70px] rounded-md border border-zinc-200 px-1 py-0.5 focus:border-[#36606F] focus:outline-none lg:min-h-10 lg:w-[88px]" />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] cursor-pointer bg-[#36606F]/10 px-1.5 py-0.5 rounded text-[#36606F]">
                                <input type="radio" checked={occ.preferred_start_time === 'form'} onChange={() => updateOccupation(i, 'preferred_start_time', 'form')} className="accent-[#36606F]" />
                                Reporte: <span className="font-bold">{occ.form_start_time.substring(0, 5)}</span>
                              </label>
                            </>
                          ) : (
                            <input type="time" value={occ.start_time} onChange={(e) => updateOccupation(i, 'start_time', e.target.value)} className="w-[75px] rounded-md border border-zinc-200 px-1 py-0.5 focus:border-[#36606F] focus:outline-none text-sm lg:min-h-10 lg:w-[96px]" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-zinc-400 uppercase w-10 shrink-0">FINAL</span>
                          {occ.form_end_time ? (
                            <>
                              <label className="flex items-center gap-1 text-[11px] cursor-pointer">
                                <input type="radio" checked={occ.preferred_end_time !== 'form'} onChange={() => updateOccupation(i, 'preferred_end_time', 'pdf')} className="accent-[#36606F]" />
                                PDF:
                                <input type="time" value={occ.end_time} onChange={(e) => updateOccupation(i, 'end_time', e.target.value)} className="w-[70px] rounded-md border border-zinc-200 px-1 py-0.5 focus:border-[#36606F] focus:outline-none lg:min-h-10 lg:w-[88px]" />
                              </label>
                              <label className="flex items-center gap-1 text-[11px] cursor-pointer bg-[#36606F]/10 px-1.5 py-0.5 rounded text-[#36606F]">
                                <input type="radio" checked={occ.preferred_end_time === 'form'} onChange={() => updateOccupation(i, 'preferred_end_time', 'form')} className="accent-[#36606F]" />
                                Reporte: <span className="font-bold">{occ.form_end_time.substring(0, 5)}</span>
                              </label>
                            </>
                          ) : (
                            <input type="time" value={occ.end_time} onChange={(e) => updateOccupation(i, 'end_time', e.target.value)} className="w-[75px] rounded-md border border-zinc-200 px-1 py-0.5 focus:border-[#36606F] focus:outline-none text-sm lg:min-h-10 lg:w-[96px]" />
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="rounded p-1.5 text-zinc-300 hover:bg-red-50 hover:text-red-500 shrink-0 ml-auto lg:hidden"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>

                    {/* Row 2 (móvil) / resto de columnas (desktop) */}
                    <div className="flex items-center flex-wrap gap-3 pl-8 lg:contents">
                      <div className="flex items-center gap-1.5 lg:block">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider lg:hidden">CAT</span>
                        <select
                          value={occ.occurrence_groups?.[0]?.category_id || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (!val) {
                              updateOccupation(i, 'occurrence_groups', []);
                            } else {
                              const catName = categories.find(c => c.id === val)?.name || val;
                              updateOccupation(i, 'occurrence_groups', [{ category_id: val, name: catName }]);
                            }
                          }}
                          className="w-32 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:border-zinc-400 focus:outline-none bg-white lg:min-h-12 lg:w-full lg:px-2 lg:text-xs"
                        >
                          <option value="">Selecciona</option>
                          {categories.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-1.5 lg:block">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider lg:hidden">PAX</span>
                        <input
                          type="number"
                          min="0"
                          value={occ.total_participants ?? ''}
                          onChange={(e) => updateOccupation(i, 'total_participants', e.target.value ? parseInt(e.target.value, 10) : null)}
                          className="w-12 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:border-zinc-400 focus:outline-none lg:min-h-12 lg:w-full lg:px-2 lg:text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 border-l border-zinc-200 pl-3 lg:border-l-0 lg:pl-0">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider lg:hidden">COLOR</span>
                        <div className="flex items-center gap-1 lg:pt-2.5">
                          <input
                            type="text"
                            placeholder="#5a9a87"
                            value={occ.color || ''}
                            onChange={(e) => updateOccupation(i, 'color', e.target.value)}
                            className="w-[60px] rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] focus:border-zinc-400 focus:outline-none lg:min-h-10 lg:w-[72px] lg:text-xs"
                          />
                          {occ.color && (
                            <div className="w-4 h-4 rounded-full border border-zinc-200 shrink-0" style={{ backgroundColor: occ.color }} />
                          )}
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap gap-1 border-l border-zinc-200 pl-3 lg:border-l-0 lg:pl-0 lg:pt-1.5">
                        {allVenues.map((v) => {
                          const active = occ.venues.includes(v.code);
                          return (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => toggleVenue(i, v.code)}
                              className={cn(
                                'rounded px-1.5 py-0.5 text-[10px] font-bold transition-colors border lg:min-h-9 lg:px-2 lg:text-[11px]',
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

                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        className="hidden lg:flex lg:min-h-12 lg:min-w-10 lg:items-center lg:justify-center rounded-lg text-zinc-300 hover:bg-red-50 hover:text-red-500"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="p-4 lg:px-6">
                <Button
                  type="button"
                  variant="secondary"
                  instance="pavilion-revision-add"
                  icon={<Plus size={16} />}
                  onClick={addRow}
                >
                  Añadir actividad
                </Button>
              </div>

              {/* ---- Footer actions ---- */}
              <div className="flex items-center justify-end gap-3 border-t border-zinc-100 px-4 py-4 lg:px-6 lg:py-5">
                <Button
                  type="button"
                  variant="secondary"
                  instance="pavilion-revision-cancel"
                  onClick={handleCancel}
                  disabled={state === 'importing'}
                >
                  Cancel·lar
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  instance="pavilion-revision-save"
                  icon={state === 'importing' ? undefined : <Check size={18} />}
                  loading={state === 'importing'}
                  loadingLabel="Guardar horario"
                  onClick={() => void handleAccept()}
                  disabled={state === 'importing'}
                >
                  Guardar horario
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
