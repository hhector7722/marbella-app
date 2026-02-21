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
                'fixed inset-0 z-[9999] flex items-end sm:items-center justify-center transition-all duration-300',
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
                className="relative w-full sm:w-[95%] max-w-2xl h-[92dvh] sm:h-[85vh] bg-[#fafafa] rounded-t-3xl sm:rounded-2xl overflow-hidden shadow-2xl flex flex-col"
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
