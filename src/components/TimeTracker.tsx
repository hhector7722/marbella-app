'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Play, Square, Clock, Coffee } from 'lucide-react';
import { toast } from 'sonner';

export default function TimeTracker() {
    const supabase = createClient();
    const [loading, setLoading] = useState(true);
    const [currentLog, setCurrentLog] = useState<any>(null);
    const [elapsed, setElapsed] = useState<string>("00:00:00");

    useEffect(() => {
        checkStatus();
        const timer = setInterval(() => {
            if (currentLog?.clock_in) {
                const start = new Date(currentLog.clock_in).getTime();
                const now = new Date().getTime();
                const diff = now - start;

                const hours = Math.floor(diff / (1000 * 60 * 60));
                const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((diff % (1000 * 60)) / 1000);

                setElapsed(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
            }
        }, 1000);
        return () => clearInterval(timer);
    }, [currentLog?.clock_in]);

    async function checkStatus() {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data } = await supabase
                .from('time_logs')
                .select('*')
                .eq('user_id', user.id)
                .is('clock_out', null)
                .single();
            setCurrentLog(data || null);
        } catch (error) { console.error(error); }
        finally { setLoading(false); }
    }

    const handleClockIn = async () => {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const { data, error } = await supabase.from('time_logs').insert({ user_id: user.id }).select().single();
            if (error) throw error;
            setCurrentLog(data);
            toast.success("Turno iniciado");
        } catch (e: any) { toast.error(e.message); }
        finally { setLoading(false); }
    };

    const handleClockOut = async () => {
        if (!confirm("¿Finalizar turno?")) return;
        setLoading(true);
        try {
            const now = new Date();
            const start = new Date(currentLog.clock_in);
            const totalHours = (now.getTime() - start.getTime()) / (1000 * 60 * 60);

            const { error } = await supabase
                .from('time_logs')
                .update({ clock_out: now.toISOString(), status: 'completed', total_hours: totalHours })
                .eq('id', currentLog.id);

            if (error) throw error;
            setCurrentLog(null);
            setElapsed("00:00:00");
            toast.success(`Turno finalizado (${totalHours.toFixed(2)}h)`);
        } catch (e: any) { toast.error(e.message); }
        finally { setLoading(false); }
    };

    if (loading) return <div className="h-48 bg-white/10 animate-pulse rounded-[2rem]"></div>;

    return (
        <div className={`rounded-[2.5rem] p-8 shadow-xl transition-all relative overflow-hidden flex flex-col items-center justify-center text-center gap-4 border-4 ${currentLog ? 'bg-[#36606F] border-[#36606F] text-white' : 'bg-white border-white text-gray-800'}`}>

            {/* Indicador de Estado */}
            <div className={`px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${currentLog ? 'bg-white/20 text-blue-100' : 'bg-gray-100 text-gray-400'}`}>
                <Clock size={12} />
                {currentLog ? 'En turno' : 'Fuera de turno'}
            </div>

            {/* Cronómetro Grande */}
            <div className="text-5xl md:text-6xl font-black font-mono tracking-tighter">
                {currentLog ? elapsed : '--:--:--'}
            </div>

            {/* Botón de Acción */}
            {currentLog ? (
                <button
                    onClick={handleClockOut}
                    disabled={loading}
                    className="w-full max-w-xs py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black shadow-lg hover:shadow-red-500/30 transition-all flex items-center justify-center gap-2 text-lg"
                >
                    <Square size={20} fill="currentColor" /> SALIR
                </button>
            ) : (
                <button
                    onClick={handleClockIn}
                    disabled={loading}
                    className="w-full max-w-xs py-4 bg-green-500 hover:bg-green-600 text-white rounded-2xl font-black shadow-lg hover:shadow-green-500/30 transition-all flex items-center justify-center gap-2 text-lg animate-in slide-in-from-bottom-2"
                >
                    <Play size={24} fill="currentColor" /> ENTRAR
                </button>
            )}

            {currentLog && (
                <p className="text-xs text-blue-200 mt-2">
                    Iniciado a las {new Date(currentLog.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
            )}
        </div>
    );
}