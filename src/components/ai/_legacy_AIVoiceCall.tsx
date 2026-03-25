'use client';

import { useEffect, useState } from 'react';
import {
    LiveKitRoom,
    RoomAudioRenderer,
    BarVisualizer,
    useVoiceAssistant,
    useConnectionState,
    useTrackTranscription,
} from '@livekit/components-react';
import { ConnectionState, Track } from 'livekit-client';
import { Loader2, PhoneOff, MicOff, Mic } from 'lucide-react';
import { toast } from 'sonner';

interface AIVoiceCallProps {
    onClose: () => void;
}

export function AIVoiceCall({ onClose }: AIVoiceCallProps) {
    const [token, setToken] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [hardwareError, setHardwareError] = useState<string | null>(null);

    useEffect(() => {
        // Obtener token seguro validado por Supabase
        const fetchToken = async () => {
            try {
                const response = await fetch('/api/livekit/token');
                if (!response.ok) {
                    if (response.status === 401) throw new Error('Sesión Expirada o Inválida (Supabase 401)');
                    throw new Error('Error recuperando token de voz');
                }
                const data = await response.json();
                setToken(data.token);
            } catch (err: any) {
                console.error('Error fetching LiveKit token:', err);
                setError(err.message);
                toast.error(`Conexión rechazada: ${err.message}`);
                onClose(); // Cerrar auto si falla auth
            }
        };

        fetchToken();
    }, [onClose]);

    if (error) return null;

    if (!token) {
        return (
            <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
                <Loader2 className="w-12 h-12 text-emerald-500 animate-spin mb-4" />
                <p className="font-bold text-white tracking-widest uppercase text-sm">Conectando con Marbella AI...</p>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-8 animate-in zoom-in-95 duration-300">
            {/* Cabecera */}
            <div className="w-full max-w-md flex justify-between items-center pt-8">
                <div className="flex flex-col">
                    <span className="text-emerald-400 font-black text-xs uppercase tracking-widest">
                        {hardwareError ? 'Fallo Crítico' : 'Llamada Segura Activa'}
                    </span>
                    <span className="text-zinc-500 text-xs font-medium">
                        {hardwareError ? 'Error de validación de hardware' : 'Conectado vía puerto encriptado'}
                    </span>
                </div>
            </div>

            {hardwareError ? (
                <ErrorUI
                    title="IA No Disponible"
                    message={hardwareError}
                    onClose={onClose}
                    onRetry={() => setHardwareError(null)}
                />
            ) : (
                <LiveKitRoom
                    token={token}
                    serverUrl={process.env.NEXT_PUBLIC_LIVEKIT_URL}
                    connectOptions={{ autoSubscribe: true }}
                    audio={true}
                    video={false}
                    className="flex-1 w-full flex flex-col items-center justify-center p-4"
                    onDisconnected={onClose}
                    onMediaDeviceFailure={(err) => {
                        console.error('MediaDeviceFailure:', err);
                        setHardwareError('Verifica el micrófono. El acceso fue denegado o el dispositivo está ocupado.');
                    }}
                >
                    <RoomAudioRenderer />
                    <CallInterface onClose={onClose} setHardwareError={setHardwareError} />
                </LiveKitRoom>
            )}
        </div>
    );
}

// UI de Error Reutilizable
function ErrorUI({ title, message, onClose, onRetry }: { title: string, message: string, onClose: () => void, onRetry: () => void }) {
    return (
        <div className="flex flex-col items-center justify-center flex-1 w-full max-w-sm text-center gap-6">
            <div className="w-24 h-24 rounded-full bg-red-500/10 flex items-center justify-center border border-red-500/20">
                <MicOff className="w-10 h-10 text-red-500" />
            </div>
            <div>
                <h2 className="text-white font-black text-2xl tracking-tight">{title}</h2>
                <p className="text-zinc-400 text-sm mt-2 max-w-[250px] mx-auto">{message}</p>
            </div>
            <div className="flex flex-col gap-3 w-full mt-8">
                <button
                    onClick={onRetry}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                >
                    Reintentar Conexión
                </button>
                <button
                    onClick={onClose}
                    className="w-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-bold py-4 rounded-2xl transition-all uppercase tracking-widest text-xs"
                >
                    Volver al Texto
                </button>
            </div>
        </div>
    );
}

function CallInterface({ onClose, setHardwareError }: { onClose: () => void, setHardwareError: (err: string) => void }) {
    const { state, audioTrack } = useVoiceAssistant();
    const connectionState = useConnectionState();
    const [isMuted, setIsMuted] = useState(false);

    useEffect(() => {
        if (connectionState === ConnectionState.Disconnected) {
            setHardwareError('La red ha fallado y no se ha podido establecer la conexión con el Agente.');
        }
    }, [connectionState, setHardwareError]);

    const getStatusText = () => {
        if (connectionState === ConnectionState.Connecting) return 'Conectando...';
        if (state === 'listening') return 'Escuchando...';
        if (state === 'speaking') return 'Hablando...';
        if (state === 'thinking') return 'Pensando...';
        return 'Conectado';
    };

    return (
        <div className="flex flex-col items-center w-full max-w-sm gap-12">
            <div className="relative w-48 h-48 rounded-full border border-zinc-800 bg-zinc-900/50 flex items-center justify-center shadow-[0_0_60px_-15px_rgba(16,185,129,0.3)]">
                {audioTrack && (
                    <BarVisualizer
                        state={state}
                        trackRef={audioTrack}
                        barCount={7}
                        className="w-32 h-24"
                        style={{ '--lk-fg': '#10b981', '--lk-va-bg': '#059669' } as React.CSSProperties}
                        options={{ minHeight: 4 }}
                    />
                )}
                {!audioTrack && connectionState === ConnectionState.Connecting && (
                    <div className="absolute inset-0 rounded-full border-2 border-emerald-500/20 animate-ping" />
                )}
                {!audioTrack && connectionState === ConnectionState.Connected && (
                    <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
                )}
            </div>

            <div className="text-center h-16">
                <h2 className="text-white font-black text-2xl tracking-tight">{getStatusText()}</h2>
                {state === 'listening' && <p className="text-zinc-400 text-sm mt-1">Dime, ¿qué necesitas?</p>}
            </div>

            <div className="flex gap-6 items-center mt-12 bg-zinc-900/80 p-4 rounded-full border border-zinc-800 backdrop-blur-sm">
                <button
                    onClick={() => setIsMuted(!isMuted)}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isMuted ? 'bg-zinc-800 text-white' : 'bg-zinc-800/50 text-zinc-400 hover:text-white'}`}
                >
                    {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                </button>

                <button
                    onClick={onClose}
                    className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-500 active:scale-95 text-white flex items-center justify-center shadow-[0_0_30px_-5px_rgba(220,38,38,0.5)] transition-all"
                >
                    <PhoneOff size={28} />
                </button>
            </div>
        </div>
    );
}
