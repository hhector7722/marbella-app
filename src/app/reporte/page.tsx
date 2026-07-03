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
      className="form-input flex-1 rounded-xl px-1 py-1.5 outline-none text-[11px] text-white min-w-0"
    >
      <option value=""></option>
      {timeOptions.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

export default function ReportePage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [allGlobalActivities, setAllGlobalActivities] = useState<string[]>([]);
  const [dailyActivitiesMap, setDailyActivitiesMap] = useState<Record<string, string[]>>({});
  const [showModal, setShowModal] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);

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
    });
    import('./actions').then(m => m.getParticipantCategoriesAction()).then(cats => {
      setCategoryOptions(cats);
    });
  }, []);

  const buildDefaultCategories = (): CategoryEntry[] =>
    categoryOptions.map(c => ({ id: c.id, name: c.name, selected: false }));

  useEffect(() => {
    if (categoryOptions.length === 0) return;
    const { saturday, sunday } = getNextWeekend();
    setActivities([
      {
        id: crypto.randomUUID(),
        data: saturday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Dissabte',
        categories: buildDefaultCategories(),
        total_participants: 0,
      },
      {
        id: crypto.randomUUID(),
        data: sunday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        dayName: 'Diumenge',
        categories: buildDefaultCategories(),
        total_participants: 0,
      },
    ]);
  }, [categoryOptions]);

  const fetchDailyActivities = async (date: string) => {
    if (dailyActivitiesMap[date]) return;
    const m = await import('./actions');
    const daily = await m.getDailyActivitiesAction(date);
    const top = await m.getTopActivityAction(date);

    setDailyActivitiesMap(prev => ({
      ...prev,
      [date]: daily.length > 0 ? daily : allGlobalActivities,
    }));

    setActivities(prev => prev.map(a => {
      if (a.data === date && !a.activitat && top) {
        return { ...a, activitat: top };
      }
      return a;
    }));
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

  const CategoryDropdown = ({ act }: { act: Activity }) => {
    const [open, setOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const selectedCount = act.categories.filter(c => c.selected).length;

    useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
        if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const allSelected = act.categories.every(c => c.selected);

    return (
      <div className="relative flex-1 h-[36px]" ref={dropdownRef}>
        <div
          onClick={() => setOpen(!open)}
          className="form-input w-full h-full flex items-center px-2 rounded-xl cursor-pointer text-xs"
        >
          <span className="flex-1 text-slate-400">
            {selectedCount > 0
              ? `${selectedCount} categoria${selectedCount !== 1 ? 's' : ''}`
              : ''}
          </span>
        </div>
        {open && (
          <div className="absolute z-20 mt-1 w-full rounded-xl bg-slate-800 border border-slate-700/50 shadow-2xl p-2 animate-fade-in">
            <div className="flex items-center justify-between px-2 pb-1 mb-1 border-b border-slate-700/30">
              <span className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider">Categories</span>
              <button
                type="button"
                onClick={() => handleSelectAllCategories(act.id)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-semibold"
              >
                {allSelected ? 'Desseleccionar totes' : 'Seleccionar totes'}
              </button>
            </div>
            {act.categories.map(cat => (
              <label
                key={cat.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all text-xs hover:bg-slate-700/40"
              >
                <input
                  type="checkbox"
                  checked={cat.selected}
                  onChange={() => handleCategoryToggle(act.id, cat.id)}
                  className="sr-only"
                />
                <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-all shrink-0 ${
                  cat.selected
                    ? 'bg-indigo-500 border-indigo-500'
                    : 'border-slate-600 bg-transparent'
                }`}>
                  {cat.selected && (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 capitalize text-slate-300">{cat.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderDayGroup = (dayName: 'Dissabte' | 'Diumenge') => {
    const dayActivities = activities.filter((a) => a.dayName === dayName);

    return (
      <div className="day-group mb-6" key={dayName}>
        <h2 className="text-base font-bold text-white mb-2 flex items-center gap-2">
          <span className="w-7 h-7 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </span>
          {dayName}
        </h2>
        <div className="activities-list space-y-3 relative">
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
              <div className="grid grid-cols-[120px_1fr] gap-x-8 gap-y-2.5 items-start">
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
                  <select
                    value={act.activitat}
                    onChange={(e) => handleChange(act.id, 'activitat', e.target.value)}
                    className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-slate-700/50"
                  >
                    <option value="" disabled>Selecciona una activitat</option>
                    {(dailyActivitiesMap[act.data] || allGlobalActivities || []).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-[120px_1fr_70px] gap-x-8 gap-y-2.5 items-start mt-2">
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
                  <CategoryDropdown act={act} />
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
      <div className="max-w-lg mx-auto py-4">
        <form id="reportForm" className="space-y-5" onSubmit={handleSubmit}>
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
              <div className="flex flex-col items-center gap-3 py-4" onClick={() => { setShowModal(false); setSubmitStatus('idle'); }}>
                <div className="modal-success-icon">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-base font-semibold text-white">Informe envia't</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
