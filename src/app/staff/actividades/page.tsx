'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { PavilionDayModal } from '@/components/pavilion/PavilionDayModal';
import {
  fetchActivitiesForRangeAction,
  type DayCalendarData,
} from '@/app/staff/actividades/actions';
import { usePageView } from '@/lib/usage/usePageView';

const DAY_HEADERS = ['DL', 'DT', 'DC', 'DJ', 'DV', 'DS', 'DG'];
const MAX_VISIBLE = 3;

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

function WeekSeparator() {
  return (
    <div className="flex justify-center" aria-hidden>
      <div
        className={cn(
          'h-0.5 w-[70%] max-w-[280px]',
          'bg-[linear-gradient(90deg,transparent_0%,rgb(220_38_38/0.3)_4%,rgb(220_38_38)_8%,rgb(220_38_38)_92%,rgb(220_38_38/0.3)_96%,transparent_100%)]',
        )}
      />
    </div>
  );
}

export default function ActividadesPage() {
  usePageView();

  const router = useRouter();

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [byDate, setByDate] = useState<Record<string, DayCalendarData>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  const todayStr = useMemo(() => madridTodayIso(), []);
  const today = useMemo(() => new Date(), []);

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

  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < calendarDays.length; i += 7) {
      result.push(calendarDays.slice(i, i + 7));
    }
    return result;
  }, [calendarDays]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
      toast.success('Calendari actualitzat');
    } finally {
      setRefreshing(false);
    }
  };

  const getMonthLabel = (date: Date) =>
    date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="pb-10">
      <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
        <div className="overflow-hidden rounded-2xl bg-white shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* ── Header ── */}
          <div className="flex items-center justify-between bg-[#36606F] px-4 py-2.5 min-h-[52px]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
                aria-label="Tornar"
              >
                <ChevronLeft size={22} strokeWidth={2.5} />
              </button>
              <div className="flex items-center gap-2">
                <div className="relative h-7 w-7 shrink-0">
                  <Image
                    src="/icons/calendar.png"
                    alt=""
                    fill
                    className="object-contain"
                    sizes="28px"
                  />
                </div>
                <h1 className="text-sm font-black uppercase tracking-widest text-white">
                  Activitats
                </h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 disabled:opacity-50"
                aria-label="Actualitzar"
              >
                {refreshing ? (
                  <LoadingSpinner size="sm" className="text-white" />
                ) : (
                  <RefreshCw size={18} strokeWidth={2.5} />
                )}
              </button>
            </div>
          </div>

          {/* ── Month nav ── */}
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-100"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={20} />
            </button>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-700">
              {getMonthLabel(viewMonth)}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="flex min-h-[48px] min-w-[48px] items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-100"
              aria-label="Mes seg\u00FCent"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {/* ── Calendar ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <LoadingSpinner size="lg" className="text-[#36606F]" />
            </div>
          ) : (
            <div className="bg-zinc-50/50 p-4">
              {weeks.map((weekDays, weekIdx) => {
                const anyInMonth = weekDays.some((d) => isSameMonth(d, viewMonth));
                if (!anyInMonth && weeks.length > 1) return null;

                return (
                  <div key={weekIdx} className="space-y-0">
                    <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
                      {/* Day headers — only first week */}
                      {weekIdx === 0 && (
                        <div className="overflow-hidden rounded-t-xl">
                          <div className="grid grid-cols-7 border-b border-gray-100">
                            {DAY_HEADERS.map((d) => (
                              <div
                                key={d}
                                className="flex h-5 items-center justify-center border-r border-white/30 bg-gradient-to-b from-red-500 to-red-600 shadow-sm last:border-r-0"
                              >
                                <span className="block truncate px-0.5 text-[9px] font-bold uppercase tracking-wider text-white drop-shadow-sm">
                                  {d}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Days grid */}
                      <div className="grid grid-cols-7 border-b border-gray-100">
                        {weekDays.map((day, di) => {
                          const key = format(day, 'yyyy-MM-dd');
                          const dayData = byDate[key];
                          const barActs = dayData?.barActivities ?? [];
                          const totalCount = dayData?.totalCount ?? 0;
                          const isViewMonthDay = isSameMonth(day, viewMonth);
                          const isPastDay = isViewMonthDay && key < todayStr;
                          const isToday = isSameDay(day, today);
                          const isMuted = !isViewMonthDay || isPastDay;

                          const visible = barActs.slice(0, MAX_VISIBLE);
                          const overflow = barActs.length - MAX_VISIBLE;

                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => isViewMonthDay && openDay(day)}
                              disabled={!isViewMonthDay}
                              className={cn(
                                'relative flex min-h-[76px] flex-col border-r border-gray-100 p-1 pb-1 text-left transition-colors last:border-r-0 md:min-h-[90px] md:p-1.5',
                                'cursor-pointer bg-white hover:bg-zinc-50',
                                isMuted && 'opacity-35',
                                isToday && 'bg-blue-50/20',
                              )}
                            >
                              {/* Level 1 + 2: Day number + total */}
                              <div className="flex items-start justify-between px-0.5">
                                <span
                                  className={cn(
                                    'text-[11px] font-black leading-none md:text-xs',
                                    isToday ? 'text-blue-600' : 'text-zinc-500',
                                  )}
                                >
                                  {format(day, 'd')}
                                </span>
                                {totalCount > 0 && (
                                  <span className="text-[7px] font-bold leading-none text-zinc-300 md:text-[8px]">
                                    {totalCount}
                                  </span>
                                )}
                              </div>

                              {/* Level 3: Activities */}
                              <div className="mt-1 flex flex-1 flex-col gap-0.5 md:mt-1.5 md:gap-1">
                                {visible.map((act, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-0.5 leading-tight md:gap-1"
                                  >
                                    <span className="shrink-0 text-[8px] md:text-[10px]">
                                      {act.activityIcon || '\u25CB'}
                                    </span>
                                    <span className="shrink-0 text-[8px] font-bold text-zinc-700 md:text-[9px]">
                                      {act.startTime.slice(0, 5)}
                                    </span>
                                    <span className="min-w-0 truncate text-[7px] font-semibold text-zinc-500 md:text-[8px]">
                                      {act.activityName}
                                    </span>
                                  </div>
                                ))}
                              </div>

                              {/* Overflow */}
                              {overflow > 0 && (
                                <div className="mt-auto flex justify-end pr-0.5">
                                  <span className="text-[7px] font-bold text-zinc-300 md:text-[8px]">
                                    +{overflow} m\u00E9s
                                  </span>
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Week separator */}
                    {weekIdx < weeks.length - 1 && (
                      <div className="py-1.5 md:py-2">
                        <WeekSeparator />
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Empty state */}
              {weeks.length > 0 &&
                weeks.every((w) => w.every((d) => !isSameMonth(d, viewMonth))) && (
                  <div className="py-20 text-center text-zinc-400">
                    <p className="text-sm font-bold">No hi ha activitats aquest mes</p>
                  </div>
                )}
            </div>
          )}
        </div>

        {/* ── Today summary ── */}
        {(() => {
          const todayData = byDate[todayStr];
          const todayBarCount = todayData?.barActivities.length ?? 0;
          if (todayBarCount === 0) return null;
          return (
            <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-[0_2px_10px_rgba(0,0,0,0.08)]">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Avui
              </p>
              <p className="mt-0.5 text-sm font-black text-zinc-900">
                {todayBarCount} activitats a pistes
              </p>
            </div>
          );
        })()}
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
