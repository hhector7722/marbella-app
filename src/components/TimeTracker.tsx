'use client';

import { useState, useEffect } from 'react';
import { createClient } from "@/utils/supabase/client";
import { Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { getCurrentPosition, getDistanceFromLatLonInMeters, MARBELLA_COORDS, MAX_DISTANCE_METERS } from '@/lib/location';
import { formatMadridHmFromIso, formatYmdInMadrid } from '@/lib/madrid-date-bounds';
import { syncOvertimeCostAfterTimeLogChange } from '@/app/actions/persist-overtime-cost';

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

            // --- GEOFENCING ---
            let lat: number | null = null;
            let lng: number | null = null;
            let distance: number | null = null;

            // Obtener rol y exención por email (geofencing)
            const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
            const isAdmin = profile?.role === 'manager';
            const exemptLocation = isAdmin || (user.email?.toLowerCase() === 'marbellaremote@gmail.com');

            try {
                const pos = await getCurrentPosition();
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
                distance = getDistanceFromLatLonInMeters(lat, lng, MARBELLA_COORDS.lat, MARBELLA_COORDS.lng);
            } catch (geoError: any) {
                if (!exemptLocation) {
                    toast.error(geoError.message || "Ubicación necesaria para fichar");
                    setLoading(false);
                    return;
                }
            }

            if (!exemptLocation && distance !== null && distance > MAX_DISTANCE_METERS) {
                toast.error(`Estás demasiado lejos (${Math.round(distance)}m)`);
                setLoading(false);
                return;
            }

            const { data, error } = await supabase.from('time_logs').insert({
                user_id: user.id,
                input_lat: lat,
                input_lng: lng
            }).select().single();
            if (error) throw error;

            // Trigger SQL ya recalculó horas; persistir importe Cost Engine (capa de datos).
            const sync = await syncOvertimeCostAfterTimeLogChange(
                user.id,
                formatYmdInMadrid(data.clock_in) ?? undefined,
            );
            if (!sync.success) {
                toast.error(sync.error ?? 'Fichaje OK pero falló persistencia de coste OT');
            }

            setCurrentLog(data);
            toast.success("Turno iniciado");
        } catch (e: any) { toast.error(e.message); }
        finally { setLoading(false); }
    };

    const handleClockOut = async () => {
        if (!confirm("¿Finalizar turno?")) return;
        setLoading(true);
        try {
            // --- GEOFENCING (CAPTURAR COORDENADAS) ---
            let lat: number | null = null;
            let lng: number | null = null;
            try {
                const pos = await getCurrentPosition();
                lat = pos.coords.latitude;
                lng = pos.coords.longitude;
            } catch (e) { /* Fallback silencioso para salida */ }

            const now = new Date();
            const start = new Date(currentLog.clock_in);
            const totalHours = (now.getTime() - start.getTime()) / (1000 * 60 * 60);

            const { error } = await supabase
                .from('time_logs')
                .update({
                    clock_out: now.toISOString(),
                    total_hours: totalHours,
                    input_lat: lat,
                    input_lng: lng
                })
                .eq('id', currentLog.id);

            if (error) throw error;

            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const sync = await syncOvertimeCostAfterTimeLogChange(
                    user.id,
                    formatYmdInMadrid(currentLog.clock_in) ?? formatYmdInMadrid(now.toISOString()) ?? undefined,
                );
                if (!sync.success) {
                    toast.error(sync.error ?? 'Salida OK pero falló persistencia de coste OT');
                }
            }

            setCurrentLog(null);
            setElapsed("00:00:00");
            toast.success(`Turno finalizado (${totalHours.toFixed(2)}h)`);
        } catch (e: any) { toast.error(e.message); }
        finally { setLoading(false); }
    };

    if (loading) return <div className="h-48 bg-white/10 animate-pulse rounded-2xl"></div>;

    return (
        <div className={`rounded-2xl p-8 shadow-xl transition-all relative overflow-hidden flex flex-col items-center justify-center text-center gap-4 border-4 ${currentLog ? 'bg-[#5B8FB9] border-[#5B8FB9] text-white' : 'bg-white border-white text-gray-800'}`}>

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
                <div className="w-full max-w-xs">
                    <Button
                        type="button"
                        variant="secondary"
                        instance="time-tracker-salir"
                        onClick={handleClockOut}
                        disabled={loading}
                        loading={loading}
                        loadingLabel="Saliendo…"
                        className="w-full"
                    >
                        SALIR
                    </Button>
                </div>
            ) : (
                <div className="w-full max-w-xs">
                    <Button
                        type="button"
                        variant="primary"
                        instance="time-tracker-entrar"
                        onClick={handleClockIn}
                        disabled={loading}
                        loading={loading}
                        loadingLabel="Entrando…"
                        className="w-full"
                    >
                        ENTRAR
                    </Button>
                </div>
            )}

            {currentLog && (
                <p className="text-xs text-blue-200 mt-2">
                    Iniciado a las {formatMadridHmFromIso(currentLog.clock_in) ?? '--:--'}
                </p>
            )}
        </div>
    );
}