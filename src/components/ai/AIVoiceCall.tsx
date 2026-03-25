'use client';

import { useEffect, useState, useRef } from 'react';
import { Loader2, PhoneOff, MicOff, Mic, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/utils/supabase/client';

interface AIVoiceCallProps {
  onClose: () => void;
}

declare global {
  interface Window {
    vapiSDK?: any;
    Vapi?: any;
  }
}

export function AIVoiceCall({ onClose }: AIVoiceCallProps) {
  const [isConnecting, setIsConnecting] = useState(true);
  const [callStatus, setCallStatus] = useState<'idle' | 'listening' | 'speaking' | 'thinking'>('idle');
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const vapiRef = useRef<any>(null);

  useEffect(() => {
    const initVapi = async () => {
      // 1. Obtener User ID para pasar al asistente (Seguridad RBAC)
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Sesión no válida');
        onClose();
        return;
      }
      setUserId(user.id);

      // 2. Cargar Script de Vapi dinámicamente
      console.log('[VAPI] Iniciando carga de SDK...');
      
      const timeout = setTimeout(() => {
        if (!vapiRef.current) {
          console.error('[VAPI] Timeout alcanzado');
          setError('No se pudo conectar con el motor de voz (Timeout).');
          setIsConnecting(false);
        }
      }, 10000);

      if (window.Vapi || window.vapiSDK) {
        clearTimeout(timeout);
        startCall(user.id);
      } else {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/gh/vapi-ai/web-sdk@latest/dist/vapi-sdk.js';
        script.defer = true;
        script.onload = () => {
          clearTimeout(timeout);
          console.log('[VAPI] SDK cargado ok');
          startCall(user.id);
        };
        script.onerror = () => {
          clearTimeout(timeout);
          console.error('[VAPI] Error cargando SDK');
          setError('Error de red al cargar el motor de voz.');
          setIsConnecting(false);
        };
        document.body.appendChild(script);
      }
    };

    const startCall = (uid: string) => {
      try {
        // @ts-ignore
        console.log('[VAPI] window.Vapi type:', typeof window.Vapi);
        if (typeof window.Vapi !== 'function') {
           // Intentamos buscarlo en otra propiedad global si el CDN lo exporta distinto
           // @ts-ignore
           const VapiClass = window.vapiSDK?.Vapi || window.Vapi;
           if (typeof VapiClass !== 'function') {
             throw new Error('Vapi SDK not found in global window object');
           }
        }

        // @ts-ignore
        const vapi = new window.Vapi('44f9b252-4f84-4549-9437-ce1f753179a9'); 
        vapiRef.current = vapi;
        console.log('[VAPI] Instance created');

        // Configuración dinámica del asistente
        vapi.start('634ba176-7eb8-4df6-9cda-6e5b4658a472', {
          variableValues: {
            userId: uid
          }
        });
        console.log('[VAPI] vapi.start() called');

        vapi.on('call-start', () => {
          setIsConnecting(false);
          setCallStatus('listening');
          console.log('[VAPI] Call started');
        });

        vapi.on('call-end', () => {
          onClose();
        });

        vapi.on('message', (message: any) => {
          if (message.type === 'transcript' && message.transcriptType === 'partial') {
            setCallStatus('listening');
          }
          if (message.type === 'assistant-message') {
            setCallStatus('speaking');
          }
        });

        vapi.on('error', (e: any) => {
          console.error('[VAPI_ERROR]', e);
          toast.error('Error en la llamada de voz');
          onClose();
        });

      } catch (err) {
        console.error('Failed to start Vapi call:', err);
        onClose();
      }
    };

    initVapi();

    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
      }
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[10000] bg-black/95 backdrop-blur-md flex flex-col items-center justify-between p-8 animate-in zoom-in-95 duration-300">
      {/* Cabecera */}
      <div className="w-full max-w-md flex justify-between items-center pt-8">
        <div className="flex flex-col">
          <span className="text-emerald-400 font-black text-xs uppercase tracking-widest">
            {isConnecting ? 'Conectando...' : 'Llamada de Voz Activa'}
          </span>
          <span className="text-zinc-500 text-xs font-medium">
            Bar La Marbella AI - Voice Protocol v3 [20260325_1435]
          </span>
        </div>
      </div>

      {/* Centered Status / Controls */}
      <div className="flex flex-col items-center gap-12 flex-1 justify-center">
        <div 
          onClick={() => {
            if (vapiRef.current && isConnecting) {
               console.log('[VAPI] Manual retry/start triggered');
               vapiRef.current.start('634ba176-7eb8-4df6-9cda-6e5b4658a472', {
                 variableValues: { userId }
               });
            }
          }}
          className="relative w-48 h-48 rounded-full border border-zinc-800 bg-zinc-900/50 flex items-center justify-center shadow-[0_0_60px_-15px_rgba(16,185,129,0.3)] cursor-pointer"
        >
          {isConnecting ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
              <span className="text-[10px] text-zinc-500 mt-2 font-bold animate-pulse">PULSA PARA REINTENTAR</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
               {[1, 2, 3, 4, 5].map((i) => (
                 <div 
                   key={i}
                   className={`w-2 bg-emerald-500 rounded-full transition-all duration-300 ${
                     callStatus === 'speaking' ? 'animate-bounce h-12' : 
                     callStatus === 'listening' ? 'h-4 opacity-50' : 'h-2 opacity-20'
                   }`}
                   style={{ animationDelay: `${i * 100}ms` }}
                 />
               ))}
            </div>
          )}
        </div>

        <div className="text-center">
          <h2 className="text-white font-black text-2xl tracking-tight">
            {isConnecting ? 'Marbella AI' : 
             callStatus === 'speaking' ? 'Hablando...' : 
             callStatus === 'listening' ? 'Escuchando...' : 'Pensando...'}
          </h2>
          <p className="text-zinc-400 text-sm mt-1">
            {isConnecting ? 'Verificando red segura...' : 'Puedes hablar ahora'}
          </p>
        </div>
      </div>

      {/* Controles */}
      <div className="flex gap-6 items-center mb-12 bg-zinc-900/80 p-6 rounded-full border border-zinc-800 backdrop-blur-sm">
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
