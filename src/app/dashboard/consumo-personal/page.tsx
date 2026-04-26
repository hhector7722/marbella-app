'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@/utils/supabase/client';
import { ChevronLeft, ChevronRight, User, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
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
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { TimeFilterButton } from '@/components/time/TimeFilterButton';
import { TimeFilterModal } from '@/components/time/TimeFilterModal';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';

type DayCell = { total: number };

type SummaryPayload = {
  totalAmount: number;
  daysInPeriod: number;
  byDate: Record<string, DayCell>;
};

type ProfileOption = {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url?: string | null;
};

type DayDetailWorker = {
  id: string;
  name: string | null;
  total: number;
  items: { name: string; amount: number }[];
};

type DayDetailPayload = {
  date: string;
  totalAmount: number;
  workers: DayDetailWorker[];
};

function parseLocalSafe(dateStr: string | null): Date {
  if (!dateStr) return new Date();
  const [y, m, d] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Regla Zero-Display: lectura, 0 → espacio */
function formatEuroRead(n: number): string {
  if (n === 0 || Object.is(n, -0)) return ' ';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: n < 100 ? 2 : 0,
  }).format(n);
}

function defaultFullMonthPeriod(): { start: string; end: string } {
  const t = new Date();
  return {
    start: format(startOfMonth(t), 'yyyy-MM-dd'),
    end: format(endOfMonth(t), 'yyyy-MM-dd'),
  };
}

function dayInPeriod(isoDay: string, periodStart: string, periodEnd: string): boolean {
  const d = isoDay.split('T')[0];
  const a = periodStart.split('T')[0];
  const b = periodEnd.split('T')[0];
  return d >= a && d <= b;
}

/** Solo primer nombre (sin apellidos) para desglose */
function firstNameOnly(full: string | null): string {
  if (!full || !full.trim()) return '—';
  return full.trim().split(/\s+/)[0] ?? '—';
}

/**
 * Nombre de producto en desglose: sin prefijo "Consumo personal" / "consumo-personal"
 * (el RPC ya quita parte del literal; esto cubre variantes y datos antiguos).
 */
function consumptionProductDisplayName(raw: string): string {
  const t = raw.trim();
  if (!t) return '—';
  const cleaned = t.replace(/^consumo\s*(-\s*)?personal\s*[:\-]?\s*/i, '').trim();
  return cleaned || '—';
}

