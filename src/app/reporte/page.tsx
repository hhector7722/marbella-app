'use client';

import { useState, useEffect, useRef } from 'react';
import { format, addDays, getDay, subDays } from 'date-fns';
import { submitReporteAction, ReportePayload } from './actions';
import './premium.css';

interface Activity {
  id: string;
  data: string;
  activitat: string;
  hora_convocatoria: string;
  hora_finalitzacio: string;
  participants: string;
  categoria: string;
  dayName: 'Dissabte' | 'Diumenge';
  isFreeText?: boolean;
}

function getNextWeekend() {
  const today = new Date();
  const day = getDay(today);
  let sat = new Date(today);
  if (day === 0) { // Sunday
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
  for (let h = 0; h < 24; h++) {
    timeOptions.push(`${String(h).padStart(2, '0')}:00`);
    timeOptions.push(`${String(h).padStart(2, '0')}:30`);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="form-input flex-1 rounded-xl px-1 py-1.5 outline-none text-[11px] text-white min-w-0"
    >
      <option value="" disabled>--:--</option>
      {timeOptions.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  );
}

export default function ReportePage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [loadingText, setLoadingText] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const captureAreaRef = useRef<HTMLDivElement>(null);
  const [allGlobalActivities, setAllGlobalActivities] = useState<string[]>([]);
  const [dailyActivitiesMap, setDailyActivitiesMap] = useState<Record<string, string[]>>({});

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
  }, []);

  const fetchDailyActivities = async (date: string) => {
    if (dailyActivitiesMap[date]) return; // already fetched
    const m = await import('./actions');
    const daily = await m.getDailyActivitiesAction(date);
    const top = await m.getTopActivityAction(date);
    
    setDailyActivitiesMap(prev => ({
      ...prev,
      [date]: daily.length > 0 ? daily : allGlobalActivities
    }));

    // Auto-fill top activity if empty for this date
    setActivities(prev => prev.map(a => {
      if (a.data === date && !a.activitat && !a.isFreeText && top) {
        return { ...a, activitat: top };
      }
      return a;
    }));
  };

  useEffect(() => {
    const { saturday, sunday } = getNextWeekend();
    setActivities([
      {
        id: crypto.randomUUID(),
        data: saturday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        participants: '',
        categoria: '',
        dayName: 'Dissabte',
      },
      {
        id: crypto.randomUUID(),
        data: sunday,
        activitat: '',
        hora_convocatoria: '',
        hora_finalitzacio: '',
        participants: '',
        categoria: '',
        dayName: 'Diumenge',
      },
    ]);
  }, []);

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

  // Pre-fetch initial dates
  useEffect(() => {
    const dates = new Set(activities.map(a => a.data));
    dates.forEach(d => {
      if (d) fetchDailyActivities(d);
    });
  }, [activities.map(a => a.data).join(',')]);

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
          participants: '',
          categoria: '',
          dayName,
        },
      ];
    });
  };

  const handleRemoveActivity = (id: string) => {
    setActivities((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captureAreaRef.current) return;

    try {
      setLoadingText('Generant imatge...');
      setIsCapturing(true);

      // Submit to DB in background
      const payload: ReportePayload[] = activities.map(a => ({
        data: a.data,
        activitat: a.activitat,
        hora_convocatoria: a.hora_convocatoria,
        hora_finalitzacio: a.hora_finalitzacio,
        participants: a.participants,
        categoria: a.categoria,
      }));
      
      // We don't await so the UI generates the image immediately
      submitReporteAction(payload).catch(console.error);

      // Generate Image
      const htmlToImage = await import('html-to-image');
      
      await new Promise((r) => setTimeout(r, 100)); // allow DOM updates

      // html-to-image might need to clone inputs, but usually it renders input values fine
      // we'll use toBlob which is convenient
      const blob = await htmlToImage.toBlob(captureAreaRef.current, {
        backgroundColor: '#0f172a',
        pixelRatio: 2,
        style: { transform: 'scale(1)', margin: '0' },
      });

      setIsCapturing(false);

      if (!blob) throw new Error('No blob generated');

      const file = new File([blob], 'report-marbella.png', { type: 'image/png' });

      const isDesktop = !/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

      if (!isDesktop && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Report Activitats Marbella',
            text: 'Aquí tens el resum de les activitats del cap de setmana.',
          });
        } catch (e) {
          console.log('Share cancelled or failed', e);
        }
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'report-marbella.png';
        link.click();
      }

      setIsSuccess(true);
      setTimeout(() => setIsSuccess(false), 3000);
    } catch (err) {
      console.error(err);
      alert("S'ha produït un error en generar la imatge.");
    } finally {
      setIsCapturing(false);
      setLoadingText(null);
    }
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
              <div className="grid grid-cols-[140px_1fr] gap-x-8 gap-y-2.5 items-start">
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
                  {act.isFreeText ? (
                    <div className="relative">
                      <input
                        type="text"
                        value={act.activitat}
                        onChange={(e) => handleChange(act.id, 'activitat', e.target.value)}
                        placeholder="Nombre de la actividad..."
                        className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs"
                      />
                      <button 
                        type="button" 
                        onClick={() => {
                          handleChange(act.id, 'isFreeText', false);
                          handleChange(act.id, 'activitat', '');
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-indigo-400 hover:text-indigo-300"
                        title="Volver a seleccionar"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <select
                      value={act.activitat}
                      onChange={(e) => {
                        if (e.target.value === '_TEXTO_LIBRE_') {
                          handleChange(act.id, 'isFreeText', true);
                          handleChange(act.id, 'activitat', '');
                        } else {
                          handleChange(act.id, 'activitat', e.target.value);
                        }
                      }}
                      className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs bg-slate-800 text-white border border-slate-700/50"
                    >
                      <option value="_TEXTO_LIBRE_" className="font-bold text-indigo-400">Texto libre</option>
                      {(dailyActivitiesMap[act.data] || allGlobalActivities || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Horari</label>
                  <div className="flex items-center gap-1 h-[36px]">
                    <TimePicker
                      value={act.hora_convocatoria}
                      onChange={(v) => handleChange(act.id, 'hora_convocatoria', v)}
                    />
                    <span className="text-slate-600 shrink-0">-</span>
                    <TimePicker
                      value={act.hora_finalitzacio}
                      onChange={(v) => handleChange(act.id, 'hora_finalitzacio', v)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                     <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Participants</label>
                    <input
                      type="number"
                      value={act.participants}
                      onChange={(e) => handleChange(act.id, 'participants', e.target.value)}
                      className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider ml-1">Categoria</label>
                    <input
                      type="text"
                      value={act.categoria}
                      onChange={(e) => handleChange(act.id, 'categoria', e.target.value)}
                      className="form-input w-full rounded-xl px-2 py-1.5 outline-none text-xs"
                    />
                  </div>
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
    <div className={`reporte-container pb-20 px-3 overflow-x-hidden ${isCapturing ? 'capturing' : ''}`}>
      <div className="max-w-lg mx-auto py-2">
        <form id="reportForm" className="space-y-5" onSubmit={handleSubmit}>
          <div id="captureArea" ref={captureAreaRef} className="space-y-5 p-2 rounded-2xl">
            <header className="mb-4 text-center flex justify-center">
              <img src="/icons/logo-white.png" alt="Bar La Marbella" className="h-12 w-auto object-contain" />
            </header>

            <div id="daysContainer" className="space-y-4">
              {renderDayGroup('Dissabte')}
              {renderDayGroup('Diumenge')}
            </div>
          </div>

          <div className="h-24"></div>

          <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-lg z-[1000]">
            <button
              type="submit"
              disabled={isCapturing || isSuccess}
              className={`w-full btn-premium py-2 rounded-xl flex items-center justify-center gap-2 text-base font-bold shadow-2xl uppercase tracking-widest disabled:opacity-70 ${isSuccess ? '!bg-emerald-600 !text-white' : ''}`}
            >
              {isSuccess ? (
                <>✅ Datos enviados correctamente</>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-400">
                    <path d="M3 21l1.65-3.8a9 9 0 1 1 3.4 2.9L3 21" />
                    <path d="M9 10a.5.5 0 0 0 1 0V9a.5.5 0 0 0-1 0v1a5 5 0 0 0 5 5h1a.5.5 0 0 0 0-1h-1a.5.5 0 0 0 0 1" />
                  </svg>
                  {loadingText || 'ENVIAR'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
