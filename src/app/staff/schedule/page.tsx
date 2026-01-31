'use client';

import { useEffect, useState } from 'react';
import { createClient } from "@/utils/supabase/client";
import {
    Calendar, ArrowLeft, Clock, MapPin, Filter,
    ChevronLeft, ChevronRight, AlertCircle, CheckCircle2,
    Trophy, StickyNote
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
    const [loading, setLoading] = useState(true);
    const [shifts, setShifts] = useState<Shift[]>([]);

    // Estado de filtros
    const [activeTab, setActiveTab] = useState<'upcoming' | 'history'>('upcoming');
    const [selectedDate, setSelectedDate] = useState(new Date());

    useEffect(() => {
        fetchShifts();
    }, []);

    const fetchShifts = async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { data, error } = await supabase
                .from('shifts')
                .select('*')
                .eq('user_id', user.id)
                .eq('is_published', true)
                .order('start_time', { ascending: false });

            if (error) throw error;
            if (data) setShifts(data);

        } catch (error) {
            console.error('Error fetching shifts:', error);
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
        /* CAMBIO PRINCIPAL: rounded-[2.5rem] y overflow-hidden al contenedor PADRE */
        <div className="min-h-screen bg-gray-50 pb-10 rounded-[2.5rem] overflow-hidden border border-gray-100">

            {/* HEADER FIJO: Eliminado rounded inferior para que fluya con el contenedor padre */}
            <div className="bg-white sticky top-0 z-10 shadow-sm px-4 pt-4 pb-4">
                <div className="flex items-center gap-3 mb-4">
                    <Link href="/staff/dashboard" className="p-2 bg-gray-100 rounded-full hover:bg-gray-200 transition-colors">
                        <ArrowLeft size={20} className="text-gray-600" />
                    </Link>
                    <h1 className="text-xl font-black text-gray-800 flex items-center gap-2">
                        <Calendar className="text-purple-600" size={24} />
                        Mis Turnos
                    </h1>
                </div>

                {/* TABS SELECTOR */}
                <div className="grid grid-cols-2 p-1 bg-gray-100 rounded-2xl">
                    <button
                        onClick={() => setActiveTab('upcoming')}
                        className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'upcoming' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-400'}`}
                    >
                        PRÓXIMOS
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'history' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400'}`}
                    >
                        HISTORIAL
                    </button>
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="p-4 space-y-4 max-w-2xl mx-auto">

                {/* VISTA 1: PRÓXIMOS */}
                {activeTab === 'upcoming' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2">
                        {upcomingShifts.length === 0 ? (
                            <div className="text-center py-10">
                                <div className="bg-green-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <CheckCircle2 className="text-green-500" size={32} />
                                </div>
                                <h3 className="font-bold text-gray-700">Todo despejado</h3>
                                <p className="text-xs text-gray-400 mt-1">No tienes turnos programados próximamente.</p>
                            </div>
                        ) : (
                            upcomingShifts.map((shift) => {
                                const { dayName, dayNumber, monthName } = formatDateCard(shift.start_time);
                                return (
                                    <div key={shift.id} className="bg-white rounded-3xl p-4 shadow-sm border border-purple-100 relative overflow-hidden group">
                                        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-purple-500"></div>
                                        <div className="flex items-center gap-4">
                                            {/* FECHA */}
                                            <div className="flex flex-col items-center justify-center min-w-[50px] border-r border-gray-100 pr-4">
                                                <span className="text-[10px] font-bold text-gray-400 uppercase">{monthName}</span>
                                                <span className="text-2xl font-black text-gray-800 leading-none">{dayNumber}</span>
                                                <span className="text-[10px] font-bold text-gray-400 uppercase mt-0.5">{dayName.slice(0, 3)}</span>
                                            </div>

                                            {/* INFO */}
                                            <div className="flex-1 space-y-2">
                                                {/* ETIQUETAS: ACTIVIDAD y NOTAS */}
                                                <div className="flex flex-wrap items-center gap-2">
                                                    {shift.activity && (
                                                        <span className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-black rounded-lg uppercase tracking-wider border border-orange-200">
                                                            <Trophy size={10} /> {shift.activity}
                                                        </span>
                                                    )}

                                                    {shift.notes && (
                                                        <span className="flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 text-[10px] italic rounded-lg border border-gray-100">
                                                            <StickyNote size={10} /> {shift.notes}
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5 text-gray-800 font-bold text-lg">
                                                        <Clock size={16} className="text-gray-400" />
                                                        {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="block text-[10px] text-gray-400 font-bold uppercase">Duración</span>
                                                        <span className="text-sm font-black text-gray-800">{getDuration(shift.start_time, shift.end_time)}</span>
                                                    </div>
                                                </div>
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
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">

                        {/* FILTRO DE MES */}
                        <div className="flex items-center justify-between bg-white p-2 rounded-3xl border border-gray-200 shadow-sm">
                            <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronLeft size={20} /></button>
                            <span className="font-bold text-gray-800 capitalize text-sm">
                                {selectedDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}
                            </span>
                            <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-full text-gray-600"><ChevronRight size={20} /></button>
                        </div>

                        {/* LISTA HISTÓRICA */}
                        <div className="space-y-2">
                            {historyShifts.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-xs">
                                    No hay registros en este mes.
                                </div>
                            ) : (
                                historyShifts.map((shift) => {
                                    const { dayName, dayNumber } = formatDateCard(shift.start_time);
                                    return (
                                        <div key={shift.id} className="bg-white rounded-3xl p-3 border border-gray-200 flex items-center justify-between opacity-75 hover:opacity-100 transition-opacity">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-gray-100 w-10 h-10 rounded-2xl flex flex-col items-center justify-center text-gray-500">
                                                    <span className="text-[8px] font-black uppercase">{dayName.slice(0, 3)}</span>
                                                    <span className="text-sm font-bold leading-none">{dayNumber}</span>
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-gray-700">
                                                        {formatTime(shift.start_time)} - {formatTime(shift.end_time)}
                                                    </div>
                                                    {shift.activity ? (
                                                        <div className="text-[10px] font-bold text-orange-600 flex items-center gap-1">
                                                            <Trophy size={10} /> {shift.activity}
                                                        </div>
                                                    ) : (
                                                        <div className="text-[10px] text-gray-400">Turno finalizado</div>
                                                    )}
                                                </div>
                                            </div>
                                            <span className="px-2 py-1 bg-gray-50 rounded-lg text-xs font-bold text-gray-600 border border-gray-100">
                                                {getDuration(shift.start_time, shift.end_time)}
                                            </span>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}