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

function shortName(name: string): string {
  if (name.length <= 10) return name;
  return name.slice(0, 9) + '\u2026';
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

  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(viewMonth);
    const monthEnd = endOfMonth(viewMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [viewMonth]);

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

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadData();
      toast.success('Calendario actualizado');
    } finally {
      setRefreshing(false);
    }
  };

  const todayData = todayStr ? byDate[todayStr] : undefined;
  const todayBarCount = todayData?.barActivities.length ?? 0;

  return (
    <div className="min-h-screen pb-6">
      <div className="mx-auto max-w-3xl px-3 pt-4 md:pt-8">
        <div className="overflow-hidden rounded-[2rem] border border-white/40 bg-white shadow-xl">
          {/* ---- Header ---- */}
          <div className="flex shrink-0 items-center gap-3 bg-[#36606F] px-4 py-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10"
              aria-label="Volver"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0 flex flex-col items-center">
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
                <h1 className="truncate text-sm font-black uppercase tracking-widest text-white">
                  Activitats
                </h1>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 disabled:opacity-50"
              aria-label="Actualitzar"
            >
              {refreshing ? (
                <LoadingSpinner size="sm" className="text-white" />
              ) : (
                <RefreshCw size={18} strokeWidth={2.5} />
              )}
            </button>
          </div>

          {/* ---- Month nav ---- */}
          <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-100"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={22} />
            </button>
            <span className="flex-1 text-center text-xs font-black uppercase tracking-widest text-zinc-700 capitalize">
              {format(viewMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="flex min-h-[48px] min-w-[48px] shrink-0 items-center justify-center rounded-xl text-[#36606F] transition-colors hover:bg-zinc-100"
              aria-label="Mes següent"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          {/* ---- Calendar grid ---- */}
          <div className="flex flex-col p-4 md:p-8">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20">
                <LoadingSpinner size="lg" className="text-[#36606F]" />
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="overflow-x-auto p-0 no-scrollbar md:p-1">
                  <div className="min-w-0">
                    <div className="mb-1 grid grid-cols-7 px-0.5 md:mb-2 md:px-2">
                      {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'].map((d, i) => (
                        <div
                          key={d}
                          className="text-center text-[7px] font-black uppercase tracking-[0.1em] text-zinc-400 md:text-[10px]"
                        >
                          <span className="hidden md:inline">{d}</span>
                          <span className="md:hidden">
                            {['Dl', 'Dt', 'Dc', 'Dj', 'Dv', 'Ds', 'Dg'][i]}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 md:gap-2">
                      {calendarDays.map((day) => {
                        const key = format(day, 'yyyy-MM-dd');
                        const dayData = byDate[key];
                        const barActs = dayData?.barActivities ?? [];
                        const totalCount = dayData?.totalCount ?? 0;
                        const isViewMonthDay = isSameMonth(day, viewMonth);
                        const isPastDay = isViewMonthDay && key < todayStr;
                        const hasData = totalCount > 0;
                        const isMuted = !isViewMonthDay || isPastDay;
                        const clickable = isViewMonthDay;

                        const visible = barActs.slice(0, MAX_VISIBLE);
                        const overflow = barActs.length - MAX_VISIBLE;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => clickable && openDay(day)}
                            disabled={!clickable}
                            className={cn(
                              'group relative flex flex-col overflow-hidden rounded-lg border text-left transition-all md:rounded-2xl',
                              'min-h-[52px] md:min-h-[100px]',
                              isMuted
                                ? 'border-transparent bg-transparent opacity-25'
                                : '',
                              !isMuted &&
                                'border-zinc-100 bg-white shadow-sm hover:shadow-md',
                              clickable && !isMuted && 'cursor-pointer active:scale-[0.99]',
                            )}
                          >
                            {/* Day header bar */}
                            <div
                              className={cn(
                                'flex shrink-0 items-center justify-between px-1 py-0.5 md:px-2 md:py-1',
                                isMuted
                                  ? 'bg-zinc-400'
                                  : hasData
                                    ? 'bg-[#D64D5D]'
                                    : 'bg-zinc-200',
                              )}
                            >
                              <span className="text-[8px] font-black text-white md:text-[10px]">
                                {format(day, 'd')}
                              </span>
                              {hasData && (
                                <span className="text-[6px] font-black text-white/80 md:text-[8px]">
                                  {totalCount}
                                </span>
                              )}
                            </div>

                            {/* Activity previews */}
                            <div className="flex flex-1 flex-col gap-px px-0.5 py-0.5 md:gap-0.5 md:px-1.5 md:py-1">
                              {visible.length > 0 ? (
                                visible.map((act, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center gap-0.5 leading-none md:gap-1"
                                  >
                                    <span className="text-[7px] md:text-[9px]">
                                      {act.activityIcon || '\u26AA'}
                                    </span>
                                    <span className="text-[7px] font-black text-zinc-700 md:text-[9px]">
                                      {act.startTime.slice(0, 5)}
                                    </span>
                                    <span className="min-w-0 flex-1 truncate text-[7px] font-bold text-zinc-500 md:text-[9px]">
                                      {shortName(act.activityName)}
                                    </span>
                                  </div>
                                ))
                              ) : hasData ? (
                                <div className="flex flex-1 items-center justify-center">
                                  <span className="text-[7px] font-bold text-zinc-300 md:text-[9px]">
                                    Sense activitats
                                  </span>
                                </div>
                              ) : null}

                              {overflow > 0 && (
                                <div className="mt-auto text-right">
                                  <span className="text-[6px] font-black text-zinc-300 md:text-[8px]">
                                    +{overflow} m\u00E9s
                                  </span>
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ---- Today summary ---- */}
        {todayBarCount > 0 && (
          <div className="mt-3 rounded-2xl border border-zinc-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-[11px] font-black uppercase tracking-wider text-zinc-400">
              Avui
            </p>
            <p className="mt-0.5 text-sm font-black text-zinc-900">
              {todayBarCount} activitats a P1-P4
            </p>
          </div>
        )}
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
