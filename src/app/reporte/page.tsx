'use client';

import { useState, useEffect, useRef } from 'react';
import { format, addDays, getDay, subDays } from 'date-fns';
import { submitReporteAction, ReportePayload } from './actions';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { DashboardDetailLayout } from '@/components/dashboard/DashboardDetailLayout';
import { randomId } from '@/lib/random-id';
import './premium.css';

interface Activity {
  id: string;
  data: string;
  activitat: string;
  hora_convocatoria: string;
  hora_finalitzacio: string;
  dayName: 'Dissabte' | 'Diumenge';
  selectedCategoryIds: string[];
  total_participants: number;
  freeTextMode: boolean;
}

interface CategoryOption {
  id: string;
  name: string;
}

function getNextWeekend() {
  const today = new Date();
  const day = getDay(today);
  let sat = new Date(today);
  if (day === 0) {
    sat = subDays(today, 1);
  } else {
    sat = addDays(today, (6 - day + 7) % 7);
  }
  const sun = addDays(sat, 1);
  return {
    saturday: format(sat, 'yyyy-MM-dd'),
    sunday: format(sun, 'yyyy-MM-dd'),
  };
}

function formatDateDisplay(iso: string): string {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function DateInput({ id, value, onChange }: { id?: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="form-input relative flex w-full min-w-0 items-center justify-center overflow-hidden rounded-xl">
      <span className="pointer-events-none text-xs font-medium text-white">
        {formatDateDisplay(value)}
      </span>
      <input
        id={id}
        ref={ref}
        type="date"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          ref.current?.blur();
        }}
        className="reporte-date-input absolute inset-0 z-10 cursor-pointer opacity-0"
      />
    </div>
  );
}

