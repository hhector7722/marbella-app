'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isBefore,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { ChevronLeft, ChevronRight, Settings } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PavilionDayModal } from '@/components/pavilion/PavilionDayModal';
import {
  fetchActivitiesForRangeAction,
  type DayCalendarData,
} from '@/app/staff/actividades/actions';
import { usePageView } from '@/lib/usage/usePageView';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { createClient } from '@/utils/supabase/client';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const MAX_VISIBLE = 4;

function fmtHour(time: string): string {
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parseInt(parts[0], 10)}:${parts[1]}`;
}

function groupActivities(
  acts: { activityName: string; activityIcon: string | null; activityColor: string | null; startTime: string; endTime: string; venueCodes: string[] }[],
) {
  if (acts.length === 0) return acts;
  const map = new Map<string, typeof acts[0]>();
  for (const a of acts) {
    const name = a.activityName.trim();
    if (!map.has(name)) {
      map.set(name, { ...a, venueCodes: [...a.venueCodes] });
    } else {
      const existing = map.get(name)!;
      if (a.startTime < existing.startTime) existing.startTime = a.startTime;
      if (a.endTime > existing.endTime) existing.endTime = a.endTime;
      for (const v of a.venueCodes) {
         if (!existing.venueCodes.includes(v)) existing.venueCodes.push(v);
      }
    }
  }
  return Array.from(map.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function stringToHslColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 70%, 55%)`;
}

function getContrastForHsl(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  
  const l = 0.55;
  const s = 0.70;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  
  const r255 = Math.round((r + m) * 255);
  const g255 = Math.round((g + m) * 255);
  const b255 = Math.round((b + m) * 255);
  
  const yiq = ((r255 * 299) + (g255 * 587) + (b255 * 114)) / 1000;
  return (yiq >= 135) ? '#000000' : '#ffffff';
}

