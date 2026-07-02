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
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { createClient } from '@/utils/supabase/client';
import { usePageView } from '@/lib/usage/usePageView';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

interface DayShift {
  startTime: string; // HH:MM
  endTime: string;   // HH:MM
  activity?: string;
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

export default function HorarioPage() {
  usePageView();

  const supabase = createClient();

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [shiftsByDate, setShiftsByDate] = useState<Record<string, DayShift>>({});

  // For modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<{ date: Date; startTime: string; endTime: string; activity?: string }[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');
  const [userEmail, setUserEmail] = useState<string>('');

  // Touch swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const minSwipeDistance = 50;
  const onTouchStart = (e: React.TouchEvent) => { setTouchEnd(null); setTouchStart(e.targetTouches[0].clientX); };
  const onTouchMove = (e: React.TouchEvent) => { setTouchEnd(e.targetTouches[0].clientX); };
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    if (distance > minSwipeDistance) setViewMonth((m) => addMonths(m, 1));
    if (distance < -minSwipeDistance) setViewMonth((m) => subMonths(m, 1));
  };

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

  const loadShifts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setUserEmail(user.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

      if (profile?.role) {
        const r = profile.role as string;
        if (r === 'manager' || r === 'supervisor') setUserRole(r);
        else setUserRole('staff');
      }

      const startIso = format(gridStart, 'yyyy-MM-dd') + 'T00:00:00';
      const endIso = format(gridEnd, 'yyyy-MM-dd') + 'T23:59:59';

      const { data: rawShifts } = await supabase
        .from('shifts')
        .select('start_time, end_time, activity, activity_2')
        .eq('user_id', user.id)
        .eq('is_published', true)
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .order('start_time', { ascending: true });

      const byDate: Record<string, DayShift> = {};
      const allArr: { date: Date; startTime: string; endTime: string; activity?: string }[] = [];

      for (const s of rawShifts ?? []) {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const key = format(start, 'yyyy-MM-dd');
        const startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        byDate[key] = { startTime, endTime, activity: s.activity || s.activity_2 || undefined };
        allArr.push({ date: start, startTime, endTime, activity: s.activity || s.activity_2 || undefined });
      }

      setShiftsByDate(byDate);
      setAllShifts(allArr);
    } finally {
      setLoading(false);
    }
  }, [gridStart, gridEnd, supabase]);

  useEffect(() => { void loadShifts(); }, [loadShifts]);

  const openDay = (day: Date) => {
    setSelectedDayStr(format(day, 'yyyy-MM-dd'));
    setModalOpen(true);
  };

  const getMonthLabel = (date: Date) =>
    date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  return (
    <div className="pb-24">
      <div className="w-full max-w-none px-1 py-3 sm:px-1.5 md:px-2 md:py-4">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-none">

          {/* ── Header ── */}
          <div className="flex items-center justify-between bg-[#36606F] px-4 py-2.5 min-h-[52px]">
            <div className="w-[100px] flex justify-start">
              <a
                href="/staff/actividades"
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Actividades
              </a>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <span className="text-xs font-black uppercase tracking-widest text-white select-none whitespace-nowrap">
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
            <div className="w-[100px]"></div>
          </div>

          {/* ── Calendar ── */}
          {loading ? (
            <div className="flex flex-col items-center justify-center gap-4 py-20">
              <LoadingSpinner size="lg" className="text-[#36606F]" />
            </div>
          ) : (
            <div
              className="flex flex-col gap-1 bg-zinc-50/50 px-[1.5%] pt-2 pb-1 shrink-0 touch-pan-y"
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
                <div className="grid grid-cols-7 divide-y divide-gray-100">
                  {calendarDays.map((day) => {
                    const key = format(day, 'yyyy-MM-dd');
                    const shift = shiftsByDate[key];
                    const isViewMonthDay = isSameMonth(day, viewMonth);
                    const isPastDay = isBefore(day, today);
                    const isToday = isSameDay(day, today);
                    const isSelected = selectedDayStr === key;

                    const cellCls = cn(
                      'relative flex flex-col border-r border-gray-100 p-0.5 sm:p-1 last:border-r-0 cursor-pointer',
                      'h-24 sm:h-28 md:h-32 lg:h-36',
                      isPastDay ? 'bg-zinc-100' : 'bg-white',
                      isToday && isViewMonthDay && 'bg-blue-50/20',
                      isSelected && 'ring-2 ring-inset ring-[#36606F]/40',
                      'hover:bg-blue-50/40 active:bg-blue-50/60 transition-colors',
                      !isViewMonthDay && 'opacity-40',
                    );

                    const dayNumCls = cn(
                      'text-[9px] md:text-[10px] font-bold leading-none',
                      isToday && isViewMonthDay
                        ? 'text-blue-600 bg-blue-50/80 px-1 py-0.5 rounded-md font-semibold'
                        : 'text-zinc-400',
                    );

                    return (
                      <div
                        key={key}
                        onClick={() => isViewMonthDay && openDay(day)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && isViewMonthDay && openDay(day)}
                        className={cellCls}
                      >
                        {/* Day number */}
                        <div className="flex justify-end items-center gap-0.5 shrink-0 w-full mb-0.5">
                          <span className={dayNumCls}>{format(day, 'd')}</span>
                        </div>

                        {/* Shift info */}
                        {shift && (
                          <div className="flex-1 w-full flex flex-col gap-0.5 overflow-hidden">
                            {/* Hora entrada */}
                            <div
                              className="w-full rounded-[3px] px-1 py-[2px] flex flex-col shrink-0"
                              style={{ backgroundColor: '#34d399', color: '#fff', opacity: isPastDay ? 0.75 : 1 }}
                            >
                              <span
                                className="block font-black leading-none"
                                style={{ fontSize: 'clamp(6px, 11cqi, 11px)' }}
                              >
                                ▲ {shift.startTime}
                              </span>
                              <span
                                className="block font-black leading-none mt-[2px]"
                                style={{ fontSize: 'clamp(6px, 11cqi, 11px)' }}
                              >
                                ▼ {shift.endTime}
                              </span>
                            </div>

                            {/* Actividad */}
                            {shift.activity && (
                              <div
                                className="w-full rounded-[3px] px-1 py-[2px] bg-[#36606F]/80 shrink-0"
                                style={{ opacity: isPastDay ? 0.75 : 1 }}
                              >
                                <span
                                  className="block break-keep font-bold leading-tight text-white"
                                  style={{ fontSize: 'clamp(5px, 12cqi, 11px)' }}
                                >
                                  {shift.activity}
                                </span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Swipe indicator */}
              <div className="flex justify-center items-center gap-1.5 py-2 w-full">
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-sm opacity-70"></div>
                <div className="w-2 h-2 rounded-full bg-white shadow-sm border border-zinc-200"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-zinc-300 shadow-sm opacity-70"></div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal de detalle del día */}
      <StaffScheduleModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setSelectedDayStr(null); }}
        shifts={allShifts}
        userId={userId}
        userRole={userRole}
        userEmail={userEmail}
        initialFocusDate={selectedDayStr}
      />
    </div>
  );
}