function TimePicker({
  value,
  onChange,
  openAt,
}: {
  value: string;
  onChange: (v: string) => void;
  openAt?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  const pendingOpenAt = useRef(false);
  const timeOptions: string[] = [];
  for (let h = 7; h <= 23; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 23) timeOptions.push(`${String(h).padStart(2, '0')}:30`);
  }

  const revealInitialHour = () => {
    const select = ref.current;
    if (!select || value || !openAt) return;
    const idx = Array.from(select.options).findIndex((o) => o.value === openAt);
    if (idx < 0) return;
    select.selectedIndex = idx;
    pendingOpenAt.current = true;
  };

  return (
    <select
      ref={ref}
      value={value}
      onMouseDown={revealInitialHour}
      onTouchStart={revealInitialHour}
      onFocus={revealInitialHour}
      onBlur={() => {
        if (pendingOpenAt.current && ref.current) {
          pendingOpenAt.current = false;
          ref.current.selectedIndex = 0;
        }
      }}
      onChange={(e) => {
        pendingOpenAt.current = false;
        onChange(e.target.value);
      }}
      className="form-input flex-1 rounded-xl px-1 py-1.5 outline-none text-[11px] text-white min-w-0 appearance-none text-center"
      style={{ textAlignLast: 'center' }}
    >
      <option value=""></option>
      {timeOptions.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

interface CategoryDropdownProps {
  act: Activity;
  categoryOptions: CategoryOption[];
  onSelectAll: (actId: string) => void;
  onToggle: (actId: string, catId: string) => void;
}

function CategoryDropdown({ act, categoryOptions, onSelectAll, onToggle }: CategoryDropdownProps) {
  const [open, setOpen] = useState(false);

  const selectedIds = act.selectedCategoryIds;
  const allSelected = categoryOptions.length > 0 && categoryOptions.every(c => selectedIds.includes(c.id));
  const selectedNames = categoryOptions.filter(c => selectedIds.includes(c.id)).map(c => c.name);
  const displayNames = selectedNames.length > 0 ? selectedNames.join(', ') : '';

  const ageMap: Record<string, string> = {
    'Prebenjamí': ' (-8)',
    'Benjamí': ' (8–9)',
    'Aleví': ' (10–11)',
    'Infantil': ' (12–13)',
    'Cadet': ' (14–15)',
    'Juvenil': ' (16–18)',
    'Senior': ' (+18)',
    'Veterans': ' (+65)'
  };

  return (
    <div className="relative h-[36px] min-w-0">
      <div
        onClick={() => setOpen(true)}
        className="form-input w-full h-full flex items-center justify-center px-2 rounded-xl cursor-pointer text-xs text-center border border-slate-700/50 hover:border-indigo-500/50 transition-colors overflow-hidden"
      >
        {categoryOptions.length === 0 ? (
           <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        ) : (
           <span className="truncate w-full text-white font-medium">{displayNames}</span>
        )}
      </div>
      {open ? (
        <Modal
          open={open}
          onClose={() => setOpen(false)}
          title="Categories"
          variant="standard"
          layer="base"
          headerTone="petroleum"
          scheme="dark"
          instance={`reporte-categories-${act.id}`}
          usageId="reporte-categories"
          usageLabel="Categories reporte"
          footer={
            <Button
              type="button"
              variant="primary"
              instance={`reporte-categories-acceptar-${act.id}`}
              onClick={() => setOpen(false)}
            >
              Acceptar
            </Button>
          }
        >
          <div className="flex items-center justify-end pb-3">
            <Button
              type="button"
              variant="tertiary"
              instance={`reporte-categories-toggle-all-${act.id}`}
              onClick={() => onSelectAll(act.id)}
            >
              {allSelected ? 'Desseleccionar totes' : 'Seleccionar totes'}
            </Button>
          </div>
          <div className="grid max-h-[60vh] grid-cols-2 gap-2 overflow-y-auto pr-1">
            {categoryOptions.map((cat) => {
              const selected = selectedIds.includes(cat.id);
              return (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-all hover:bg-white/10"
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggle(act.id, cat.id)}
                  className="sr-only"
                />
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all ${
                    selected
                      ? 'border-ds-marca bg-ds-marca'
                      : 'border-white/40 bg-transparent'
                  }`}
                >
                  {selected ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : null}
                </span>
                <span className="font-medium text-zinc-800">
                  {cat.name}
                  {ageMap[cat.name] ? (
                    <span className="ml-0.5 text-[10px] font-normal text-zinc-400">{ageMap[cat.name]}</span>
                  ) : null}
                </span>
              </label>
              );
            })}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export default function ReportePage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allGlobalActivities, setAllGlobalActivities] = useState<string[]>([]);
  const [dailyActivitiesMap, setDailyActivitiesMap] = useState<Record<string, string[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);
  
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);
  const [loadingDaily, setLoadingDaily] = useState<Record<string, boolean>>({});

  // Las fechas del fin de semana se calculan en el cliente (no en el servidor)
  // para evitar desajustes de zona horaria al hidratar la pantalla.
  useEffect(() => {
    const { saturday, sunday } = getNextWeekend();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActivities([
      {
        id: randomId(),
        data: saturday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Dissabte',
        selectedCategoryIds: [],
        total_participants: 0,
        freeTextMode: false,
      },
      {
        id: randomId(),
        data: sunday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Diumenge',
        selectedCategoryIds: [],
        total_participants: 0,
        freeTextMode: false,
      },
    ]);
  }, []);

  useEffect(() => {
    import('./actions').then(m => m.getAllActivitiesAction()).then(globals => {
      setAllGlobalActivities(globals);
      setIsLoadingGlobal(false);
    });
    import('./actions').then(m => m.getParticipantCategoriesAction()).then(cats => {
      setCategoryOptions(cats);
    });
  }, []);

  const fetchDailyActivities = async (date: string) => {
    if (dailyActivitiesMap[date]) return;
    setLoadingDaily(prev => ({ ...prev, [date]: true }));
    const m = await import('./actions');
    const daily = await m.getDailyActivitiesAction(date);
    const top = await m.getTopActivityAction(date);

    setDailyActivitiesMap(prev => ({
      ...prev,
      [date]: daily,
    }));

    setLoadingDaily(prev => ({ ...prev, [date]: false }));
  };

  useEffect(() => {
    const dates = new Set(activities.map(a => a.data));
    dates.forEach(d => {
      if (d) fetchDailyActivities(d);
    });
  }, [activities.map(a => a.data).join(','), allGlobalActivities]);

  const handleChange = <K extends keyof Activity>(id: string, field: K, value: Activity[K]) => {
    setActivities((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a;
        const newA = { ...a, [field]: value };
        if (field === 'data' && typeof value === 'string') {
          fetchDailyActivities(value);
        }
        return newA;
      })
    );
  };

  const handleCategoryToggle = (actId: string, catId: string) => {
    setActivities(prev =>
      prev.map(a => {
        if (a.id !== actId) return a;
        return {
          ...a,
          selectedCategoryIds: a.selectedCategoryIds.includes(catId)
            ? a.selectedCategoryIds.filter(id => id !== catId)
            : [...a.selectedCategoryIds, catId],
        };
      })
    );
  };

  const handleSelectAllCategories = (actId: string) => {
    setActivities(prev =>
      prev.map(a => {
        if (a.id !== actId) return a;
        const allSelected =
          categoryOptions.length > 0 &&
          categoryOptions.every(c => a.selectedCategoryIds.includes(c.id));
        return {
          ...a,
          selectedCategoryIds: allSelected ? [] : categoryOptions.map(c => c.id),
        };
      })
    );
  };

  const handleTotalParticipants = (actId: string, total: number) => {
    setActivities(prev =>
      prev.map(a =>
        a.id === actId ? { ...a, total_participants: total } : a
      )
    );
  };

  const handleAddActivity = (dayName: 'Dissabte' | 'Diumenge') => {
    setActivities((prev) => {
      const dayActs = prev.filter((a) => a.dayName === dayName);
      if (dayActs.length >= 2) return prev;
      const firstAct = dayActs[0];
      return [
        ...prev,
        {
          id: randomId(),
          data: firstAct?.data || '',
          activitat: '',
          hora_convocatoria: '',
          hora_finalitzacio: '',
          dayName,
          selectedCategoryIds: [],
          total_participants: 0,
          freeTextMode: false,
        },
      ];
    });
  };

  const handleRemoveActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setShowModal(true);
    setSubmitStatus('sending');

    try {
      const payload: ReportePayload[] = activities.map(a => ({
        data: a.data,
        activitat: a.activitat,
        hora_convocatoria: a.hora_convocatoria,
        hora_finalitzacio: a.hora_finalitzacio,
        selected_category_ids: a.selectedCategoryIds,
        total_participants: a.total_participants,
      }));

      await submitReporteAction(payload);
      setSubmitStatus('sent');
    } catch (err) {
      console.error(err);
      setShowModal(false);
      setSubmitStatus('idle');
      alert("S'ha produït un error en enviar l'informe.");
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    if (submitStatus === 'sent') {
      window.location.reload();
    }
  };

  const renderDayGroup = (dayName: 'Dissabte' | 'Diumenge') => {
    const dayActivities = activities.filter((a) => a.dayName === dayName);

    return (
      <div className="day-group mb-3" key={dayName}>
        <h2 className="text-sm font-bold text-white mb-1">{dayName}</h2>
        <div className="activities-list space-y-2 relative">
          {dayActivities.map((act, index) => (
            <div key={act.id} className="activity-card glass rounded-2xl p-3 relative group animate-slide-up bg-slate-800/40">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => handleRemoveActivity(act.id)}
                  className="remove-btn absolute -top-3 -right-3 p-2 rounded-full bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/20 backdrop-blur shadow-lg transition-all z-10"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
              <div className="grid grid-cols-[120px_1fr_70px] gap-x-6 gap-y-1.5 items-start">
                <div className="space-y-1">
                  <label
                    htmlFor={`reporte-data-${act.id}`}
                    className="text-[9px] font-semibold text-slate-500 capitalize tracking-wider ml-1"
                  >
                    Data
                  </label>
                  <DateInput
                    id={`reporte-data-${act.id}`}
                    value={act.data}
                    onChange={(v) => handleChange(act.id, 'data', v)}
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 capitalize tracking-wider ml-1">Activitat</label>
                  <div className="relative">
                    {loadingDaily[act.data] || isLoadingGlobal ? (
                      <div className="form-input w-full h-[32px] rounded-xl flex items-center justify-center bg-slate-800 border border-slate-700/50">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : (
                      act.freeTextMode ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            placeholder="Nom de la nova activitat..."
                            onChange={(e) => handleChange(act.id, 'activitat', e.target.value)}
                            value={act.activitat}
                            className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-indigo-500 text-center"
                          />
                          <button type="button" onClick={() => handleChange(act.id, 'freeTextMode', false)} className="text-slate-400 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <select
                          value={act.activitat}
                          onChange={(e) => {
                            if (e.target.value === 'Texto libre') {
                              handleChange(act.id, 'freeTextMode', true);
                            } else {
                              handleChange(act.id, 'activitat', e.target.value);
                            }
                          }}
                          className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-slate-700/50 appearance-none text-center"
                          style={{ textAlignLast: 'center' }}
                        >
                          <option value="" disabled></option>
                          <option value="Texto libre" className="text-indigo-400 font-semibold">Texto libre...</option>
                          <option disabled>──────────</option>
                          {(dailyActivitiesMap[act.data] || [])
                            .map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      )
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 capitalize tracking-wider ml-1">Horari</label>
                  <div className="flex items-center gap-1 h-[36px]">
                    <TimePicker
                      value={act.hora_convocatoria}
                      onChange={(v) => handleChange(act.id, 'hora_convocatoria', v)}
                    />
                    {act.hora_convocatoria && act.hora_finalitzacio && (
                      <span className="text-slate-600 shrink-0">-</span>
                    )}
                    <TimePicker
                      value={act.hora_finalitzacio}
                      onChange={(v) => handleChange(act.id, 'hora_finalitzacio', v)}
                      openAt="15:30"
                    />
                  </div>
                </div>
                <div className="space-y-1 min-w-0">
                  <label className="text-[9px] font-semibold text-slate-500 capitalize tracking-wider ml-1">Categoria</label>
                  <CategoryDropdown
                    act={act}
                    categoryOptions={categoryOptions}
                    onSelectAll={handleSelectAllCategories}
                    onToggle={handleCategoryToggle}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 capitalize tracking-wider ml-1">Participants</label>
                  <input
                    type="tel"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    value={act.total_participants || ''}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, '');
                      handleTotalParticipants(act.id, digits ? parseInt(digits, 10) : 0);
                    }}
                    className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs text-white text-center"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        {dayActivities.length < 2 && (
          <button
            type="button"
            onClick={() => handleAddActivity(dayName)}
            className="add-activity-btn w-full mt-2 py-2 rounded-xl text-slate-400 text-xs font-semibold flex items-center justify-center gap-2 hover:text-indigo-400 transition-all hover:bg-slate-800/50"
          >
            + Afegir activitat (tarda/nit)
          </button>
        )}
      </div>
    );
  };

  return (
    <DashboardDetailLayout
      title="Reporte"
      showBackButton={false}
      template="form"
      maxWidthClass="max-w-lg"
      contentClassName="p-0"
      className="reporte-screen"
    >
    <div className="reporte-container px-3 overflow-x-hidden">
      <div className="max-w-lg mx-auto pt-0 pb-1">
        <form id="reportForm" className="space-y-1" onSubmit={handleSubmit} onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
          <div className="flex justify-center pt-2 mb-1">
            <img src="/icons/logo-white.png" alt="Bar La Marbella" className="reporte-logo object-contain" />
          </div>
          <div id="daysContainer" className="space-y-4">
            {renderDayGroup('Dissabte')}
            {renderDayGroup('Diumenge')}
          </div>

          <div className="flex justify-center">
            <Button
              type="submit"
              variant="primary"
              instance="reporte-enviar"
            >
              ENVIAR
            </Button>
          </div>
        </form>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => { if (submitStatus === 'sent') { setShowModal(false); setSubmitStatus('idle'); } }}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            {submitStatus === 'sending' && (
              <div className="flex flex-col items-center gap-4 py-6">
                <div className="modal-progress-bar">
                  <div className="modal-progress-fill" />
                </div>
                <p className="text-sm text-slate-400">Enviant informació</p>
              </div>
            )}
            {submitStatus === 'sent' && (
              <div className="flex flex-col items-center gap-3 py-4" onClick={(e) => e.stopPropagation()}>
                <div className="modal-success-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-white">Informe enviat</p>
                <button 
                  onClick={() => { setShowModal(false); setSubmitStatus('idle'); }} 
                  className="mt-2 px-8 py-2.5 bg-green-500 hover:bg-green-400 text-white font-bold rounded-xl shadow-lg transition-all"
                >
                  OK
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </DashboardDetailLayout>
  );
}
