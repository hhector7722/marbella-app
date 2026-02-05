'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ArrowLeft, Clock,
    ChevronLeft, ChevronRight, CheckCircle2,
    Trophy, StickyNote, Plus
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
}

export default function StaffSchedulePage() {
    const supabase = createClient();
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [shifts, setShifts] = useState<Shift[]>([]);

    // Nuevo estado para el Rol
    const [userRole, setUserRole] = useState<string | null>(null);

    // Estado de filtros
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        const initData = async () => {
            await fetchProfileAndShifts();
        };
        initData();
    }, []);

    const fetchProfileAndShifts = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // 1. Obtener Rol del Usuario
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            const role = profile?.role || 'staff';
            setUserRole(role);

            // 2. Obtener Turnos (Manager ve todos, Staff solo los suyos)
            let query = supabase
                .from('shifts')
                .select('*')
                .eq('is_published', true)
                .order('start_time', { ascending: false });

            // Si no es manager, filtrar solo por su user_id
            if (role !== 'manager') {
                query = query.eq('user_id', user.id);
            }

            const { data, error } = await query;

            if (error) throw error;
            if (data) setShifts(data);

        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- LÓGICA DE FILTRADO ---
    const now = new Date();

    const upcomingShifts = shifts
        .filter(s => new Date(s.start_time) >= now)
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    const historyShifts = shifts
        .filter(s => new Date(s.start_time) < now)
        .filter(s => {
            const d = new Date(s.start_time);
            return d.getMonth() === selectedDate.getMonth() && d.getFullYear() === selectedDate.getFullYear();
        })
        .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());

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

    const formatTime = (isoString: string) => {
        return new Date(isoString).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    };

    const getDuration = (start: string, end: string) => {
        const diff = new Date(end).getTime() - new Date(start).getTime();
        const hours = diff / (1000 * 60 * 60);
        return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
    };

    const formatDateCard = (isoString: string) => {
        const date = new Date(isoString);
        return {
            dayName: date.toLocaleDateString('es-ES', { weekday: 'long' }),
            dayNumber: date.getDate(),
            monthName: date.toLocaleDateString('es-ES', { month: 'short' })
        };
    };

    if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-gray-400">Cargando turnos...</div>;

    return (
        <div className="min-h-screen bg-[#5B8FB9] pb-10 pt-4">
            {/* CONTENEDOR TIPO TARJETA */}
            <div className="max-w-2xl mx-auto px-4 md:px-0">
                <div className="bg-white rounded-[2rem] shadow-2xl border border-white/20 overflow-hidden min-h-[calc(100vh-4rem)]">

                    {/* HEADER FIJO DENTRO DE LA TARJETA */}
                    <div className="bg-white sticky top-0 z-20 shadow-sm px-6 pt-6 pb-4">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <Link href="/staff/dashboard" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                                    <ArrowLeft size={20} className="text-gray-600" />
                                </Link>
                                <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
                                    <Calendar className="text-purple-600" size={24} />
                                    Mis Turnos
                                </h1>
                            </div>

                            {/* BOTÓN SOLO PARA MANAGERS -> ABRE EL EDITOR */}
                            {userRole === 'manager' && (
                                <Link
                                    href="/staff/schedule/editor"
                                    className="bg-[#5B8FB9] hover:bg-blue-600 text-white p-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center justify-center"
                                >
                                    <Plus size={20} strokeWidth={3} />
                                </Link>
                            )}
                        </div>

                        {/* TABS SELECTOR DENTRO DEL HEADER */}
                        <div className="grid grid-cols-2 p-1.5 bg-gray-100 rounded-2xl">
                            <button
                                onClick={() => setActiveTab('upcoming')}
                                className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'upcoming' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400 font-medium'}`}
                            >
                                PRÓXIMOS
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 font-medium'}`}
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
                                        <div className="bg-green-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle2 className="text-green-500" size={40} />
                                        </div>
                                        <h3 className="font-black text-gray-700">¡Todo despejado!</h3>
                                        <p className="text-xs text-gray-400 mt-2 max-w-[200px] mx-auto">No tienes turnos programados próximamente. Disfruta tu descanso.</p>
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
                                                {/* FECHA COMPACTA */}
                                                <div className="bg-purple-50 rounded-xl px-2.5 py-1.5 text-center min-w-[50px] border border-purple-100">
                                                    <span className="text-lg font-black text-purple-600 leading-none">{dayNumber}</span>
                                                    <span className="block text-[8px] font-bold text-purple-400 uppercase">{monthName}</span>
                                                </div>

                                                {/* ACTIVIDAD Y HORARIO - JUNTOS */}
                                                <div className="flex-1 flex items-center gap-3">
                                                    <span className="text-xs font-medium text-gray-500">
                                                        {shift.activity || 'Turno'}
                                                    </span>
                                                    <span className="text-sm font-black text-gray-800">
                                                        {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                    </span>
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
                                                    className={`bg-white rounded-2xl px-3 py-2 shadow-sm border border-gray-200 flex items-center gap-3 ${userRole === 'manager' ? 'cursor-pointer hover:border-purple-300 hover:shadow-md active:scale-[0.99]' : ''} transition-all`}
                                                    onClick={() => userRole === 'manager' && router.push(`/staff/schedule/editor?date=${shiftDate}`)}
                                                >
                                                    {/* FECHA COMPACTA */}
                                                    <div className="bg-gray-100 rounded-xl px-2.5 py-1.5 text-center min-w-[50px] border border-gray-200">
                                                        <span className="text-lg font-black text-gray-600 leading-none">{dayNumber}</span>
                                                        <span className="block text-[8px] font-bold text-gray-400 uppercase">{monthName}</span>
                                                    </div>

                                                    {/* ACTIVIDAD Y HORARIO - JUNTOS */}
                                                    <div className="flex-1 flex items-center gap-3">
                                                        <span className="text-xs font-medium text-gray-500">
                                                            {shift.activity || 'Turno'}
                                                        </span>
                                                        <span className="text-sm font-black text-gray-800">
                                                            {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                        </span>
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
        </div>
    );
}