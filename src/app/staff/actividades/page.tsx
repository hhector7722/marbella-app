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
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PavilionDayModal } from '@/components/pavilion/PavilionDayModal';
import {
  fetchActivitiesForRangeAction,
  type DayCalendarData,
} from '@/app/staff/actividades/actions';
import { usePageView } from '@/lib/usage/usePageView';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const MAX_VISIBLE = 4;

function fmtHour(time: string): string {
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parseInt(parts[0], 10)}:${parts[1]}`;
}

function mergeConsecutive(
  acts: { activityName: string; activityIcon: string | null; startTime: string; endTime: string; venueCodes: string[] }[],
) {
  if (acts.length === 0) return acts;
  const merged: typeof acts = [];
  let cur = { ...acts[0], venueCodes: [...acts[0].venueCodes] };
  for (let i = 1; i < acts.length; i++) {
    const a = acts[i];
    if (a.activityName === cur.activityName) {
      cur.endTime = a.endTime;
      for (const v of a.venueCodes) if (!cur.venueCodes.includes(v)) cur.venueCodes.push(v);
    } else {
      merged.push(cur);
      cur = { ...a, venueCodes: [...a.venueCodes] };
    }
  }
  merged.push(cur);
  return merged;
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

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [byDate, setByDate] = useState<Record<string, DayCalendarData>>({});

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
    if (!isSameMonth(day, viewMonth)) return;
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
      <div className="w-full max-w-none px-1 py-3 sm:px-1.5 md:px-2 md:py-4">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-none">
          {/* ── Header: centered month nav only ── */}
          <div className="flex items-center justify-center bg-[#36606F] px-4 py-2.5 min-h-[52px]">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <span className="text-xs font-black uppercase tracking-widest text-white select-none">
                {getMonthLabel(viewMonth)}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          {/* ── Calendar ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <LoadingSpinner size="lg" className="text-[#36606F]" />
            </div>
          ) : (
            <div className="flex flex-col gap-1 bg-zinc-50/50 px-[1.5%] py-2 shrink-0">
              <div className="mx-auto w-full min-w-0 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                {/* Day headers */}
                <div className="grid grid-cols-7 border-b border-gray-100">
                  {CALENDAR_WEEKDAYS.map((d, index) => (
                    <div
                      key={d}
                      className="flex h-5 items-center justify-center border-r border-white/30 bg-gradient-to-b from-red-500 to-red-600 shadow-sm last:border-r-0"
                    >
                      <span className="block truncate px-0.5 text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-sm leading-none">
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
                    const totalCount = dayData?.totalCount ?? 0;
                    const isViewMonthDay = isSameMonth(day, viewMonth);
                    const isPastDay = isViewMonthDay && isBefore(day, today);
                    const isToday = isSameDay(day, today);
                    const pastDayBg = isPastDay ? 'bg-zinc-50/90' : 'bg-white';

                    const merged = mergeConsecutive(barActs);
                    const visible = merged.slice(0, MAX_VISIBLE);
                    const overflow = barActs.length - MAX_VISIBLE;

                    const cellCls = cn(
                      'relative flex flex-col border-r border-gray-100 p-0.5 last:border-r-0 sm:p-1',
                      'h-24 sm:h-28 md:h-32 lg:h-36',
                      pastDayBg,
                      !isViewMonthDay && 'opacity-25',
                      isToday && isViewMonthDay && !isPastDay && 'bg-blue-50/10',
                    );

                    const dayNumCls = cn(
                      'text-[9px] md:text-[10px] font-bold leading-none',
                      isToday && isViewMonthDay
                        ? 'text-blue-600 bg-blue-50/80 px-1 py-0.5 rounded-md font-semibold'
                        : 'text-zinc-400',
                    );

                    if (!dayData) {
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => isViewMonthDay && openDay(day)}
                          disabled={!isViewMonthDay}
                          className={cn(cellCls, 'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer text-left')}
                        >
                          <div className="flex justify-end items-center gap-0.5 shrink-0 w-full">
                            <span className={dayNumCls}>{format(day, 'd')}</span>
                          </div>
                        </button>
                      );
                    }

                    const gridRows = visible.length > 0 ? [
                      '1fr',
                      ...visible.flatMap((_, i) => [
                        'auto',
                        'auto',
                        i < visible.length - 1 ? '1fr' : undefined
                      ]).filter(Boolean),
                      'auto',
                      '1fr'
                    ].join(' ') : '1fr';

                    const items: React.ReactNode[] = [];
                    if (visible.length > 0) {
                      items.push(<div key="s0" />);
                      visible.forEach((act, i) => {
                        items.push(
                          <span key={`h${i}`} className="text-[9px] font-semibold text-zinc-800 text-left leading-none shrink-0">
                            {fmtHour(act.startTime)}
                          </span>
                        );
                        items.push(
                          <div key={`n${i}`} className="pl-2 overflow-hidden flex items-center shrink-0">
                            <span className="text-[8px] sm:text-[9px] md:text-[10px] whitespace-nowrap overflow-hidden text-zinc-600 leading-tight tracking-tight">
                              {act.activityName}
                            </span>
                          </div>
                        );
                        if (i < visible.length - 1) {
                          items.push(<div key={`s${i+1}`} />);
                        }
                      });
                      const lastAct = visible[visible.length - 1];
                      items.push(
                        <span key="hfin" className="text-[9px] font-semibold text-zinc-800 text-left leading-none shrink-0">
                          {fmtHour(lastAct.endTime)}
                        </span>
                      );
                      items.push(<div key="sfin" />);
                    }

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => isViewMonthDay && openDay(day)}
                        disabled={!isViewMonthDay}
                        className={cn(cellCls, 'hover:bg-blue-50/50 active:bg-blue-50/70 cursor-pointer text-left')}
                      >
                        {/* Day number + total — top right */}
                        <div className="flex justify-end items-center gap-0.5 shrink-0 w-full">
                          <span className={dayNumCls}>{format(day, 'd')}</span>
                          {totalCount > 0 && (
                            <span className="text-[6px] font-bold text-zinc-300 leading-none">
                              {totalCount}
                            </span>
                          )}
                        </div>

                        {/* Activities */}
                        <div 
                          className="flex-1 w-full overflow-hidden mt-1" 
                          style={{ display: 'grid', gridTemplateRows: gridRows }}
                        >
                          {items}
                          {overflow > 0 && (
                            <span className="mt-auto self-end text-[10px] font-bold text-zinc-400 leading-none shrink-0" style={{ gridRow: '-1 / span 1' }}>
                              +{overflow} más
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
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