export default function ConsumoPersonalDashboardPage() {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();

  const def = defaultFullMonthPeriod();
  const [periodStart, setPeriodStart] = useState<string>(def.start);
  const [periodEnd, setPeriodEnd] = useState<string>(def.end);
  const [viewMonth, setViewMonth] = useState<Date>(() => startOfMonth(new Date()));

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<SummaryPayload | null>(null);

  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const [appliedFilter, setAppliedFilter] = useState<TimeFilterValue>(() => {
    const n = new Date();
    return { kind: 'month', year: n.getFullYear(), month: n.getMonth() + 1 };
  });

  const [workerFilterId, setWorkerFilterId] = useState<string | null>(null);
  const [isWorkerModalOpen, setIsWorkerModalOpen] = useState(false);
  const [employees, setEmployees] = useState<ProfileOption[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);
  const [dayDetail, setDayDetail] = useState<DayDetailPayload | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [authState, setAuthState] = useState<
    | { status: 'checking' }
    | { status: 'unauthenticated' }
    | { status: 'forbidden' }
    | { status: 'ok'; userId: string }
  >({ status: 'checking' });

  const calendarDays = useMemo(() => {
    const startVisible = startOfWeek(startOfMonth(viewMonth), { weekStartsOn: 1 });
    const endVisible = endOfWeek(endOfMonth(viewMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start: startVisible, end: endVisible });
  }, [viewMonth]);

  const filterActive = useMemo(() => {
    const cur = defaultFullMonthPeriod();
    return periodStart !== cur.start || periodEnd !== cur.end;
  }, [periodStart, periodEnd]);

  useEffect(() => {
    let cancelledAuth = false;
    void (async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (cancelledAuth) return;
      if (userErr) {
        console.error(userErr);
        setAuthState({ status: 'unauthenticated' });
        toast.error('Sesión caducada. Vuelve a iniciar sesión.');
        router.replace('/login');
        return;
      }
      const user = userRes?.user ?? null;
      if (!user) {
        setAuthState({ status: 'unauthenticated' });
        toast.error('Sesión caducada. Vuelve a iniciar sesión.');
        router.replace('/login');
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (cancelledAuth) return;
      if (profErr) {
        console.error(profErr);
        toast.error('No se pudo verificar permisos (perfil).');
        setAuthState({ status: 'forbidden' });
        return;
      }

      const role = (prof as any)?.role as string | null | undefined;
      if (role !== 'manager' && role !== 'admin') {
        setAuthState({ status: 'forbidden' });
        toast.error('No autorizado: esta pantalla es solo para gestor/admin.');
        router.replace('/dashboard');
        return;
      }

      setAuthState({ status: 'ok', userId: user.id });
    })();
    let cancelledEmployees = false;
    void (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, avatar_url')
        .order('first_name');
      if (cancelledEmployees) return;
      if (error) {
        console.error(error);
        toast.error('No se pudo cargar la lista de empleados.');
        setEmployees([]);
        return;
      }
      const list = (data || []).filter((e: ProfileOption) => {
        const name = (e.first_name || '').trim().toLowerCase();
        return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
      });
      setEmployees(list);
    })();
    return () => {
      cancelledAuth = true;
      cancelledEmployees = true;
    };
  }, [supabase, router]);

  // Permite abrir la pantalla ya filtrada: /dashboard/consumo-personal?workerId=<uuid>
  useEffect(() => {
    const raw = searchParams?.get('workerId');
    const id = raw ? String(raw).trim() : '';
    if (!id) return;
    setWorkerFilterId(id);
  }, [searchParams]);

  const fetchSummary = useCallback(async () => {
    setLoading(true);
    try {
      if (authState.status === 'checking') return;
      if (authState.status !== 'ok') {
        setSummary(null);
        return;
      }
      const start = parseLocalSafe(periodStart);
      const end = parseLocalSafe(periodEnd);
      if (end < start) {
        setSummary(null);
        return;
      }

      const { data, error } = await supabase.rpc('get_staff_consumption_summary', {
        p_start_date: periodStart.split('T')[0],
        p_end_date: periodEnd.split('T')[0],
        p_user_id: workerFilterId ?? null,
      });
      if (error) throw error;
      const raw = (data || {}) as Record<string, unknown>;

      const byDateRaw = (raw.byDate || {}) as Record<string, { total?: number }>;
      const byDate: Record<string, DayCell> = {};
      for (const [k, v] of Object.entries(byDateRaw)) {
        const iso = k.split('T')[0];
        byDate[iso] = { total: Number(v?.total) || 0 };
      }

      setSummary({
        totalAmount: Number(raw.totalAmount) || 0,
        daysInPeriod: Number(raw.daysInPeriod) || 0,
        byDate,
      });
    } catch (e) {
      console.error(e);
      const msg = String((e as any)?.message ?? '');
      if (msg.toLowerCase().includes('no autorizado') || msg.toLowerCase().includes('forbidden')) {
        toast.error('No autorizado: esta pantalla es solo para gestor/admin.');
      } else {
        toast.error('No se pudo cargar el consumo personal.');
      }
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, periodStart, periodEnd, workerFilterId, authState]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const handlePrevMonth = () => setViewMonth((vm) => subMonths(vm, 1));
  const handleNextMonth = () => setViewMonth((vm) => addMonths(vm, 1));

  const clearTimeFilter = () => {
    const cur = defaultFullMonthPeriod();
    setPeriodStart(cur.start);
    setPeriodEnd(cur.end);
    setViewMonth(startOfMonth(new Date()));
    const n = new Date();
    setAppliedFilter({ kind: 'month', year: n.getFullYear(), month: n.getMonth() + 1 });
  };

  const openDayDetail = useCallback(
    async (day: Date) => {
      const key = format(day, 'yyyy-MM-dd');
      setSelectedDayStr(key);
      setDetailOpen(true);
      setDetailLoading(true);
      setDayDetail(null);
      setDetailError(null);
      try {
        const { data, error } = await supabase.rpc('get_staff_consumption_day_detail', {
          p_date: key,
          p_user_id: workerFilterId ?? null,
        });
        if (error) throw error;
        const raw = (data || null) as DayDetailPayload | null;
        if (!raw) {
          setDetailError('No se pudo cargar el desglose (respuesta vacía).');
          toast.error(`Error al cargar el desglose (${key})`);
          setDayDetail(null);
          return;
        }
        const mappedWorkers: DayDetailWorker[] = Array.isArray(raw.workers)
          ? raw.workers.map((w) => ({
              id: String((w as any).id ?? ''),
              name: (w as any).name != null ? String((w as any).name) : null,
              total: Number((w as any).total) || 0,
              items: Array.isArray((w as any).items)
                ? (w as any).items.map((it: any) => ({
                    name: consumptionProductDisplayName(String(it?.name ?? '')),
                    amount: Number(it?.amount) || 0,
                  }))
                : [],
            }))
          : [];
        mappedWorkers.sort((a, b) => b.total - a.total);
        for (const w of mappedWorkers) {
          w.items.sort((a, b) => b.amount - a.amount);
        }
        setDayDetail({
          date: String(raw.date),
          totalAmount: Number(raw.totalAmount) || 0,
          workers: mappedWorkers,
        });
      } catch (e) {
        console.error(e);
        const msg = String((e as any)?.message ?? '');
        setDetailError(msg || 'Error al cargar el desglose del día');
        toast.error(`Error al cargar el desglose (${key})`);
        setDayDetail(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [supabase, workerFilterId],
  );

  const closeDetail = () => {
    setDetailOpen(false);
    setDayDetail(null);
    setSelectedDayStr(null);
    setDetailError(null);
  };

  const todayStr = format(new Date(), 'yyyy-MM-dd');

  return (
    <div className="bg-[#3E6A8A] p-4 md:p-6 pb-24">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
          <div className="bg-[#36606F] px-3 md:px-6 py-4 flex items-center justify-between gap-2 shrink-0 min-h-0">
            <h1 className="text-lg md:text-xl font-black text-white uppercase tracking-wider shrink min-w-0 truncate pr-2">
              Consumo staff
            </h1>
            <div className="flex items-center gap-0.5 md:gap-1.5 shrink-0 text-white">
              <TimeFilterButton
                onClick={() => setIsTimeFilterOpen(true)}
                hasActiveFilter={filterActive}
                onClear={clearTimeFilter}
                buttonClassName="bg-transparent border-transparent shadow-none hover:bg-white/15 min-h-[40px] md:min-h-[40px] px-2 py-1.5"
              />
              <div className="relative shrink-0 flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => setIsWorkerModalOpen(true)}
                  className="relative text-white/90 hover:text-white transition-colors h-10 w-10 md:h-10 md:w-10 flex items-center justify-center rounded-lg hover:bg-white/10"
                  aria-label="Filtrar por trabajador"
                >
                  <User size={20} strokeWidth={2.25} className="shrink-0" />
                </button>
                {workerFilterId ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWorkerFilterId(null);
                    }}
                    className="absolute -right-0.5 top-0.5 z-10 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-600 text-white shadow-sm ring-2 ring-[#36606F]"
                    aria-label="Quitar filtro de trabajador"
                  >
                    <X size={9} strokeWidth={3} className="text-white" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-4 md:px-8 pt-3 pb-3 shrink-0">
            <div className="flex justify-center w-full">
              <div className="inline-flex items-center justify-center gap-1 sm:gap-2 max-w-full">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                  aria-label="Mes anterior"
                >
                  <ChevronLeft size={22} />
                </button>
                <span className="text-base md:text-lg font-black text-[#36606F] capitalize text-center px-1 sm:px-2 min-w-0 max-w-[min(100%,14rem)] sm:max-w-none">
                  {format(viewMonth, 'MMMM yyyy', { locale: es })}
                </span>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="shrink-0 p-2 rounded-xl hover:bg-zinc-100 transition-colors min-h-[48px] min-w-[48px] flex items-center justify-center text-[#36606F]"
                  aria-label="Mes siguiente"
                >
                  <ChevronRight size={22} />
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 md:p-8 flex flex-col">
            <div className="grid grid-cols-2 gap-0.5 sm:gap-1 mb-4 py-2 shrink-0 min-w-0">
              <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                  Importe
                </span>
                <span className="text-[11px] font-black leading-tight text-emerald-700 tabular-nums sm:text-xs md:text-sm">
                  {summary ? formatEuroRead(summary.totalAmount) : ' '}
                </span>
              </div>
              <div className="flex min-w-0 flex-col items-center justify-center px-0.5 text-center">
                <span className="text-[6px] font-black uppercase leading-tight text-gray-400 sm:text-[7px]">
                  Días
                </span>
                <span className="text-[11px] font-black leading-tight text-zinc-700 tabular-nums sm:text-xs md:text-sm">
                  {summary ? String(summary.daysInPeriod) : ' '}
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
                          <span className="md:hidden">{['L', 'M', 'X', 'J', 'V', 'S', 'D'][index]}</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 md:gap-2">
                      {calendarDays.map((day) => {
                        const key = format(day, 'yyyy-MM-dd');
                        const isFutureDay = key > todayStr;
                        const cell = summary?.byDate[key];
                        const total = cell?.total ?? 0;
                        const isViewMonthDay = isSameMonth(day, viewMonth);
                        const inPeriod = dayInPeriod(key, periodStart, periodEnd);
                        const showData = isViewMonthDay && inPeriod && !isFutureDay;
                        const clickable = showData;

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => clickable && openDayDetail(day)}
                            className={cn(
                              'group relative rounded-lg md:rounded-2xl border flex flex-col overflow-hidden text-left min-h-[52px] md:min-h-[100px] transition-all',
                              !isViewMonthDay &&
                                'bg-transparent border-transparent opacity-25 pointer-events-none',
                              isViewMonthDay &&
                                isFutureDay &&
                                'cursor-default border-zinc-200/60 bg-zinc-50/90',
                              isViewMonthDay &&
                                !inPeriod &&
                                !isFutureDay &&
                                'bg-zinc-100/80 border-zinc-200/80 opacity-60 cursor-not-allowed',
                              isViewMonthDay &&
                                inPeriod &&
                                !isFutureDay &&
                                'bg-white border-zinc-100 shadow-sm hover:shadow-md active:scale-[0.99]',
                            )}
                          >
                            <div
                              className={cn(
                                'px-1 py-0.5 md:px-2 md:py-1 flex justify-center items-center shrink-0',
                                showData
                                  ? 'bg-[#D64D5D]'
                                  : isFutureDay && isViewMonthDay
                                    ? 'bg-zinc-300'
                                    : 'bg-zinc-400',
                              )}
                            >
                              <span className="text-[8px] md:text-[10px] font-black text-white">
                                {format(day, 'd')}
                              </span>
                            </div>
                            <div className="p-1 md:p-2 flex flex-col flex-1 justify-center items-center">
                              <span
                                className={cn(
                                  'text-[9px] min-[370px]:text-[11px] md:text-lg font-black tabular-nums leading-none',
                                  showData ? 'text-zinc-900' : 'text-zinc-400',
                                )}
                              >
                                {showData ? formatEuroRead(total) : ' '}
                              </span>
                              <span className="text-[5px] md:text-[7px] font-black text-zinc-400 uppercase mt-0.5 hidden md:block">
                                Total
                              </span>
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

      {detailOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="fixed inset-0 z-[10050] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDetail();
            }}
            role="presentation"
          >
            <div
              className="bg-white rounded-[2rem] w-full max-w-md max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-[#36606F] px-4 py-2 text-white shrink-0 flex items-center justify-between gap-1">
                <div className="flex-1" />
                <div className="flex items-center justify-center gap-1 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedDayStr) {
                        const d = parseLocalSafe(selectedDayStr);
                        d.setDate(d.getDate() - 1);
                        openDayDetail(d);
                      }
                    }}
                    className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                    aria-label="Día anterior"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-tight text-center">
                    {selectedDayStr
                      ? format(parseLocalSafe(selectedDayStr), 'EEEE d MMM', { locale: es })
                      : ''}
                  </h3>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedDayStr) {
                        const d = parseLocalSafe(selectedDayStr);
                        d.setDate(d.getDate() + 1);
                        openDayDetail(d);
                      }
                    }}
                    className="p-1 sm:p-2 hover:bg-white/10 rounded-full transition-colors flex items-center justify-center"
                    aria-label="Día siguiente"
                  >
                    <ChevronRight size={20} />
                  </button>
                </div>
                <div className="flex-1 flex justify-end">
                  <button
                    type="button"
                    onClick={closeDetail}
                    className="p-2 hover:bg-white/10 rounded-xl transition-colors flex items-center justify-center -mr-2"
                    aria-label="Cerrar"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col min-h-0">
                {detailLoading ? (
                  <div className="flex justify-center py-12">
                    <LoadingSpinner className="text-[#36606F]" />
                  </div>
                ) : detailError ? (
                  <div className="flex flex-col items-center justify-center text-center gap-3 py-10">
                    <p className="text-sm font-black text-zinc-800">No se pudo cargar el desglose</p>
                    <p className="text-xs font-bold text-zinc-500 max-w-[22rem]">
                      {detailError}
                    </p>
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedDayStr) return;
                          openDayDetail(parseLocalSafe(selectedDayStr));
                        }}
                        className="min-h-[48px] px-4 rounded-xl bg-[#36606F] text-white font-black uppercase tracking-wider shadow-sm hover:opacity-95 active:scale-[0.99]"
                      >
                        Reintentar
                      </button>
                      <button
                        type="button"
                        onClick={closeDetail}
                        className="min-h-[48px] px-4 rounded-xl bg-zinc-100 text-zinc-800 font-black uppercase tracking-wider hover:bg-zinc-200 active:scale-[0.99]"
                      >
                        Cerrar
                      </button>
                    </div>
                  </div>
                ) : dayDetail ? (
                  <>
                    <div className="mb-4 rounded-[1.25rem] bg-[#36606F] p-3 shadow-md">
                      <p className="mb-2 text-center text-[9px] font-black uppercase tracking-[0.2em] text-white/90">
                        Resumen del día
                      </p>
                      <div className="grid grid-cols-1 gap-1 sm:gap-2">
                        <div className="bg-white rounded-xl p-2 flex flex-col items-center justify-center text-center">
                          <span className="block text-[7px] font-black uppercase tracking-wider text-zinc-500 mb-0.5">
                            Importe total
                          </span>
                          <span className="text-[12px] font-black tabular-nums text-emerald-700 leading-none">
                            {formatEuroRead(dayDetail.totalAmount)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {dayDetail.workers.length === 0 ? (
                      <p className="text-center text-zinc-400 font-bold text-sm py-8">
                        {workerFilterId ? 'Sin consumo para este trabajador este día' : 'Sin consumo este día'}
                      </p>
                    ) : (
                      <div className="flex flex-col gap-3 pb-2">
                        {dayDetail.workers.map((w) => (
                          <div key={w.id} className="rounded-2xl border border-zinc-100 bg-white shadow-sm overflow-hidden">
                            <div className="px-3 py-2 bg-zinc-50 flex items-center justify-between gap-2">
                              <div className="truncate text-[13px] font-black text-zinc-800 flex-1">
                                {firstNameOnly(w.name)}
                              </div>
                              <div className="shrink-0 text-[12px] font-black tabular-nums text-emerald-700">
                                {formatEuroRead(w.total)}
                              </div>
                            </div>
                            <div className="px-3 py-2">
                              <div className="flex flex-col gap-1">
                                {w.items.map((it, idx) => (
                                  <div key={`${it.name}-${idx}`} className="flex items-center justify-between gap-2 py-1 border-b border-zinc-100 last:border-0">
                                    <div className="min-w-0 flex-1 truncate text-[12px] font-bold text-zinc-700">
                                      {it.name}
                                    </div>
                                    <div className="shrink-0 text-[12px] font-black tabular-nums text-zinc-900">
                                      {formatEuroRead(it.amount)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center gap-2 py-10">
                    <p className="text-sm font-black text-zinc-700">Sin datos para mostrar</p>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      <StaffSelectionModal
        isOpen={isWorkerModalOpen}
        onClose={() => setIsWorkerModalOpen(false)}
        employees={employees}
        title="Trabajador"
        variant="profile-list"
        onSelect={(emp) => {
          setWorkerFilterId(emp.id);
          setIsWorkerModalOpen(false);
        }}
      />

      <TimeFilterModal
        isOpen={isTimeFilterOpen}
        onClose={() => setIsTimeFilterOpen(false)}
        allowedKinds={['date', 'range', 'week', 'month', 'year']}
        initialValue={appliedFilter}
        onApply={(v: TimeFilterValue) => {
          setAppliedFilter(v);
          if (v.kind === 'month') {
            const s = new Date(v.year, v.month - 1, 1);
            const e = endOfMonth(s);
            setPeriodStart(format(s, 'yyyy-MM-dd'));
            setPeriodEnd(format(e, 'yyyy-MM-dd'));
            setViewMonth(startOfMonth(s));
            return;
          }
          if (v.kind === 'year') {
            setPeriodStart(`${v.year}-01-01`);
            setPeriodEnd(`${v.year}-12-31`);
            setViewMonth(new Date(v.year, 0, 1));
            return;
          }
          if (v.kind === 'range' || v.kind === 'week') {
            const a = v.startDate.split('T')[0];
            const b = v.endDate.split('T')[0];
            setPeriodStart(a);
            setPeriodEnd(b);
            setViewMonth(startOfMonth(parseLocalSafe(a)));
            return;
          }
          if (v.kind === 'date') {
            const d = v.date.split('T')[0];
            setPeriodStart(d);
            setPeriodEnd(d);
            setViewMonth(startOfMonth(parseLocalSafe(d)));
          }
        }}
      />
    </div>
  );
}

