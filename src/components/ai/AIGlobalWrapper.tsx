'use client';

import { useCallback } from 'react';
import { useAIStore } from '@/store/aiStore';
import { AIChatWidget } from './AIChatWidget';
import { AIVoiceCall } from './AIVoiceCall';
import { cn } from '@/lib/utils';

export function AIGlobalWrapper() {
    const isOpen = useAIStore((state) => state.isOpen);
    const isCallActive = useAIStore((state) => state.isCallActive);
    const closeChat = useAIStore((state) => state.closeChat);
    const setCallActive = useAIStore((state) => state.setCallActive);

    const handleBackdropClick = useCallback(() => {
        // RESTRICCIÓN CRÍTICA: Bloquear cierre si hay llamada de voz activa
        if (isCallActive) return;
        closeChat();
    }, [isCallActive, closeChat]);

    const handleCallStart = useCallback(() => {
        setCallActive(true);
    }, [setCallActive]);

    const handleCallEnd = useCallback(() => {
        setCallActive(false);
    }, [setCallActive]);

    return (
        // REGLA 1: NUNCA se desmonta del DOM. La visibilidad se controla por clases CSS (sin conditional rendering).
        <div
            className={cn(
                'fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 transition-all duration-300',
                isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
            aria-hidden={!isOpen}
        >
            {/* Backdrop con blur */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-md"
                onClick={handleBackdropClick}
            />

            {/* Contenedor principal del chat: detiene propagación al backdrop */}
            <div
                className="relative w-full max-w-lg h-[80vh] sm:h-[75vh] bg-[#fafafa] rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Widget de Chat Asíncrono — SIEMPRE en el DOM */}
                <AIChatWidget onStartCall={handleCallStart} />

                {/* Modal de Llamada — Solo se monta/desmonta aquí porque tiene su propio fixed inset-0 */}
                {isCallActive && (
                    <AIVoiceCall onClose={handleCallEnd} />
                )}
            </div>
        </div>
    );
}
