'use client';

import React, { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, X, Check, Plus, Trash2, Save, Users, ChevronDown
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { StaffSelectionModal } from '@/components/modals/StaffSelectionModal';
import { cn } from '@/lib/utils';
import { DayDetailModal } from '@/components/modals/DayDetailModal';

// --- TIPOS ---
interface DayData {
    date: string;
    dayName: string;
    dayNumber: number;
    hasLog: boolean;
    clockIn: string | null;
    clockOut: string | null;
    totalHours: number;
    extraHours: number;
    eventType: string;
    isToday: boolean;
}

interface WeekSummary {
    totalHours: number;
    startBalance: number;
    weeklyBalance: number;
    finalBalance: number;
    estimatedValue: number;
    isPaid: boolean;
}

interface WeekData {
    weekNumber: number;
    startDate: string;
    isCurrentWeek: boolean;
    days: DayData[];
    summary: WeekSummary;
}

interface TimeLogEntry {
    id?: string;
    date: string;
    clock_in: string;
    clock_out: string;
    event_type: string;
    isNew?: boolean;
    toDelete?: boolean;
}

// --- CONSTANTES ---
const EVENT_TYPES = [
    { value: 'regular', label: 'Regular' },
    { value: 'festivo', label: 'Festivo', initial: 'F', color: 'bg-red-500 text-white', border: 'border-red-200 bg-red-50' },
    { value: 'enfermedad', label: 'Enfermedad', initial: 'E', color: 'bg-yellow-400 text-white', border: 'border-yellow-200 bg-yellow-50' },
    { value: 'baja', label: 'Baja', initial: 'B', color: 'bg-orange-500 text-white', border: 'border-orange-200 bg-orange-50' },
    { value: 'personal', label: 'Personal', initial: 'P', color: 'bg-blue-500 text-white', border: 'border-blue-200 bg-blue-50' },
];

const DAY_HEADERS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

// --- HELPERS VISUALES ---
const fmtHours = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = Math.round(val * 2) / 2;
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val < 0 ? `-${str}` : str;
};

const fmtMoney = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const str = Math.abs(val).toFixed(0);
    return val < 0 ? `-${str}€` : `${str}€`;
};

const fmtBalance = (val: number): string => {
    if (!val || Math.abs(val) < 0.05) return '';
    const rounded = Math.round(val * 2) / 2;
    const str = rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1);
    return val > 0 ? `+${str}` : str;
};

