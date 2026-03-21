'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, X, ArrowLeft } from 'lucide-react';
import { format, addMonths, subMonths, isSameMonth, isSameDay } from 'date-fns';
import { es } from 'date-fns/locale';
import { createClient } from '@/utils/supabase/client';
import { Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ScheduleDayEditor } from '@/components/schedule/ScheduleDayEditor';
import { Avatar } from '@/components/ui/Avatar';

/* ─── Constants (match editor exactly) ─────────────────── */
const START_HOUR = 7;
const END_HOUR = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;

const timeToPercent = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return ((hours - START_HOUR) + (minutes / 60)) / TOTAL_HOURS * 100;
};

/* ─── Read-Only ShiftBar: barra completa en gradiente difuminado ── */
const ReadOnlyShiftBar = ({ start, end }: { start: string; end: string }) => {
    const leftPos = Math.max(0, timeToPercent(start));
    const width = Math.max(timeToPercent(end) - leftPos, 5);
    return (
        <div
            className="absolute top-1.5 bottom-1.5 flex items-center rounded-full z-10 overflow-hidden touch-none"
            style={{
                left: `${leftPos}%`,
                width: `${width}%`,
                background: '#34d399',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.25)',
            }}
        >
            <div className="absolute left-0 top-0 bottom-0 min-w-[48px] flex items-center justify-center shrink-0 z-20">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{start}</span>
            </div>
            <div className="flex-1 h-full min-w-0" />
            <div className="absolute right-0 top-0 bottom-0 min-w-[48px] flex items-center justify-center shrink-0 z-20">
                <span className="text-[9px] font-black text-white pointer-events-none select-none px-2" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>{end}</span>
            </div>
        </div>
    );
};

/* ─── Types ─────────────────────────────────────────────── */
interface ShiftMock { date: Date; startTime: string; endTime: string; activity?: string; }
interface DayShiftRow { name: string; avatar_url?: string | null; startTime: string; endTime: string; activity?: string; }
interface Props {
    isOpen: boolean;
    onClose: () => void;
    shifts: ShiftMock[];
    userName?: string;
    userRole?: 'staff' | 'manager' | 'supervisor';
    userId?: string | null;
}

