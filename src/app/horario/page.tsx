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
import { ChevronLeft, ChevronRight, ArrowLeft, ArrowRight } from 'lucide-react';
import {
  fetchActivitiesForRangeAction,
  type DayCalendarData,
} from '@/app/staff/actividades/actions';
import { cn } from '@/lib/utils';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffScheduleModal } from '@/components/modals/StaffScheduleModal';
import { PavilionDayModal } from '@/components/pavilion/PavilionDayModal';
import { createClient } from '@/utils/supabase/client';
import { usePageView } from '@/lib/usage/usePageView';


const MASTER_EMAIL = 'hhector7722@gmail.com';

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
const MOBILE_HEADERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;

/* ── Exact copy of helpers from /staff/actividades ───────────────────────── */

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

/* ── Types ───────────────────────────────────────────────────────────────── */

interface DayShift {
  startTime: string;
  endTime: string;
}

interface EmployeeOption {
  id: string;
  name: string;
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

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function HorarioPage() {
  usePageView();

  const supabase = createClient();

  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);

  // View mode toggle
  const [viewMode, setViewMode] = useState<'horarios' | 'actividades'>('horarios');

  // User's shifts per date
  const [shiftsByDate, setShiftsByDate] = useState<Record<string, DayShift>>({});

  // Activity calendar data (same as /staff/actividades)
  const [byDate, setByDate] = useState<Record<string, DayCalendarData>>({});

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
  const [allShifts, setAllShifts] = useState<{ date: Date; startTime: string; endTime: string }[]>([]);

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

  const rangeStart = format(calendarDays[0]!, 'yyyy-MM-dd');
  const rangeEnd = format(calendarDays[calendarDays.length - 1]!, 'yyyy-MM-dd');

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

  // Load both shifts + activity calendar data in parallel
  const loadData = useCallback(async () => {
    if (!targetUserId) return;
    setLoading(true);
    try {
      const startIso = rangeStart + 'T00:00:00';
      const endIso = rangeEnd + 'T23:59:59';

      const [shiftsResult, activitiesResult] = await Promise.all([
        supabase
          .from('shifts')
          .select('start_time, end_time')
          .eq('user_id', targetUserId)
          .eq('is_published', true)
          .gte('start_time', startIso)
          .lte('start_time', endIso)
          .order('start_time', { ascending: true }),
        fetchActivitiesForRangeAction({ startDate: rangeStart, endDate: rangeEnd }),
      ]);

      const shiftMap: Record<string, DayShift> = {};
      const allArr: { date: Date; startTime: string; endTime: string }[] = [];

      for (const s of shiftsResult.data ?? []) {
        const start = new Date(s.start_time);
        const end = new Date(s.end_time);
        const key = format(start, 'yyyy-MM-dd');
        const startTime = start.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        const endTime = end.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        shiftMap[key] = { startTime, endTime };
        allArr.push({ date: start, startTime, endTime });
      }

      setShiftsByDate(shiftMap);
      setAllShifts(allArr);

      if (activitiesResult.success) {
        setByDate(activitiesResult.byDate);
      }
    } finally {
      setLoading(false);
    }
  }, [targetUserId, rangeStart, rangeEnd, supabase]);

  useEffect(() => {
    if (targetUserId) void loadData();
  }, [loadData, targetUserId]);