const getMonthLabel = (year: number, month: number) =>
    new Date(year, month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

// --- LÓGICA ROUNDING (solo usada en saveEdits del modal de edición) ---
const applyRoundingRule = (totalMinutes: number): number => {
    if (totalMinutes <= 0) return 0;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    if (m <= 20) return h;
    if (m <= 50) return h + 0.5;
    return h + 1;
};

export default function HistoryPage() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [weeksData, setWeeksData] = useState<WeekData[]>([]);

    // Auth & Rol
    const [userRole, setUserRole] = useState<string>('staff');
    const [currentUserId, setCurrentUserId] = useState<string>('');
    const [employees, setEmployees] = useState<{ id: string; first_name: string; last_name: string }[]>([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
    const [showEmployeeDropdown, setShowEmployeeDropdown] = useState(false);

    // Filtros de mes
    const [showFilter, setShowFilter] = useState(false);
    const [isFilterActive, setIsFilterActive] = useState(false);
    const [filterYear, setFilterYear] = useState(new Date().getFullYear());
    const [filterMonth, setFilterMonth] = useState(new Date().getMonth()); // 0-indexed

    // Edición (Manager)
    const [editingWeek, setEditingWeek] = useState<WeekData | null>(null);
    const [editingDate, setEditingDate] = useState<string | null>(null);
    const [editEntries, setEditEntries] = useState<TimeLogEntry[]>([]);
    const [savingEdit, setSavingEdit] = useState(false);

    useEffect(() => { initUser(); }, []);
    useEffect(() => {
        if (currentUserId) fetchCalendar();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedEmployeeId, currentUserId, filterYear, filterMonth]);

    async function initUser() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setCurrentUserId(user.id);
        setSelectedEmployeeId(user.id);

        const { data: profile } = await supabase.from('profiles')
            .select('role')
            .eq('id', user.id).single();

        if (profile) {
            setUserRole(profile.role);
        }

        if (profile?.role === 'manager') {
            const { data: emps } = await supabase.from('profiles')
                .select('id, first_name, last_name')
                .order('first_name');
            setEmployees((emps || []).filter((e: any) => {
                const name = (e.first_name || '').trim().toLowerCase();
                return name !== 'ramon' && name !== 'ramón' && name !== 'empleado';
            }));
        }

    }

    // Modal Success Handler
    const handleModalSuccess = () => {
        fetchCalendar();
    };

    async function fetchCalendar() {
        setLoading(true);
        try {
            const targetUserId = selectedEmployeeId || currentUserId;
            // p_month es 1-indexed en PostgreSQL
            const { data, error } = await supabase.rpc('get_monthly_timesheet', {
                p_user_id: targetUserId,
                p_year: filterYear,
                p_month: filterMonth + 1,
            });

            if (error) {
                console.error('Error fetching calendar:', error);
                setWeeksData([]);
                return;
            }

            setWeeksData((data as WeekData[]) || []);
        } catch (err) {
            console.error('fetchCalendar error:', err);
        } finally {
            setLoading(false);
        }
    }

    const applyFilter = () => {
        setIsFilterActive(true);
        setShowFilter(false);
        // El useEffect ya disparará fetchCalendar con los nuevos valores
    };

    const clearFilter = () => {
        const now = new Date();
        setFilterYear(now.getFullYear());
        setFilterMonth(now.getMonth());
        setIsFilterActive(false);
    };

    const nextMonth = () => {
        if (filterMonth === 11) {
            setFilterMonth(0);
            setFilterYear(prev => prev + 1);
        } else {
            setFilterMonth(prev => prev + 1);
        }
    };

    const prevMonth = () => {
        if (filterMonth === 0) {
            setFilterMonth(11);
            setFilterYear(prev => prev - 1);
        } else {
            setFilterMonth(prev => prev - 1);
        }
    };

    // --- EDICIÓN: Manager ---
    const openEdit = (week: WeekData, specificDate?: string) => {
        setEditingDate(specificDate || null);
    };


    const isManager = userRole === 'manager';
    const viewingOther = isManager && selectedEmployeeId && selectedEmployeeId !== currentUserId;
    const selectedEmployeeName = viewingOther
        ? employees.find(e => e.id === selectedEmployeeId)?.first_name || ''
        : '';

    return (
        <div className="pb-10">
            <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">



                {/* ── CONTENIDO PRINCIPAL DEL CALENDARIO UNIFICADO ── */}
                <div className="bg-white rounded-[20px] shadow-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-4xl mx-auto">

                    {/* CABECERA AZUL MES/AÑO (NAVEGACIÓN) */}
                    <div className="bg-[#36606F] px-4 py-2.5 flex items-center justify-between min-h-[52px]">
                        {/* Izquierda: Mes y Flechas (Agrupado y Cercano) */}
                        <div className="flex items-center gap-1">
                            <button onClick={prevMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                                <span className="text-lg font-bold font-mono">{'<'}</span>
                            </button>

                            <h2 className="text-[13px] md:text-sm font-black text-white uppercase tracking-widest whitespace-nowrap">
                                {getMonthLabel(filterYear, filterMonth)}
                            </h2>

                            <button onClick={nextMonth} className="text-white hover:text-white/70 transition-colors p-1.5 active:scale-90 opacity-80 hover:opacity-100">
                                <span className="text-lg font-bold font-mono">{'>'}</span>
                            </button>
                        </div>

                        {/* Derecha: Selector de Personal (Manager - Compacto) */}
                        <div className="flex justify-end">
                            {isManager && (
                                <div className="relative">
                                    <button
                                        onClick={() => setShowEmployeeDropdown(true)}
                                        className={cn(
                                            "h-8 px-3 bg-white/10 hover:bg-white/20 rounded-lg border border-white/10 flex items-center justify-center text-[8px] font-black uppercase tracking-widest transition-all active:scale-95 text-white shadow-sm",
                                            viewingOther && "bg-white/20 border-white/30"
                                        )}
                                    >
                                        <span className="max-w-[70px] truncate">{viewingOther ? selectedEmployeeName : "Plantilla"}</span>
                                        <ChevronDown size={10} className="ml-1.5 opacity-40 shrink-0" />
                                    </button>
                                    {viewingOther && (
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setSelectedEmployeeId(currentUserId); }}
                                            className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-red-600 transition-colors z-30 border-2 border-[#36606F]"
                                        >
                                            <X size={8} strokeWidth={4} />
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-20 flex justify-center">
                            <LoadingSpinner size="md" className="text-[#36606F]" />
                        </div>
                    ) : weeksData.length === 0 ? (
                        <div className="py-20 text-center text-zinc-400">
                            <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                            <p className="text-sm font-bold">No hay registros este mes</p>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-12 p-4 bg-zinc-50/50">
                            {weeksData.map((week, idx) => (
                                <div key={week.weekNumber} className="relative bg-white rounded-2xl shadow-[0_4px_15px_rgba(0,0,0,0.3)] flex flex-col">

                                    {/* FILA 1: Cabecera de Días (Roja) */}
                                    <div className="grid grid-cols-7 border-b border-gray-100 relative z-10 rounded-t-2xl overflow-hidden">
                                        {DAY_HEADERS.map(d => (
                                            <div key={d} className="h-5 bg-gradient-to-b from-red-500 to-red-600 flex items-center justify-center shadow-md border-r border-white/30 last:border-r-0">
                                                <span className="text-[9px] font-bold text-white uppercase tracking-wider block truncate px-0.5 drop-shadow-sm">{d}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* FILA 2: Días */}
                                    <div className="grid grid-cols-7 border-b border-gray-100">
                                        {week.days.map((day, di) => {
                                            const eventConfig = EVENT_TYPES.find(t => t.value === day.eventType);
                                            const isSpecial = day.eventType && day.eventType !== 'regular' && eventConfig;

                                            // Lógica Zero-Display
                                            const hFormatted = fmtHours(day.totalHours);
                                            const exFormatted = fmtHours(day.extraHours);

                                            return (
                                                <div
                                                    key={di}
                                                    onClick={() => openEdit(week, day.date)}
                                                    className={cn(
                                                        "relative border-r border-gray-100 last:border-r-0 min-h-[85px] flex flex-col items-center bg-white p-1 pb-1 cursor-pointer hover:bg-zinc-50 transition-colors",
                                                        day.isToday && "bg-blue-50/10"
                                                    )}
                                                >
                                                    {/* Número de día superior derecha */}
                                                    <span className={cn(
                                                        "absolute top-1 right-1 text-[9px] font-bold",
                                                        day.isToday ? "text-blue-600" : "text-gray-400"
                                                    )}>
                                                        {day.dayNumber}
                                                    </span>

                                                    {/* Centro: evento especial o fichajes */}
                                                    <div className="flex-1 flex flex-col items-center justify-center mt-3 w-full">
                                                        {isSpecial ? (
                                                            <div className={cn("px-2 py-1 rounded shadow-sm text-center", eventConfig.color)}>
                                                                <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest leading-none block pt-0.5">{eventConfig.label}</span>
                                                            </div>
                                                        ) : day.hasLog ? (
                                                            <div className="flex flex-col items-center gap-0.5 w-full">
                                                                {/* Entrada */}
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    <div className="w-1 h-1 rounded-full bg-green-500 shrink-0" />
                                                                    <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockIn}</span>
                                                                </div>
                                                                {/* Salida */}
                                                                <div className="h-3 flex items-center justify-center gap-1">
                                                                    {day.clockOut ? (
                                                                        <>
                                                                            <div className="w-1 h-1 rounded-full bg-red-500 shrink-0" />
                                                                            <span className="text-[9px] font-mono text-gray-700 leading-none">{day.clockOut}</span>
                                                                        </>
                                                                    ) : day.isToday ? (
                                                                        <div className="w-1 h-1 rounded-full bg-orange-400 animate-pulse" />
                                                                    ) : null}
                                                                </div>
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    {/* Pie: H y Ex en miniatura, Zero-Display */}
                                                    {!isSpecial && (
                                                        <div className="w-full space-y-0 mt-0.5 min-h-[20px]">
                                                            {day.hasLog && hFormatted ? (
                                                                <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                    <span className="ml-0.5">H</span>
                                                                    <span className="font-bold text-gray-800 pr-1">{hFormatted}</span>
                                                                </div>
                                                            ) : <div className="h-3" />}
                                                            {exFormatted ? (
                                                                <div className="flex justify-between items-center text-[8px] text-gray-400 h-3">
                                                                    <span className="ml-0.5">Ex</span>
                                                                    <span className="font-bold text-gray-800 pr-1">{exFormatted}</span>
                                                                </div>
                                                            ) : <div className="h-3" />}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* FILA 3: Resumen Semanal */}
                                    <div className="bg-white border-t border-gray-100 flex items-center h-10 relative z-10 rounded-b-2xl overflow-hidden">
                                        {/* ZONA IZQUIERDA (Fija) */}
                                        <div className="w-16 pl-3 shrink-0 flex items-center h-full">
                                            <span className="font-black text-[7px] uppercase leading-none text-zinc-600">
                                                SEMANA {week.weekNumber}
                                            </span>
                                        </div>

                                        {/* ZONA DERECHA (Grid de valores desplazado a la izquierda para el sello) */}
                                        <div className="flex-1 grid grid-cols-4 h-full relative z-20 pr-16 md:pr-24">
                                            {/* COL 1: HORAS */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span className="text-[9px] font-black leading-none text-black block">
                                                    {week.summary.totalHours > 0.05 ? week.summary.totalHours.toFixed(1).replace('.0', '') : " "}
                                                </span>
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">HORAS</span>
                                            </div>

                                            {/* COL 2: PENDIENTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span
                                                    className="text-[9px] font-black leading-none text-red-600 block"
                                                >
                                                    {Math.abs(week.summary.startBalance ?? 0) > 0.05
                                                        ? `${Math.abs(week.summary.startBalance).toFixed(1).replace('.0', '')}`
                                                        : " "}
                                                </span>
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter text-center">PENDIENTES</span>
                                            </div>

                                            {/* COL 3: EXTRAS */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span className="text-[9px] font-black leading-none text-black block">
                                                    {(week.summary.weeklyBalance ?? 0) > 0.05 ? Math.abs(week.summary.weeklyBalance).toFixed(1).replace('.0', '') : " "}
                                                </span>
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">EXTRAS</span>
                                            </div>

                                            {/* COL 4: IMPORTE */}
                                            <div className="flex flex-col items-center justify-between h-full pt-2.5 pb-2.5">
                                                <span
                                                    className="text-[9px] font-black leading-none text-emerald-600 block"
                                                >
                                                    {(week.summary.estimatedValue ?? 0) > 0.05 ? fmtMoney(week.summary.estimatedValue) : " "}
                                                </span>
                                                <span className="text-[7px] text-zinc-400 font-black leading-none uppercase tracking-tighter">IMPORTE</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Sello PAGADO dinámico anclado al contenedor semanal */}
                                    {week.summary.isPaid && (
                                        <img
                                            src="/sello/pagado.png"
                                            alt="PAGADO"
                                            className="absolute bottom-0 right-0 w-[72px] h-auto rotate-[0deg] z-30 pointer-events-none drop-shadow-xl -mt-1 md:w-20"
                                            style={{ transform: 'translate(10%, 15%) rotate(-15deg)' }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DayDetailModal
                    isOpen={!!editingDate}
                    onClose={() => setEditingDate(null)}
                    date={editingDate ? new Date(editingDate + 'T12:00:00') : null}
                    userId={selectedEmployeeId || currentUserId}
                    userRole={userRole as any}
                    onSuccess={handleModalSuccess}
                />

            </div>

            <StaffSelectionModal
                isOpen={showEmployeeDropdown}
                onClose={() => setShowEmployeeDropdown(false)}
                employees={employees}
                onSelect={(emp: { id: string; first_name: string; last_name: string }) => {
                    setSelectedEmployeeId(emp.id);
                    setShowEmployeeDropdown(false);
                }}
            />
        </div >
    );
}