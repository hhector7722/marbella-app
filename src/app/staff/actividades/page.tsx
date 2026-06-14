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
import { createClient } from '@/utils/supabase/client';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { PavilionActivityPdfModal } from '@/components/pavilion/PavilionActivityPdfModal';
import {
  fetchPavilionActivitiesForRangeAction,
  type PavilionActivityRow,
} from '@/app/staff/actividades/actions';
import { usePageView } from '@/lib/usage/usePageView';

function parseLocalSafe(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export default function ActividadesPage() {
  usePageView();

  const router = useRouter();
  const supabase = createClient();

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [canUpload, setCanUpload] = useState(false);
  const [byDate, setByDate] = useState<Record<string, PavilionActivityRow>>({});

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

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
      const res = await fetchPavilionActivitiesForRangeAction({
        startDate: rangeStart,
        endDate: rangeEnd,
      });
      if (!res.success) {
        toast.error(res.error);
        setByDate({});
        return;
      }
      const map: Record<string, PavilionActivityRow> = {};
      for (const row of res.rows) {
        map[row.activityDate] = row;
      }
      setByDate(map);
    } finally {
      setLoading(false);
    }
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email ?? '';
      if (isMasterDashboardUser(email)) {
        setCanUpload(true);
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', session?.user?.id ?? '')
        .maybeSingle();
      setCanUpload(isMasterDashboardUser(profile?.email ?? email));
    })();
  }, [supabase]);

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

  const daysWithPdf = Object.keys(byDate).length;

  const selectedRow = selectedDayStr ? byDate[selectedDayStr] ?? null : null;

  return (
    <div className="min-h-screen bg-[#5B8FB9] pb-6">
      <div className="max-w-3xl mx-auto px-3 pt-4 md:pt-8">
        <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden border border-white/40">
          <div className="bg-[#36606F] px-4 py-4 flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => router.back()}
              className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-white/10 text-white transition-colors shrink-0"
              aria-label="Volver"
            >
              <ChevronLeft size={22} strokeWidth={2.5} />
            </button>
            <div className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center gap-2">
                <div className="relative w-7 h-7 shrink-0">
                  <Image
                    src="/icons/calendar.png"
                    alt=""
                    fill
                    className="object-contain"
                    sizes="28px"
                  />
                </div>
                <h1 className="text-sm font-black uppercase tracking-widest text-white truncate">
                  Actividades
                </h1>
              </div>
              <p className="text-[9px] font-bold text-white/70 uppercase tracking-wider mt-0.5">
                Pabellón CEM Marbella
              </p>
            </div>
            {canUpload ? (
              <button
                type="button"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-white/10 text-white transition-colors shrink-0 disabled:opacity-50"
                aria-label="Actualizar calendario"
                title="Actualizar calendario"
              >
                {refreshing ? (
                  <LoadingSpinner size="sm" className="text-white" />
                ) : (
                  <RefreshCw size={18} strokeWidth={2.5} />
                )}
              </button>
            ) : (
              <div className="w-12 shrink-0" />
            )}
          </div>

          <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setViewMonth((m) => subMonths(m, 1))}
              className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-zinc-100 text-[#36606F] transition-colors"
              aria-label="Mes anterior"
            >
              <ChevronLeft size={22} />
            </button>
            <span className="text-xs font-black uppercase tracking-widest text-zinc-700 capitalize text-center flex-1">
              {format(viewMonth, 'MMMM yyyy', { locale: es })}
            </span>
            <button
              type="button"
              onClick={() => setViewMonth((m) => addMonths(m, 1))}
              className="shrink-0 min-h-[48px] min-w-[48px] flex items-center justify-center rounded-xl hover:bg-zinc-100 text-[#36606F] transition-colors"
              aria-label="Mes siguiente"
            >
              <ChevronRight size={22} />
            </button>
          </div>

          <div className="p-4 md:p-8 flex flex-col">
            <div className="grid grid-cols-2 gap-0.5 sm:gap-1 mb-4 py-2 shrink-0 min-w-0">
              <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                  Hojas
                </span>
                <span className="text-[11px] font-black leading-tight text-emerald-700 tabular-nums sm:text-xs md:text-sm">
                  {loading ? ' ' : String(daysWithPdf)}
                </span>
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                  Mes
                </span>
                <span className="text-[11px] font-black leading-tight text-zinc-700 tabular-nums sm:text-xs md:text-sm capitalize">
                  {format(viewMonth, 'MMM', { locale: es })}
                </span>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <LoadingSpinner size="lg" className="text-[#36606F]" />
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="p-0 md:p-1 overflow-x-auto no-scrollbar">
                  <div className="min-w-0">
                    <div className="grid grid-cols-7 mb-1 md:mb-2 px-0.5 md:px-2">
                      {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map((d, index) => (
                        <div
                          key={d}
                          className="text-[7px] md:text-[10px] font-black text-zinc-400 uppercase tracking-[0.1em] text-center"
                        >
                          <span className="hidden md:inline">{d}</span>
                          <span className="md:hidden">
                            {['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 md:gap-2">
                      {calendarDays.map((day) => {
                        const key = format(day, 'yyyy-MM-dd');
                        const hasPdf = Boolean(byDate[key]);
                        const isViewMonthDay = isSameMonth(day, viewMonth);
                        const clickable = isViewMonthDay;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => clickable && openDay(day)}
                            disabled={!clickable}
                            className={cn(
                              'group relative rounded-lg md:rounded-2xl border flex flex-col overflow-hidden text-left min-h-[52px] md:min-h-[100px] transition-all',
                              !isViewMonthDay &&
                                'bg-transparent border-transparent opacity-25 pointer-events-none',
                              isViewMonthDay &&
                                'bg-white border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.99] cursor-pointer',
                            )}
                          >
                            <div
                              className={cn(
                                'px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shrink-0',
                                hasPdf && isViewMonthDay
                                  ? 'bg-emerald-600'
                                  : 'bg-[#D64D5D]',
                              )}
                            >
                              <span className="text-[8px] md:text-[10px] font-black text-white">
                                {format(day, 'd')}
                              </span>
                            </div>
                            <div className="p-1 md:p-2 flex flex-col flex-1 justify-center items-center">
                              {hasPdf && isViewMonthDay ? (
                                <>
                                  <span className="text-[8px] md:text-[10px] font-black uppercase text-emerald-700 tracking-wider">
                                    PDF
                                  </span>
                                  <span className="text-[5px] md:text-[7px] font-bold text-zinc-400 uppercase mt-0.5 hidden md:block">
                                    Ver
                                  </span>
                                </>
                              ) : (
                                <span className="text-[9px] md:text-xs font-black text-zinc-300">
                                  {' '}
                                </span>
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
      </div>

      <PavilionActivityPdfModal
        open={modalOpen}
        onClose={closeModal}
        activityDate={selectedDayStr}
        filePath={selectedRow?.filePath ?? null}
        canUpload={canUpload}
        onUploaded={() => void loadData()}
        onNavigateDay={navigateDay}
      />
    </div>
  );
}