/* ─── Modal ─────────────────────────────────────────────── */
export const StaffScheduleModal = ({ isOpen, onClose, shifts, userRole, userId: propsUserId }: Props) => {
    const supabase = createClient();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [editModeForDate, setEditModeForDate] = useState<string | null>(null);
    const [dayShifts, setDayShifts] = useState<DayShiftRow[]>([]);
    const [dayActivity, setDayActivity] = useState('');
    const [dayCategory, setDayCategory] = useState('');
    const [eventStart, setEventStart] = useState('');
    const [eventEnd, setEventEnd] = useState('');
    const [eventParticipants, setEventParticipants] = useState<number | string>('');

    // Slot 2 (segunda actividad)
    const [dayActivity2, setDayActivity2] = useState('');
    const [dayCategory2, setDayCategory2] = useState('');
    const [eventStart2, setEventStart2] = useState('');
    const [eventEnd2, setEventEnd2] = useState('');
    const [eventParticipants2, setEventParticipants2] = useState<number | string>('');
    const [loadingDay, setLoadingDay] = useState(false);

    const hoursHeader = Array.from({ length: TOTAL_HOURS }, (_, i) => i + START_HOUR);

    const navigateMonth = (d: 1 | -1) =>
        setCurrentDate(d === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1));

    const generateCalendarDays = () => {
        const y = currentDate.getFullYear(), m = currentDate.getMonth();
        const firstDay = new Date(y, m, 1), lastDay = new Date(y, m + 1, 0);
        const days: (Date | null)[] = [];
        const startPad = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startPad; i++) days.push(null);
        for (let d = 1; d <= lastDay.getDate(); d++) days.push(new Date(y, m, d));
        return days;
    };

    const handleDayClick = async (day: Date) => {
        setLoadingDay(true);
        setSelectedDate(day);
        try {
            const localStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
            const localEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);

            const { data: rawShifts, error } = await supabase
                .from('shifts')
                .select('start_time, end_time, activity, activity_2, categoria, categoria_2, user_id, is_published, event_start_time, event_end_time, event_participants, event_start_time_2, event_end_time_2, event_participants_2')
                .gte('start_time', localStart.toISOString())
                .lte('start_time', localEnd.toISOString())
                .order('start_time', { ascending: true });

            if (error) throw error;

            if (!rawShifts?.length) {
                setDayShifts([]);
                setDayActivity('');
                setDayCategory('');
                setEventStart('');
                setEventEnd('');
                setEventParticipants('');
                setDayActivity2('');
                setDayCategory2('');
                setEventStart2('');
                setEventEnd2('');
                setEventParticipants2('');
                setLoadingDay(false);
                return;
            }

            // Solo turnos publicados para la tabla (todos los trabajadores del día)
            const publishedShifts = rawShifts.filter((s: any) => s.is_published);
            if (!publishedShifts.length) {
                setDayShifts([]);
                setDayActivity('');
                setDayCategory('');
                setEventStart('');
                setEventEnd('');
                setEventParticipants('');
                setDayActivity2('');
                setDayCategory2('');
                setEventStart2('');
                setEventEnd2('');
                setEventParticipants2('');
                setLoadingDay(false);
                return;
            }

            // Manager/supervisor: siempre puede ver la tabla del día (todos los turnos publicados), aunque no tenga turno.
            // Staff: solo ve la tabla los días que él tenga turno; si hay turnos pero no es su día → "Sin turno"
            const canViewAnyDay = userRole === 'manager' || userRole === 'supervisor';
            if (!canViewAnyDay) {
                const uid = propsUserId ?? (await supabase.auth.getUser()).data.user?.id ?? null;
                const userHasShiftThisDay = uid && publishedShifts.some((s: any) => s.user_id === uid);
                if (!userHasShiftThisDay) {
                    setDayShifts([]);
                    setDayActivity('');
                    setDayCategory('');
                    setEventStart('');
                    setEventEnd('');
                    setEventParticipants('');
                    setDayActivity2('');
                    setDayCategory2('');
                    setEventStart2('');
                    setEventEnd2('');
                    setEventParticipants2('');
                    setLoadingDay(false);
                    return;
                }
            }

            const ids = [...new Set(publishedShifts.map((s: any) => s.user_id))];
            const { data: profiles } = await supabase.from('profiles').select('id, first_name, avatar_url').in('id', ids);
            const nameMap: Record<string, string> = {};
            const avatarMap: Record<string, string | null> = {};
            (profiles || []).forEach((p: any) => {
                nameMap[p.id] = p.first_name || '?';
                avatarMap[p.id] = p.avatar_url ?? null;
            });

            setDayActivity(publishedShifts[0]?.activity || '');
            setDayCategory(publishedShifts[0]?.categoria || '');
            setDayActivity2(publishedShifts[0]?.activity_2 || '');
            setDayCategory2(publishedShifts[0]?.categoria_2 || '');
            setEventStart(publishedShifts[0]?.event_start_time || '');
            setEventEnd(publishedShifts[0]?.event_end_time || '');
            setEventParticipants(publishedShifts[0]?.event_participants || '');
            setEventStart2(publishedShifts[0]?.event_start_time_2 || '');
            setEventEnd2(publishedShifts[0]?.event_end_time_2 || '');
            setEventParticipants2(publishedShifts[0]?.event_participants_2 || '');
            setDayShifts(publishedShifts.map((s: any) => ({
                name: nameMap[s.user_id] || '?',
                avatar_url: avatarMap[s.user_id] ?? null,
                startTime: new Date(s.start_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                endTime: new Date(s.end_time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
                activity: s.activity || undefined,
            })));
        } catch (err: any) {
            console.error('handleDayClick full error:', err);
            toast.error(err?.message || 'Error al cargar el día');
            setDayShifts([]);
            setDayActivity('');
            setDayCategory('');
            setDayActivity2('');
            setDayCategory2('');
            setEventStart('');
            setEventEnd('');
            setEventParticipants('');
            setEventStart2('');
            setEventEnd2('');
            setEventParticipants2('');
        } finally {
            setLoadingDay(false);
        }
    };

    const handleBack = () => { setSelectedDate(null); setDayShifts([]); setEditModeForDate(null); };
    const handleClose = () => { setSelectedDate(null); setDayShifts([]); setEditModeForDate(null); onClose(); };

    const exitEditModeAndRefresh = () => {
        setEditModeForDate(null);
        if (selectedDate) handleDayClick(selectedDate);
    };

    if (!isOpen) return null;

    const calendarDays = generateCalendarDays();
    const futureShifts = shifts
        .filter(s => s.date >= new Date(new Date().setHours(0, 0, 0, 0)) && isSameMonth(s.date, currentDate))
        .sort((a, b) => a.date.getTime() - b.date.getTime());

    // TOT row — same logic as editor
    const totals = hoursHeader.map(hour =>
        dayShifts.filter(s => {
            const sh = parseInt(s.startTime.split(':')[0]);
            const eh = parseInt(s.endTime.split(':')[0]);
            return hour >= sh && hour < eh;
        }).length
    );

    const hasAct1 = dayActivity.trim().length > 0;
    const hasAct2 = dayActivity2.trim().length > 0;
    const displayOrBlank = (v: any) => {
        if (v === 0) return ' ';
        const s = String(v ?? '').trim();
        return s ? s : ' ';
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-3 backdrop-blur-sm animate-in fade-in" onClick={handleClose}>
            <div className={cn('bg-white w-full rounded-3xl shadow-2xl relative flex flex-col overflow-hidden max-h-[92vh]', editModeForDate ? 'max-w-4xl' : 'max-w-lg')} onClick={e => e.stopPropagation()}>

                {/* ── MODO EDICIÓN: editor embebido (reutiliza su cabecera, sin cabecera extra) ── */}
                {editModeForDate ? (
                    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
                        <ScheduleDayEditor
                            initialDate={editModeForDate}
                            onClose={exitEditModeAndRefresh}
                            onSuccess={exitEditModeAndRefresh}
                            onRequestCloseModal={handleClose}
                            embedded
                        />
                    </div>
                ) : (
                <>
                {/* ── HEADER (petrol, same style as editor) ── */}
                <div className="bg-[#36606F] px-4 py-3 flex items-center shrink-0">
                    {selectedDate ? (
                        <div className="flex items-center justify-between w-full gap-2">
                            {/* Volver al calendario */}
                            <button onClick={handleBack} className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-95 shrink-0">
                                <ArrowLeft size={18} strokeWidth={2.5} />
                            </button>

                            {/* Navegación por todos los días (flechas día anterior / siguiente) */}
                            <div className="flex items-center justify-center gap-2 flex-1 min-w-0">
                                {(() => {
                                    const prevDay = new Date(selectedDate!);
                                    prevDay.setDate(prevDay.getDate() - 1);
                                    const nextDay = new Date(selectedDate!);
                                    nextDay.setDate(nextDay.getDate() + 1);
                                    return (
                                        <>
                                            <button
                                                type="button"
                                                onClick={() => handleDayClick(prevDay)}
                                                className="w-7 h-7 flex items-center justify-center rounded-xl transition-all active:scale-95 shrink-0 text-white hover:bg-white/10"
                                            >
                                                <ChevronLeft size={20} strokeWidth={2.5} />
                                            </button>

                                            <h3 className="text-[12px] font-black uppercase tracking-widest text-white truncate px-1 capitalize">
                                                {format(selectedDate!, "EEE d MMMM", { locale: es }).replace(/^(\w{3})\./, '$1')}
                                            </h3>

                                            <button
                                                type="button"
                                                onClick={() => handleDayClick(nextDay)}
                                                className="w-7 h-7 flex items-center justify-center rounded-xl transition-all active:scale-95 shrink-0 text-white hover:bg-white/10"
                                            >
                                                <ChevronRight size={20} strokeWidth={2.5} />
                                            </button>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Botón de Edición (Solo para Managers): abre editor dentro del modal */}
                            {(userRole === 'manager' || userRole === 'supervisor') && (
                                <button
                                    type="button"
                                    onClick={() => setEditModeForDate(format(selectedDate!, 'yyyy-MM-dd'))}
                                    className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-xl hover:bg-white/20 transition-all text-white active:scale-95 shrink-0"
                                    title="Editar este día"
                                >
                                    <Edit2 size={16} strokeWidth={2.5} />
                                </button>
                            )}

                            {/* Cerrar */}
                            <button onClick={handleClose} className="w-8 h-8 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md shrink-0">
                                <X size={18} strokeWidth={2.5} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 w-full justify-between">
                            <div className="flex items-center">
                                <button onClick={() => navigateMonth(-1)} className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-95 text-white">
                                    <ChevronLeft size={22} />
                                </button>
                                <h3 className="text-xs font-black uppercase tracking-widest w-[130px] text-center text-white capitalize">
                                    {format(currentDate, "MMMM yyyy", { locale: es })}
                                </h3>
                                <button onClick={() => navigateMonth(1)} className="p-2 hover:bg-white/10 rounded-xl transition-all active:scale-95 text-white">
                                    <ChevronRight size={22} />
                                </button>
                            </div>
                            <button onClick={handleClose} className="w-9 h-9 flex items-center justify-center bg-rose-500 rounded-xl hover:bg-rose-600 transition-all text-white active:scale-90 shadow-md">
                                <X size={20} strokeWidth={2.5} />
                            </button>
                        </div>
                    )}
                </div>

                {/* ── BODY ── */}
                {!selectedDate ? (
                    // VISTA A: CALENDARIO MENSUAL
                    <div className="flex flex-col flex-1 overflow-hidden">
                        <div className="p-4 pb-3 shrink-0 border-b border-gray-100">
                            <div className="grid grid-cols-7 gap-1 mb-1">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-xs font-black text-gray-300">{d}</div>
                                ))}
                            </div>
                            <div className="grid grid-cols-7 gap-y-0.5">
                                {calendarDays.map((day, i) => {
                                    if (!day) return <div key={`e-${i}`} className="aspect-square" />;
                                    const today = new Date(); today.setHours(0, 0, 0, 0);
                                    const isPast = day < today;
                                    const isToday = isSameDay(day, new Date());
                                    const hasShift = shifts.some(s => isSameDay(s.date, day));
                                    return (
                                        <button key={i} type="button" onClick={() => handleDayClick(day)}
                                            className="aspect-square flex items-center justify-center rounded-xl relative transition-all duration-150 active:scale-95 cursor-pointer hover:bg-white/50">
                                            <span className={`
                                                w-7 h-7 flex items-center justify-center rounded-full text-sm font-black transition-colors
                                                ${hasShift
                                                    ? 'bg-emerald-500 text-white'
                                                    : isToday
                                                        ? 'text-blue-600'
                                                        : isPast
                                                            ? 'text-gray-300 font-medium'
                                                            : 'text-gray-900 font-medium'
                                                }
                                            `}>
                                                {day.getDate()}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-[#fafafa]">
                            <h4 className="text-[10px] font-black uppercase text-gray-400 tracking-widest mb-3">Próximos Turnos</h4>
                            {futureShifts.length === 0 ? (
                                <p className="text-center text-gray-400 text-xs font-bold py-10 italic">No hay más turnos este mes.</p>
                            ) : (
                                <div className="flex flex-col gap-2">
                                    {futureShifts.map((shift, idx) => (
                                        <div key={idx} onClick={() => handleDayClick(shift.date)}
                                            className="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm border border-gray-100 cursor-pointer hover:border-purple-200 hover:shadow-md transition-all active:scale-[0.98]">
                                            <div className="bg-purple-100 text-purple-700 rounded-xl px-3 py-2 flex flex-col items-center min-w-[46px]">
                                                <span className="text-[8px] font-black uppercase leading-none">{format(shift.date, "MMM", { locale: es })}</span>
                                                <span className="text-lg font-black leading-none mt-0.5">{shift.date.getDate()}</span>
                                            </div>
                                            <div className="flex flex-col flex-1 min-w-0">
                                                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest truncate">{shift.activity || 'Turno'}</span>
                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                    <span className="text-emerald-600 font-black text-sm">{shift.startTime}</span>
                                                    <span className="text-gray-300">-</span>
                                                    <span className="text-rose-500 font-black text-sm">{shift.endTime}</span>
                                                </div>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-300 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    // VISTA B: TABLA IDÉNTICA AL EDITOR — SÓLO LECTURA
                    <div className="flex flex-col flex-1 overflow-hidden bg-white">
                        {loadingDay ? (
                            <div className="flex-1 flex items-center justify-center py-20">
                                <div className="w-8 h-8 rounded-full border-4 border-[#36606F] border-t-transparent animate-spin" />
                            </div>
                        ) : dayShifts.length === 0 ? (
                            <div className="flex-1 flex items-center justify-center py-16 px-4">
                                <p className="text-zinc-500 text-sm font-black uppercase tracking-wider">Sin turno</p>
                            </div>
                        ) : (
                            <>
                                {/* Zona blanca — inputs en lectura (sin forma de edición) */}
                                <div className="px-4 py-3 w-full shrink-0">
                                    <div className="bg-[#4A7A89] rounded-2xl border border-[#6B98A5] shadow-sm p-3 sm:p-4">
                                        {!hasAct1 && !hasAct2 ? (
                                            <div className="text-center text-white/80 text-[11px] font-black uppercase tracking-widest py-6">Sin actividad</div>
                                        ) : (
                                            <div className="flex flex-col gap-3">
                                                {hasAct1 && (
                                                    <div className="grid grid-cols-5 gap-2 sm:gap-4 w-full">
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Actividad</span>
                                                            <div className="bg-emerald-50 border border-emerald-100 px-3 h-12 rounded-2xl flex items-center">
                                                                <span className="font-black text-zinc-800 text-[10px] sm:text-[11px] uppercase break-words leading-tight">{displayOrBlank(dayActivity)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Inicio</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-emerald-600 text-[11px] font-mono">{displayOrBlank(eventStart)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Final</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-rose-500 text-[11px] font-mono">{displayOrBlank(eventEnd)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Participantes</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-zinc-800 text-[11px]">{displayOrBlank(eventParticipants)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">cat</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-zinc-800 text-[10px] sm:text-[11px] uppercase break-words leading-tight">{displayOrBlank(dayCategory)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {hasAct2 && (
                                                    <div className="grid grid-cols-5 gap-2 sm:gap-4 w-full">
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Actividad 2</span>
                                                            <div className="bg-emerald-50 border border-emerald-100 px-3 h-12 rounded-2xl flex items-center">
                                                                <span className="font-black text-zinc-800 text-[10px] sm:text-[11px] uppercase break-words leading-tight">{displayOrBlank(dayActivity2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Inicio</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-emerald-600 text-[11px] font-mono">{displayOrBlank(eventStart2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Final</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-rose-500 text-[11px] font-mono">{displayOrBlank(eventEnd2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">Participantes</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-zinc-800 text-[11px]">{displayOrBlank(eventParticipants2)}</span>
                                                            </div>
                                                        </div>
                                                        <div className="flex flex-col gap-1.5 min-w-0">
                                                            <span className="text-[8px] sm:text-[9px] font-black text-white/80 uppercase tracking-widest text-center h-3 flex items-center justify-center">cat</span>
                                                            <div className="bg-white px-2 h-12 rounded-2xl flex items-center justify-center text-center border border-zinc-100">
                                                                <span className="font-black text-zinc-800 text-[10px] sm:text-[11px] uppercase break-words leading-tight">{displayOrBlank(dayCategory2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Tabla con contorno blanco y sombra, sin bordes entre columnas */}
                                <div className="rounded-2xl border border-white shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col flex-1 min-h-0">
                                    {/* Encabezado rojo */}
                                    <div className="flex w-full bg-[#E55353] text-white shrink-0">
                                        <div className="w-24 md:w-28 flex items-center justify-center shrink-0 h-8 md:h-9" />
                                        <div className="flex-1 relative h-8 md:h-9 flex">
                                            {hoursHeader.map(hour => (
                                                <div key={hour} className="flex-1 text-[9px] font-black flex items-center justify-start -translate-x-1 sm:-translate-x-2 select-none opacity-90">
                                                    {hour}
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Filas de empleados — sin bordes laterales entre columnas */}
                                    <div className="flex flex-col w-full bg-white flex-1 overflow-y-auto">
                                        {dayShifts.map((shift, idx) => (
                                            <div key={idx} className="flex w-full h-9 md:h-10 border-b border-gray-100 last:border-b-0 bg-white">
                                                <div className="w-24 md:w-28 px-2 flex items-center gap-2 shrink-0 overflow-hidden">
                                                    <Avatar src={shift.avatar_url ?? undefined} alt={shift.name} size="sm" className="shrink-0" />
                                                    <span className="font-black text-[10px] md:text-xs truncate uppercase tracking-tight text-gray-800 select-none min-w-0">
                                                        {shift.name}
                                                    </span>
                                                </div>
                                                <div className="flex-1 relative">
                                                    <div className="absolute inset-0 flex pointer-events-none">
                                                        {hoursHeader.map((_, i) => (
                                                            <div key={i} className="flex-1" />
                                                        ))}
                                                    </div>
                                                    <ReadOnlyShiftBar start={shift.startTime} end={shift.endTime} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Footer Total — fondo blanco, texto gris claro descriptivo */}
                                    <div className="flex w-full bg-white border-t border-gray-100 shrink-0 rounded-b-2xl">
                                        <div className="w-24 md:w-28 h-9 md:h-10 font-semibold text-gray-400 text-[10px] md:text-xs flex items-center justify-start pl-3 uppercase tracking-widest shrink-0">
                                            Total
                                        </div>
                                        <div className="flex-1 h-9 md:h-10 flex">
                                            {totals.map((count, i) => (
                                                <div key={i} className={`flex-1 flex items-center justify-center font-semibold text-[10px] md:text-xs ${count > 0 ? 'text-gray-400' : 'text-gray-300'}`}>
                                                    {count > 0 ? count : ''}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
                </>
                )}
            </div>
        </div>
    );
};
