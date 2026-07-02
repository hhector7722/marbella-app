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
import { ChevronLeft, ChevronRight, ArrowRight, ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { createClient } from '@/utils/supabase/client';
import { usePageView } from '@/lib/usage/usePageView';

const MASTER_EMAIL = 'hhector7722@gmail.com';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

interface DayShift {
  startTime: string;
  endTime: string;
  activity?: string;
  activityColor?: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
}

function stringToHslColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  return `hsl(${h}, 65%, 48%)`;
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

  // Auth & profile
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState<string>('');
  const [userRole, setUserRole] = useState<'staff' | 'manager' | 'supervisor'>('staff');

  // Employee filter (master only)
  const [isMaster, setIsMaster] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [allShifts, setAllShifts] = useState<{ date: Date; startTime: string; endTime: string; activity?: string }[]>([]);

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

  const today = useMemo(() => startOfDay(new Date()), []);
  const monthStart = useMemo(() => startOfMonth(viewMonth), [viewMonth]);
  const monthEnd = useMemo(() => endOfMonth(viewMonth), [viewMonth]);
  const gridStart = useMemo(() => startOfWeek(monthStart, { weekStartsOn: 1 }), [monthStart]);
  const gridEnd = useMemo(() => endOfWeek(monthEnd, { weekStartsOn: 1 }), [monthEnd]);
  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: gridStart, end: gridEnd }),
    [gridStart, gridEnd],
  );

  // Load profile + employee list (master only) once
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;

      setMyUserId(user.id);
      setMyEmail(user.email ?? '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('role, email')
        .eq('id', user.id)
        .single();

      if (!cancelled && profile?.role) {
        const r = profile.role as string;
        if (r === 'manager' || r === 'supervisor') setUserRole(r);
      }

      const email = profile?.email ?? user.email ?? '';
      const master = email === MASTER_EMAIL;
      if (!cancelled) setIsMaster(master);

      if (master) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, first_name')
          .order('first_name', { ascending: true });

        if (!cancelled && profiles) {
          setEmployees(
            profiles.map((p: { id: string; first_name: string | null }) => ({
              id: p.id,
              name: p.first_name || 'Sin nombre',
            }))
          );
        }
      }
    }
    void init();
    return () => { cancelled = true; };
  }, [supabase]);

  // Target user: selected employee (master) or self
  const targetUserId = isMaster && selectedEmployeeId ? selectedEmployeeId : myUserId;

  // Load shifts for the target user
  const loadShifts = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const startIso = format(gridStart, 'yyyy-MM-dd') + 'T00:00:00';
      const endIso = format(gridEnd, 'yyyy-MM-dd') + 'T23:59:59';

      const { data: rawShifts } = await supabase
        .from('shifts')
        .select('start_time, end_time, activity, activity_2')
        .eq('user_id', targetUserId)
        .eq('is_published', true)
        .gte('start_time', startIso)
        .lte('start_time', endIso)
        .order('start_time', { ascending: true });

      // Fetch activity colors from activity_occurrences for this date range
      const { data: activityRows } = await supabase
        .from('activity_occurrences')
        .select('activity_date, activities ( name, color )')
        .gte('activity_date', format(gridStart, 'yyyy-MM-dd'))
        .lte('activity_date', format(gridEnd, 'yyyy-MM-dd'));

      const colorByNameByDate: Record<string, Record<string, string | null>> = {};
      for (const row of activityRows ?? []) {
        const d = row.activity_date as string;
        const act = row.activities as unknown as { name: string; color: string | null } | null;
        if (!act) continue;
        if (!colorByNameByDate[d]) colorByNameByDate[d] = {};
        colorByNameByDate[d][act.name] = act.color;
      }

      const byDate: Record<string, DayShift> = {};
      const allArr: { date: Date; startTime: string; endTime: string; activity?: string }[] = [];

      for (const s of rawShifts ?? []) {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const key = format(start, 'yyyy-MM-dd');
        const startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const activity = s.activity || s.activity_2 || undefined;

        let activityColor: string | null = null;
        if (activity) {
          activityColor = colorByNameByDate[key]?.[activity] ?? null;
        }

        byDate[key] = { startTime, endTime, activity, activityColor };
        allArr.push({ date: start, startTime, endTime, activity });
      }

      setShiftsByDate(byDate);
      setAllShifts(allArr);
    } finally {
      setLoading(false);
    }
  }, [targetUserId, gridStart, gridEnd, supabase]);

  useEffect(() => {
    if (targetUserId) void loadShifts();
  }, [loadShifts, targetUserId]);

  const openDay = (day: Date) => {
    setSelectedDayStr(format(day, 'yyyy-MM-dd'));
    setModalOpen(true);
  };

  const getMonthLabel = (date: Date) =>
    date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

  // Effective userId & role for the modal
  const modalUserId = targetUserId;
  const modalRole = isMaster ? 'manager' : userRole;

  return (
    <div className="pb-24">
      <div className="w-full max-w-none px-1 py-3 sm:px-1.5 md:px-2 md:py-4">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-none">

          {/* ── Header ── */}
          <div className="flex items-center justify-between bg-[#36606F] px-3 py-2.5 min-h-[52px] gap-2">

            {/* Left: Actividades link */}
            <div className="flex-shrink-0">
              <a
                href="/staff/actividades"
                className="px-2 py-1 bg-white/10 hover:bg-white/20 text-white rounded text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Actividades
              </a>
            </div>

            {/* Center: month navigation */}
            <div className="flex items-center gap-0.5 flex-1 justify-center min-w-0">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full flex-shrink-0"
                aria-label="Mes anterior"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <span className="text-xs font-black uppercase tracking-widest text-white select-none whitespace-nowrap truncate">
                {getMonthLabel(viewMonth)}
              </span>
              <button
                type="button"
                onClick={() => setViewMonth((m) => addMonths(m, 1))}
                className="flex min-h-[40px] min-w-[32px] items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full flex-shrink-0"
                aria-label="Mes siguiente"
              >
                <ChevronRight size={18} strokeWidth={2.5} />
              </button>
            </div>

            {/* Right: employee filter (master only) */}
            <div className="flex-shrink-0 w-[90px] flex justify-end">
              {isMaster && (
                <select
                  value={selectedEmployeeId ?? ''}
                  onChange={(e) => setSelectedEmployeeId(e.target.value || null)}
                  className="w-full rounded bg-white/10 border border-white/20 text-white text-[10px] font-semibold px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer"
                  style={{ color: 'white', backgroundColor: 'rgba(255,255,255,0.12)' }}
                >
                  <option value="" style={{ color: '#1a1a1a', backgroundColor: '#fff' }}>
                    Yo (admin)
                  </option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id} style={{ color: '#1a1a1a', backgroundColor: '#fff' }}>
                      {emp.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
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

                    const activityBg = shift?.activity
                      ? (shift.activityColor || stringToHslColor(shift.activity))
                      : '#36606F';

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

                        {/* Shift rows */}
                        {shift && (
                          <div className="flex-1 w-full flex flex-col gap-[2px] overflow-hidden">

                            {/* Row 1: entry */}
                            <div
                              className="w-full rounded-[3px] px-1 py-[2px] flex items-center gap-[2px] shrink-0"
                              style={{ backgroundColor: '#22c55e', opacity: isPastDay ? 0.8 : 1 }}
                            >
                              <ArrowRight
                                className="shrink-0 text-white"
                                style={{ width: 'clamp(6px,10cqi,10px)', height: 'clamp(6px,10cqi,10px)' }}
                                strokeWidth={3}
                              />
                              <span
                                className="font-black text-white leading-none"
                                style={{ fontSize: 'clamp(6px, 11cqi, 11px)' }}
                              >
                                {shift.startTime}
                              </span>
                            </div>

                            {/* Row 2: exit */}
                            <div
                              className="w-full rounded-[3px] px-1 py-[2px] flex items-center gap-[2px] shrink-0"
                              style={{ backgroundColor: '#ef4444', opacity: isPastDay ? 0.8 : 1 }}
                            >
                              <ArrowLeft
                                className="shrink-0 text-white"
                                style={{ width: 'clamp(6px,10cqi,10px)', height: 'clamp(6px,10cqi,10px)' }}
                                strokeWidth={3}
                              />
                              <span
                                className="font-black text-white leading-none"
                                style={{ fontSize: 'clamp(6px, 11cqi, 11px)' }}
                              >
                                {shift.endTime}
                              </span>
                            </div>

                            {/* Row 3: activity */}
                            {shift.activity && (
                              <div
                                className="w-full rounded-[3px] overflow-hidden flex flex-col shrink-0"
                                style={{
                                  backgroundColor: activityBg,
                                  opacity: isPastDay ? 0.8 : 1,
                                }}
                              >
                                <div className="px-1 py-[2px] bg-black/10">
                                  <span
                                    className="block break-keep font-bold leading-tight text-white"
                                    style={{ fontSize: 'clamp(5px, 12cqi, 11px)' }}
                                  >
                                    {shift.activity}
                                  </span>
                                </div>
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
        userId={modalUserId}
        userRole={modalRole}
        userEmail={myEmail}
        initialFocusDate={selectedDayStr}
      />
    </div>
  );
}