  const openDay = (day: Date) => {
    setSelectedDayStr(format(day, 'yyyy-MM-dd'));
    setModalOpen(true);
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
    date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(' de ', ' ');

  const modalRole = isMaster ? 'manager' : userRole;

  return (
    <div className="pb-24">
      <div className="w-full max-w-none px-1 py-3 sm:px-1.5 md:px-2 md:py-4">
        <div className="overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500 w-full max-w-none">

          {/* ── Header ── */}
          <div className="flex items-center justify-between bg-[#36606F] px-3 py-2.5 min-h-[52px] gap-2">

            {/* Left: view toggle */}
            <div className="flex-shrink-0 flex rounded-md overflow-hidden border border-white/20">
              <button
                onClick={() => setViewMode('horarios')}
                className={`px-1.5 py-1 text-[7px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  viewMode === 'horarios'
                    ? 'bg-white text-[#36606F]'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                Horarios
              </button>
              <button
                onClick={() => setViewMode('actividades')}
                className={`px-1.5 py-1 text-[7px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                  viewMode === 'actividades'
                    ? 'bg-white text-[#36606F]'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                Actividades
              </button>
            </div>

            {/* Center: month navigation */}
            <div className="flex items-center gap-0.5 flex-1 justify-center min-w-0">
              <button
                type="button"
                onClick={() => setViewMonth((m) => subMonths(m, 1))}
                className="flex items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full flex-shrink-0 p-0.5"
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
                className="flex items-center justify-center text-white transition-colors hover:bg-white/10 rounded-full flex-shrink-0 p-0.5"
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
                  className="w-full rounded bg-white/10 border border-white/20 text-white text-[10px] font-semibold text-center px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-white/40 cursor-pointer appearance-none"
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

                    return (
                      <div
                        key={key}
                        onClick={() => isViewMonthDay && openDay(day)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => e.key === 'Enter' && isViewMonthDay && openDay(day)}
                        className={cellCls}
                      >
                        {/* Day number: top of cell */}
                        <div className="flex justify-end items-center w-full shrink-0">
                          <span className={dayNumCls}>{format(day, 'd')}</span>
                        </div>

                        {viewMode === 'horarios' ? (
                          <>
                            {shift ? (
                              <>
                                <div className="flex-1 w-full min-h-0" />
                                <div
                                  className="w-6 rounded-[3px] grid grid-cols-2 shrink-0"
                                  style={{ backgroundColor: '#2b8a4e', opacity: isPastDay ? 0.8 : 1 }}
                                >
                                  <div className="flex items-center justify-center py-[2px]">
                                    <ArrowRight
                                      className="text-white shrink-0"
                                      style={{ width: 'clamp(5px,8cqi,8px)', height: 'clamp(5px,8cqi,8px)' }}
                                      strokeWidth={4}
                                    />
                                  </div>
                                  <div className="flex items-center justify-center py-[2px]">
                                    <span
                                      className="font-black text-white leading-none whitespace-nowrap"
                                      style={{ fontSize: 'clamp(4px, 7cqi, 7px)' }}
                                    >
                                      {fmtHour(shift.startTime)}
                                    </span>
                                  </div>
                                </div>
                                <div className="w-full shrink-0 h-[3px]" />
                                <div
                                  className="w-6 rounded-[3px] grid grid-cols-2 shrink-0"
                                  style={{ backgroundColor: '#c0392b', opacity: isPastDay ? 0.8 : 1 }}
                                >
                                  <div className="flex items-center justify-center py-[2px]">
                                    <ArrowLeft
                                      className="text-white shrink-0"
                                      style={{ width: 'clamp(5px,8cqi,8px)', height: 'clamp(5px,8cqi,8px)' }}
                                      strokeWidth={4}
                                    />
                                  </div>
                                  <div className="flex items-center justify-center py-[2px]">
                                    <span
                                      className="font-black text-white leading-none whitespace-nowrap"
                                      style={{ fontSize: 'clamp(4px, 7cqi, 7px)' }}
                                    >
                                      {fmtHour(shift.endTime)}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex-1 w-full min-h-0" />
                              </>
                            ) : (
                              <div className="flex-1 w-full" />
                            )}
                          </>
                        ) : (
                          <>
                            {(() => {
                              const dayData = byDate[key];
                              const barActs = dayData?.barActivities ?? [];
                              const grouped = groupActivities(barActs);
                              if (grouped.length === 0) return null;
                              return (
                                <div className="flex-1 w-full overflow-y-auto flex flex-col gap-0.5 scrollbar-hide [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] mt-0.5">
                                  {grouped.map((act, i) => {
                                    const bgColor = act.activityColor || stringToHslColor(act.activityName);
                                    return (
                                      <div
                                        key={i}
                                        className="w-full rounded-[3px] overflow-hidden flex flex-col shrink-0"
                                        style={{
                                          backgroundColor: bgColor,
                                          color: '#ffffff',
                                          containerType: 'inline-size',
                                          ...(isPastDay ? { opacity: 0.8 } : {}),
                                        }}
                                      >
                                        <div className="px-1 py-[2px]">
                                          <span
                                            className="block whitespace-nowrap font-black leading-none opacity-90 tracking-tight"
                                            style={{ fontSize: 'clamp(5px, 11cqi, 11px)' }}
                                          >
                                            {fmtHour(act.startTime)} - {fmtHour(act.endTime)}
                                          </span>
                                        </div>
                                        <div className="px-1 py-[2px] bg-black/10">
                                          <span
                                            className="block break-keep font-bold leading-tight mt-[1px]"
                                            style={{ fontSize: 'clamp(6px, 14cqi, 14px)' }}
                                          >
                                            {act.activityName}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              );
                            })()}
                          </>
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

      {/* Modal */}
      {viewMode === 'actividades' ? (
        <PavilionDayModal
          open={modalOpen}
          onClose={() => { setModalOpen(false); setSelectedDayStr(null); }}
          date={selectedDayStr}
          onNavigateDay={navigateDay}
        />
      ) : (
        <StaffScheduleModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setSelectedDayStr(null); }}
          shifts={allShifts}
          userId={targetUserId}
          userRole={modalRole}
          userEmail={myEmail}
          initialFocusDate={selectedDayStr}
        />
      )}
    </div>
  );
}