function madridTodayIso(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function ActividadesPage() {
  usePageView();
  const supabase = createClient();

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [byDate, setByDate] = useState<Record<string, DayCalendarData>>({});
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkMaster() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', user.id)
          .maybeSingle();

        const email = profile?.email ?? user.email ?? '';
        if (!cancelled) setIsMaster(isMasterDashboardUser(email));
      } catch (err) {
        console.error('Failed to check master status:', err);
      }
    }
    checkMaster();
    return () => { cancelled = true; };
  }, [supabase]);


  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe) {
      setViewMonth((m) => addMonths(m, 1));
    }
    if (isRightSwipe) {
      setViewMonth((m) => subMonths(m, 1));
    }
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  const todayStr = useMemo(() => madridTodayIso(), []);
  const today = useMemo(() => startOfDay(new Date()), []);

  const monthStart = useMemo(() => startOfMonth(viewMonth), [viewMonth]);
  const monthEnd = useMemo(() => endOfMonth(viewMonth), [viewMonth]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  const rangeStart = format(calendarDays[0]!, 'yyyy-MM-dd');
  const rangeEnd = format(calendarDays[calendarDays.length - 1]!, 'yyyy-MM-dd');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchActivitiesForRangeAction({
        startDate: rangeStart,
        endDate: rangeEnd,
      });
      if (!res.success) {
        toast.error(res.error);
        setByDate({});
        return;
      }
      setByDate(res.byDate);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openDay = (day: Date) => {
    const key = format(day, 'yyyy-MM-dd');
    setSelectedDayStr(key);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedDayStr(null);
  };

  const navigateDay = (delta: -1 | 1) => {
    if (!selectedDayStr) return;
    const d = parseLocalSafe(selectedDayStr);
    d.setDate(d.getDate() + delta);
    const key = format(d, 'yyyy-MM-dd');
    setSelectedDayStr(key);
    if (!isSameMonth(d, viewMonth)) {
      setViewMonth(startOfMonth(d));
    }
  };

  const getMonthLabel = (date: Date) =>
    date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="pb-10">
      <div className="w-full max-w-none px-1 py-3 sm:px-1.5 md:px-2 md:py-4 lg:mx-auto lg:max-w-[1400px] lg:px-6 lg:py-6">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-none lg:shadow-xl">
          {/* ── Header: centered month nav only ── */}
          <div className="flex items-center justify-between bg-[#36606F] px-4 py-2.5 min-h-[52px] lg:px-5 lg:py-3 lg:min-h-[60px]">
            <div className="w-[100px] lg:w-[140px]" />
            <div className="flex items-center gap-0.5 lg:gap-2">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full lg:min-h-12 lg:min-w-12"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} strokeWidth={2.5} className="lg:size-6" />
              </button>
              <span className="text-xs font-black uppercase tracking-widest text-white select-none whitespace-nowrap lg:text-base lg:tracking-[0.2em]">
                {getMonthLabel(viewMonth)}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full lg:min-h-12 lg:min-w-12"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} strokeWidth={2.5} className="lg:size-6" />
              </button>
            </div>
            <div className="w-[100px] flex justify-end items-center gap-2 lg:w-[140px] lg:gap-3">
              {isMaster && (
                <button
                  type="button"
                  onClick={() => window.location.href = '/staff/actividades/gestion'}
                  className="text-white hover:text-white/70 transition-colors lg:min-h-12 lg:min-w-12 lg:flex lg:items-center lg:justify-center"
                  aria-label="Gestionar actividades"
                >
                  <Settings size={18} strokeWidth={1.5} className="lg:size-5" />
                </button>
              )}
              <a
                href="/horario"
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-semibold transition-colors whitespace-nowrap lg:min-h-12 lg:flex lg:items-center lg:rounded-lg lg:px-3 lg:text-sm"
              >
                Horarios
              </a>
            </div>
          </div>

          {/* ── Calendar ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <LoadingSpinner size="lg" className="text-[#36606F]" />
            </div>
          ) : (
            <div 
              className="flex flex-col gap-1 bg-zinc-50/50 px-[1.5%] pt-2 pb-1 shrink-0 touch-pan-y lg:gap-2 lg:px-4 lg:pt-4 lg:pb-3"
              onTouchStart={onTouchStart}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <div className="mx-auto w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {CALENDAR_WEEKDAYS.map((d, index) => (
                    <div
                      key={d}
                      className="flex h-5 items-center justify-center border-r border-white/30 bg-gradient-to-b from-red-500 to-red-600 shadow-sm last:border-r-0 lg:h-9"
                    >
                      <span className="block truncate px-0.5 text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-sm leading-none lg:text-xs lg:tracking-widest">
                        <span className="hidden md:inline">{d}</span>
                        <span className="md:hidden">{MOBILE_HEADERS[index]}</span>
                      </span>
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div className="grid grid-cols-7">
                  {calendarDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const dayData = byDate[key];
                    const barActs = dayData?.barActivities ?? [];
                    const isViewMonthDay = isSameMonth(day, viewMonth);
                    const isPastDay = isBefore(day, today);
                    const isToday = isSameDay(day, today);
                    const pastDayBg = isPastDay ? 'bg-zinc-100' : 'bg-white';

                    const grouped = groupActivities(barActs);

                    const cellCls = cn(
                      'relative flex flex-col border-r border-gray-100 p-0.5 sm:p-1 last:border-r-0',
                      'h-24 sm:h-28 md:h-32 lg:h-48 xl:h-56 lg:p-1.5',
                      pastDayBg,
                      isToday && isViewMonthDay && !isPastDay && 'bg-blue-50/10',
                    );

                    const dayNumCls = cn(
                      'text-[9px] md:text-[10px] font-bold leading-none lg:text-sm',
                      isToday && isViewMonthDay
                        ? 'text-blue-600 bg-blue-50/80 px-1 py-0.5 rounded-md font-semibold lg:px-1.5 lg:py-1'
                        : 'text-zinc-400',
                    );

                    if (!dayData) {
                      return (
                        <div
                          key={key}
                          onClick={() => openDay(day)}
                          role="button"
                          tabIndex={0}
                          className={cn(cellCls, 'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer text-left')}
                        >
                          <div className="flex justify-end items-center gap-0.5 shrink-0 w-full mb-1">
                            <span className={dayNumCls}>{format(day, 'd')}</span>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={key}
                        onClick={() => openDay(day)}
                        role="button"
                        tabIndex={0}
                        className={cn(cellCls, 'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer text-left overflow-hidden')}
                      >
                        {/* Day number — top right */}
                        <div className="flex justify-end items-center gap-0.5 shrink-0 w-full mb-0.5 lg:mb-1">
                          <span className={dayNumCls}>{format(day, 'd')}</span>
                        </div>

                        {/* Activities */}
                        <div className="flex-1 w-full overflow-y-auto flex flex-col gap-0.5 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] lg:gap-1">
                          {grouped.map((act, i) => {
                            const bgColor = act.activityColor || stringToHslColor(act.activityName);
                            const textColor = '#ffffff';
                            return (
                              <div 
                                key={i} 
                                className="w-full rounded-[3px] overflow-hidden flex flex-col shrink-0 lg:rounded-md"
                                style={{
                                  backgroundColor: bgColor,
                                  color: textColor,
                                  containerType: 'inline-size',
                                  ...(isPastDay ? { opacity: 0.8 } : {}),
                                }}
                              >
                                  <div className="px-1 py-[2px] flex flex-col justify-center min-h-[16px] lg:px-1.5 lg:py-1 lg:min-h-[20px]">
                                    <span className="whitespace-nowrap font-black leading-none opacity-90 tracking-tight text-[clamp(5px,11cqi,11px)] lg:text-[11px]">
                                      {fmtHour(act.startTime)} - {fmtHour(act.endTime)}
                                    </span>
                                  </div>
                                  <div className="px-1 py-[2px] bg-black/10 flex flex-col justify-center lg:px-1.5 lg:py-1">
                                    <span className="break-keep font-bold leading-tight text-[clamp(6px,14cqi,14px)] lg:text-xs">
                                    {act.activityName}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* Pagination Dots (Swipe Indicator) — solo móvil/tablet */}
              <div className="flex justify-center items-center gap-1.5 py-2 w-full lg:hidden">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-sm opacity-70"></div>
                <div className="w-2 h-2 rounded-full bg-white shadow-sm border border-zinc-200"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-sm opacity-70"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      <PavilionDayModal
        open={modalOpen}
        onClose={closeModal}
        date={selectedDayStr}
        onNavigateDay={navigateDay}
      />
    </div>
  );
}
