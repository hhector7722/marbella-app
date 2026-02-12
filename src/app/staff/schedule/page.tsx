'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ArrowLeft, Clock,
    ChevronLeft, ChevronRight, CheckCircle2,
    Plus, Users, X
} from 'lucide-react';
import Link from 'next/link';
import { Share_Tech_Mono } from 'next/font/google';

const digitalFont = Share_Tech_Mono({ weight: '400', subsets: ['latin'] });

// --- TYPES ---
interface Shift {
    id: string;
    start_time: string;
    end_time: string;
    notes: string | null;
    activity: string | null;
    is_published: boolean;
    user_id: string;
}

interface Employee {
    id: string;
    first_name: string;
    last_name: string | null;
    role: string;
}

export default function StaffSchedulePage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [shifts, setShifts] = useState<Shift[]>([]);

    // Estado para el usuario actual y rol
    const [currentUserId, setCurrentUserId] = useState<string | null>(null);
    const [userRole, setUserRole] = useState<string | null>(null);

    // Estado para ver horarios de otro empleado (solo managers)
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
    const [employees, setEmployees] = useState<Employee[]>([]);

    // Modales
    const [showEmployeeModal, setShowEmployeeModal] = useState(false);
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());

    // Estado de filtros
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        const initData = async () => {
            await fetchProfileAndShifts();
        };
        initData();
    }, []);

    // Recargar turnos cuando cambia el empleado seleccionado
    useEffect(() => {
        if (currentUserId) {
            fetchShiftsForUser(selectedEmployeeId || currentUserId);
        }
    }, [selectedEmployeeId, currentUserId]);

    const fetchProfileAndShifts = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            setCurrentUserId(user.id);

            // 1. Obtener Rol del Usuario
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const role = profile?.role || 'staff';
            setUserRole(role);

            // 2. Si es manager, obtener lista de empleados
            if (role === 'manager') {
                const { data: allEmployees } = await supabase
                    .from('profiles')
                    .select('id, first_name, last_name, role')
                    .order('first_name');
                setEmployees(allEmployees || []);
            }

            // 3. Por defecto, mostrar solo turnos del usuario actual
            await fetchShiftsForUser(user.id);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchShiftsForUser = async (userId: string) => {
        const { data, error } = await supabase
            .from('shifts')
            .select('*')
            .eq('is_published', true)
            .eq('user_id', userId)
            .order('start_time', { ascending: true });

        if (error) console.error('Error fetching shifts:', error);
        if (data) setShifts(data);
    };

    // --- LÓGICA DE FILTRADO ---
    const now = new Date();

    const upcomingShifts = shifts.filter(s => new Date(s.start_time) >= now);
    const historyShifts = shifts.filter(s => {
        const shiftDate = new Date(s.start_time);
        return shiftDate < now &&
            shiftDate.getMonth() === selectedDate.getMonth() &&
            shiftDate.getFullYear() === selectedDate.getFullYear();
    });

    // Helpers
    const prevMonth = () => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() - 1);
        setSelectedDate(newDate);
    };

    const nextMonth = () => {
        const newDate = new Date(selectedDate);
        newDate.setMonth(newDate.getMonth() + 1);
        setSelectedDate(newDate);
    };

    const formatTime = (isoString: string) => new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const formatDateCard = (isoString: string) => {
        const d = new Date(isoString);
        return {
            dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
            dayNumber: d.getDate(),
            monthName: d.toLocaleDateString('es-ES', { month: 'short' })
        };
    };

    // Nombre del empleado seleccionado (Solo nombre de pila)
    const getSelectedEmployeeName = () => {
        if (!selectedEmployeeId) return 'Mis Turnos';
        const emp = employees.find(e => e.id === selectedEmployeeId);
        return emp ? emp.first_name : 'Mis Turnos';
    };

    // Generar días del calendario
    const generateCalendarDays = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);

        const days: (number | null)[] = [];

        // Días vacíos al inicio (Lunes = 0)
        const startDay = (firstDay.getDay() + 6) % 7;
        for (let i = 0; i < startDay; i++) {
            days.push(null);
        }

        // Días del mes
        for (let d = 1; d <= lastDay.getDate(); d++) {
            days.push(d);
        }

        return days;
    };

    const handleSelectCalendarDate = (day: number) => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        setShowCalendarModal(false);
        router.push(`/staff/schedule/editor?date=${dateStr}`);
    };

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-gray-400">Cargando turnos...</div>;

    return (
        <div className="min-h-screen bg-[#5B8FB9] pb-10 pt-4">
            {/* CONTENEDOR TIPO TARJETA */}
            <div className="max-w-2xl mx-auto px-4 md:px-0">
                <div className="bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden min-h-[calc(100vh-4rem)]">

                    {/* HEADER FIJO DENTRO DE LA TARJETA */}
                    <div className="bg-[#5B8FB9] sticky top-0 z-20 shadow-sm px-6 pt-6 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Link href="/staff/dashboard" className="p-2 bg-white/10 rounded-full hover:bg-white/20 transition-colors">
                                    <ArrowLeft size={20} className="text-white" />
                                </Link>
                                <h1 className="text-xl font-black text-white flex items-center gap-2">
                                    <Calendar className="text-white/80" size={24} fill="currentColor" />
                                    {getSelectedEmployeeName()}
                                </h1>
                            </div>

                            {/* BOTONES SOLO PARA MANAGERS */}
                            {userRole === 'manager' && (
                                <div className="flex items-center gap-2">
                                    {/* Botón selector de empleado */}
                                    <button
                                        onClick={() => setShowEmployeeModal(true)}
                                        className="bg-white/10 hover:bg-white/20 text-white p-2.5 rounded-xl transition-all active:scale-95"
                                    >
                                        <Users size={20} fill="currentColor" />
                                    </button>

                                    {/* Botón + (abre calendario) */}
                                    <button
                                        onClick={() => setShowCalendarModal(true)}
                                        className="bg-white hover:bg-white/10 text-[#5B8FB9] hover:text-white p-2.5 rounded-xl shadow-md transition-all active:scale-95"
                                    >
                                        <Plus size={20} strokeWidth={3} fill="currentColor" />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* TABS SELECTOR DENTRO DEL HEADER */}
                        <div className="grid grid-cols-2 p-1.5 bg-black/10 rounded-2xl">
                            <button
                                onClick={() => setActiveTab('upcoming')}
                                className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'upcoming' ? 'bg-white text-[#5B8FB9] shadow-sm' : 'text-white/60 font-medium'}`}
                            >
                                PRÓXIMOS
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-white text-gray-800 shadow-sm' : 'text-white/60 font-medium'}`}
                            >
                                HISTORIAL
                            </button>
                        </div>
                    </div>

                    {/* CONTENIDO PRINCIPAL SCROLLABLE */}
                    <div className="p-6 space-y-6">

                        {/* VISTA 1: PRÓXIMOS */}
                        {activeTab === 'upcoming' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {upcomingShifts.length === 0 ? (
                                    <div className="text-center py-20 bg-gray-25 rounded-[2rem] border border-dashed border-gray-100">
                                        <h3 className="font-black text-gray-700 uppercase tracking-widest text-sm">¡Todo despejado!</h3>
                                        <p className="text-[10px] font-bold text-gray-400 mt-2 max-w-[200px] mx-auto uppercase tracking-tighter">No hay turnos programados próximamente.</p>
                                    </div>
                                ) : (
                                    upcomingShifts.map((shift) => {
                                        const { dayName, dayNumber, monthName } = formatDateCard(shift.start_time);
                                        const shiftDate = new Date(shift.start_time).toISOString().split('T')[0];
                                        return (
                                            <div
                                                key={shift.id}
                                                className={`bg-white rounded-2xl px-3 py-2 shadow-sm border border-purple-100 flex items-center gap-3 ${userRole === 'manager' ? 'cursor-pointer hover:border-purple-300 hover:shadow-md active:scale-[0.99]' : ''} transition-all`}
                                                onClick={() => userRole === 'manager' && router.push(`/staff/schedule/editor?date=${shiftDate}`)}
                                            >
                                                <div className="bg-purple-50 rounded-xl px-2.5 py-1.5 text-center min-w-[50px] border border-purple-100">
                                                    <span className="text-lg font-black text-purple-600 leading-none">{dayNumber}</span>
                                                    <span className="block text-[8px] font-bold text-purple-400 uppercase">{monthName}</span>
                                                </div>
                                                <div className="flex-1 flex items-center gap-3">
                                                    <span className="text-xs font-medium text-gray-500">{shift.activity || 'Turno'}</span>
                                                    <div className="flex items-center gap-1.5 text-sm font-black">
                                                        <span className="text-green-600">{formatTime(shift.start_time)}</span>
                                                        <span className="text-gray-800">-</span>
                                                        <span className="text-red-500">{formatTime(shift.end_time)}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}

                        {/* VISTA 2: HISTORIAL */}
                        {activeTab === 'history' && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                                {/* FILTRO DE MES */}
                                <div className="flex items-center justify-between bg-gray-50 p-2 rounded-2xl border border-gray-100 shadow-sm mx-4">
                                    <button onClick={prevMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-gray-400 transition-all"><ChevronLeft size={22} /></button>
                                    <span className="font-black text-gray-700 capitalize text-sm tracking-wide">
                                        {selectedDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                                    </span>
                                    <button onClick={nextMonth} className="p-2 hover:bg-white hover:shadow-sm rounded-xl text-gray-400 transition-all"><ChevronRight size={22} /></button>
                                </div>

                                {/* LISTA HISTÓRICA */}
                                <div className="space-y-3 px-2">
                                    {historyShifts.length === 0 ? (
                                        <div className="text-center py-16 bg-white rounded-[2rem] border border-gray-50">
                                            <p className="text-gray-300 font-bold text-sm">Sin registros previos.</p>
                                        </div>
                                    ) : (
                                        historyShifts.map((shift) => {
                                            const { dayNumber, monthName } = formatDateCard(shift.start_time);
                                            const shiftDate = new Date(shift.start_time).toISOString().split('T')[0];
                                            return (
                                                <div
                                                    key={shift.id}
                                                    className={`bg-white rounded-2xl px-3 py-2 shadow-sm border border-gray-100 flex items-center gap-3 ${userRole === 'manager' ? 'cursor-pointer hover:border-purple-300 hover:shadow-md active:scale-[0.99]' : ''} transition-all`}
                                                    onClick={() => userRole === 'manager' && router.push(`/staff/schedule/editor?date=${shiftDate}`)}
                                                >
                                                    <div className="bg-gray-50 rounded-xl px-2.5 py-1.5 text-center min-w-[50px] border border-gray-100">
                                                        <span className="text-lg font-black text-gray-600 leading-none">{dayNumber}</span>
                                                        <span className="block text-[8px] font-bold text-gray-400 uppercase">{monthName}</span>
                                                    </div>
                                                    <div className="flex-1 flex items-center gap-3">
                                                        <span className="text-xs font-medium text-gray-500">{shift.activity || 'Turno'}</span>
                                                        <div className="flex items-center gap-1.5 text-sm font-black">
                                                            <span className="text-green-600">{formatTime(shift.start_time)}</span>
                                                            <span className="text-gray-800">-</span>
                                                            <span className="text-red-500">{formatTime(shift.end_time)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* MODAL: Selector de Empleado */}
            {showEmployeeModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowEmployeeModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm max-h-[70vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Seleccionar Empleado</h3>
                            <button onClick={() => setShowEmployeeModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>
                        <div className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
                            {/* Opción para ver los propios */}
                            <button
                                onClick={() => { setSelectedEmployeeId(null); setShowEmployeeModal(false); }}
                                className={`w-full text-left p-3 rounded-xl transition-all ${!selectedEmployeeId ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                            >
                                <span className="font-bold">Mis Turnos</span>
                            </button>

                            {employees.map(emp => (
                                <button
                                    key={emp.id}
                                    onClick={() => { setSelectedEmployeeId(emp.id); setShowEmployeeModal(false); }}
                                    className={`w-full text-left p-3 rounded-xl transition-all ${selectedEmployeeId === emp.id ? 'bg-purple-100 text-purple-700' : 'bg-gray-50 hover:bg-gray-100 text-gray-700'}`}
                                >
                                    <span className="font-bold">{emp.first_name} {emp.last_name || ''}</span>
                                    <span className="text-xs text-gray-400 ml-2 capitalize">{emp.role}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: Calendario */}
            {showCalendarModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowCalendarModal(false)}>
                    <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">Seleccionar Fecha</h3>
                            <button onClick={() => setShowCalendarModal(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X size={20} className="text-gray-400" />
                            </button>
                        </div>

                        {/* Navegación de mes */}
                        <div className="flex items-center justify-between p-4">
                            <button
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))}
                                className="p-2 hover:bg-gray-100 rounded-xl"
                            >
                                <ChevronLeft size={20} className="text-gray-600" />
                            </button>
                            <span className="font-bold text-gray-800 capitalize">
                                {calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </span>
                            <button
                                onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))}
                                className="p-2 hover:bg-gray-100 rounded-xl"
                            >
                                <ChevronRight size={20} className="text-gray-600" />
                            </button>
                        </div>

                        {/* Grid de días */}
                        <div className="p-4 pt-0">
                            {/* Cabecera días de la semana */}
                            <div className="grid grid-cols-7 gap-1 mb-2">
                                {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                    <div key={d} className="text-center text-xs font-bold text-gray-400 py-1">{d}</div>
                                ))}
                            </div>

                            {/* Días del mes */}
                            <div className="grid grid-cols-7 gap-1">
                                {generateCalendarDays().map((day, i) => (
                                    <button
                                        key={i}
                                        onClick={() => day && handleSelectCalendarDate(day)}
                                        disabled={!day}
                                        className={`aspect-square flex items-center justify-center rounded-xl text-sm font-bold transition-all
                                            ${!day ? 'invisible' : 'hover:bg-purple-100 hover:text-purple-600 text-gray-700'}
                                            ${day === new Date().getDate() &&
                                                calendarDate.getMonth() === new Date().getMonth() &&
                                                calendarDate.getFullYear() === new Date().getFullYear()
                                                ? 'bg-purple-600 text-white hover:bg-purple-700 hover:text-white'
                                                : ''
                                            }
                                        `}
                                    >
                                        {day}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}