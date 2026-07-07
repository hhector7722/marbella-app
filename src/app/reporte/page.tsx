'use client';

import { useState, useEffect, useRef } from 'react';
import { format, addDays, getDay, subDays } from 'date-fns';
import { submitReporteAction, ReportePayload } from './actions';
import './premium.css';

interface CategoryEntry {
  id: string;
  name: string;
  selected: boolean;
}

interface Activity {
  id: string;
  data: string;
  activitat: string;
  hora_convocatoria: string;
  hora_finalitzacio: string;
  dayName: 'Dissabte' | 'Diumenge';
  categories: CategoryEntry[];
  total_participants: number;
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

function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const timeOptions: string[] = [];
  for (let h = 7; h <= 23; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    if (h < 23) timeOptions.push(`${String(h).padStart(2, '0')}:30`);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
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
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const allSelected = act.categories.every(c => c.selected);
  const selectedNames = act.categories.filter(c => c.selected).map(c => c.name);
  const displayNames = selectedNames.length > 0 ? selectedNames.join(', ') : '';

  const getCategoryLabel = (name: string) => {
    const ageMap: Record<string, string> = {
      'Prebenjamí': ' (6–7)',
      'Benjamí': ' (8–9)',
      'Aleví': ' (10–11)',
      'Infantil': ' (12–13)',
      'Cadet': ' (14–15)',
      'Juvenil': ' (16–18)',
      'Senior': ' (+18)',
      'Veterans': ' (+65)'
    };
    return `${name}${ageMap[name] || ''}`;
  };

  return (
    <div className="relative flex-1 h-[36px]">
      <div
        onClick={() => setOpen(true)}
        className="form-input w-full h-full flex items-center justify-center px-2 rounded-xl cursor-pointer text-xs text-center border border-slate-700/50 hover:border-indigo-500/50 transition-colors overflow-hidden"
      >
        {categoryOptions.length === 0 ? (
           <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
        ) : (
           <span className="truncate w-full text-white font-medium">{displayNames || 'Selecciona'}</span>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-lg" onClick={() => setOpen(false)}>
          <div 
            ref={dropdownRef}
            className="w-full max-w-sm rounded-2xl bg-slate-800 border border-slate-700 shadow-2xl p-4"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-700">
              <h3 className="text-white font-bold text-sm">Categories</h3>
              <button
                type="button"
                onClick={() => onSelectAll(act.id)}
                className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                {allSelected ? 'Desseleccionar totes' : 'Seleccionar totes'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 max-h-[60vh] overflow-y-auto pr-1">
              {act.categories.map(cat => (
                <label
                  key={cat.id}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all text-sm hover:bg-slate-700/50"
                >
                  <input
                    type="checkbox"
                    checked={cat.selected}
                    onChange={() => onToggle(act.id, cat.id)}
                    className="sr-only"
                  />
                  <span className={`w-4 h-4 rounded border flex items-center justify-center transition-all shrink-0 ${
                    cat.selected
                      ? 'bg-indigo-500 border-indigo-500'
                      : 'border-slate-600 bg-slate-700'
                  }`}>
                    {cat.selected && (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="text-slate-200 font-medium">{getCategoryLabel(cat.name)}</span>
                </label>
              ))}
            </div>
            <button 
              type="button" 
              onClick={() => setOpen(false)}
              className="w-full mt-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm transition-colors"
            >
              Acceptar
            </button>
          </div>
        </div>
      )}
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

  // We initialize activities synchronously so cards appear immediately
  useEffect(() => {
    const { saturday, sunday } = getNextWeekend();
    setActivities([
      {
        id: crypto.randomUUID(),
        data: saturday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Dissabte',
        categories: [],
        total_participants: 0,
      },
      {
        id: crypto.randomUUID(),
        data: sunday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Diumenge',
        categories: [],
        total_participants: 0,
      },
    ]);
  }, []);

  useEffect(() => {
    const body = document.body;
    const origBg = body.style.background;
    const origBgImg = body.style.backgroundImage;
    body.style.background = '#0f172a';
    body.style.backgroundImage = 'none';
    return () => {
      body.style.background = origBg;
      body.style.backgroundImage = origBgImg;
    };
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

  const buildDefaultCategories = (): CategoryEntry[] =>
    categoryOptions.map(c => ({ id: c.id, name: c.name, selected: false }));

  // When categoryOptions load, apply them to existing activities that have empty categories
  useEffect(() => {
    if (categoryOptions.length === 0) return;
    setActivities(prev => prev.map(a => {
      if (a.categories.length === 0) {
        return { ...a, categories: buildDefaultCategories() };
      }
      return a;
    }));
  }, [categoryOptions]);

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

  const handleChange = (id: string, field: keyof Activity, value: any) => {
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
          categories: a.categories.map(c =>
            c.id === catId ? { ...c, selected: !c.selected } : c
          ),
        };
      })
    );
  };

  const handleSelectAllCategories = (actId: string) => {
    setActivities(prev =>
      prev.map(a => {
        if (a.id !== actId) return a;
        const allSelected = a.categories.every(c => c.selected);
        return {
          ...a,
          categories: a.categories.map(c => ({ ...c, selected: !allSelected })),
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
          id: crypto.randomUUID(),
          data: firstAct?.data || '',
          activitat: '',
          hora_convocatoria: '',
          hora_finalitzacio: '',
          dayName,
          categories: buildDefaultCategories(),
          total_participants: 0,
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
        selected_category_ids: a.categories.filter(c => c.selected).map(c => c.id),
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
              <div className="grid grid-cols-[120px_1fr] gap-x-6 gap-y-1.5 items-start">
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Data</label>
                  <input
                    type="date"
                    value={act.data}
                    onChange={(e) => handleChange(act.id, 'data', e.target.value)}
                    className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Activitat</label>
                  <div className="relative">
                    {loadingDaily[act.data] || isLoadingGlobal ? (
                      <div className="form-input w-full h-[32px] rounded-xl flex items-center justify-center bg-slate-800 border border-slate-700/50">
                        <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                      </div>
                    ) : (
                      act.activitat === 'Texto libre' ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            autoFocus
                            placeholder="Nom de la nova activitat..."
                            onChange={(e) => {
                              // We just store it in 'activitat'. 
                              // But wait, if they type, it will replace 'Texto libre'.
                              // We need a way to know it's custom. We can just set 'activitat' to whatever they type.
                              // If they clear it entirely, they can go back.
                              handleChange(act.id, 'activitat', e.target.value);
                            }}
                            value={act.activitat === 'Texto libre' ? '' : act.activitat}
                            className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-indigo-500 text-center"
                          />
                          <button type="button" onClick={() => handleChange(act.id, 'activitat', '')} className="text-slate-400 hover:text-white">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <select
                          value={act.activitat}
                          onChange={(e) => handleChange(act.id, 'activitat', e.target.value)}
                          className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-slate-700/50 appearance-none text-center"
                          style={{ textAlignLast: 'center' }}
                        >
                          <option value="" disabled>Selecciona una activitat</option>
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
              </div>
              <div className="grid grid-cols-[120px_1fr_70px] gap-x-6 gap-y-2.5 items-start mt-1.5">
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Horari</label>
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
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Categoria</label>
                  <CategoryDropdown
                    act={act}
                    categoryOptions={categoryOptions}
                    onSelectAll={handleSelectAllCategories}
                    onToggle={handleCategoryToggle}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Participants</label>
                  <input
                    type="number"
                    min="0"
                    value={act.total_participants || ''}
                    onChange={(e) => handleTotalParticipants(act.id, parseInt(e.target.value) || 0)}
                    placeholder="0"
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
    <div className="reporte-container px-3 overflow-x-hidden">
      <div className="max-w-lg mx-auto pt-0 pb-1">
        <form id="reportForm" className="space-y-1" onSubmit={handleSubmit}>
          <div className="flex justify-center mb-1">
            <img src="/icons/logo-white.png" alt="Bar La Marbella" className="h-10 w-auto object-contain" />
          </div>
          <div id="daysContainer" className="space-y-4">
            {renderDayGroup('Dissabte')}
            {renderDayGroup('Diumenge')}
          </div>

          <button
            type="submit"
            className="w-full btn-premium py-3 rounded-xl text-base font-bold shadow-2xl uppercase tracking-widest"
          >
            ENVIAR
          </button>
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
  );
}
