'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAIStore } from '@/store/aiStore';
import { AIChatWidget } from './AIChatWidget';
import { AIVoiceCall } from './AIVoiceCall';
import { cn } from '@/lib/utils';

export function AIGlobalWrapper() {
    const isOpen = useAIStore((state) => state.isOpen);
    const isCallActive = useAIStore((state) => state.isCallActive);
    const closeChat = useAIStore((state) => state.closeChat);
    const setCallActive = useAIStore((state) => state.setCallActive);
    const [viewportStyle, setViewportStyle] = useState<React.CSSProperties>({ inset: 0, position: 'fixed' });

    useEffect(() => {
        if (!isOpen) return;

        const updateLayout = () => {
            if (window.visualViewport) {
                const vv = window.visualViewport;
                setViewportStyle({
                    position: 'fixed',
                    top: `${vv.offsetTop}px`,
                    left: `${vv.offsetLeft}px`,
                    width: `${vv.width}px`,
                    height: `${vv.height}px`,
                });
            } else {
                setViewportStyle({ inset: 0, position: 'fixed' });
            }
        };

        const handleScroll = () => {
            // Forzar retorno al tope si iOS intenta empujar el body (comportamiento Safari)
            if (window.scrollY > 0) window.scrollTo(0, 0);
        };

        updateLayout();
        window.visualViewport?.addEventListener('resize', updateLayout);
        window.visualViewport?.addEventListener('scroll', updateLayout);
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.visualViewport?.removeEventListener('resize', updateLayout);
            window.visualViewport?.removeEventListener('scroll', updateLayout);
            window.removeEventListener('scroll', handleScroll);
        };
    }, [isOpen]);

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

    // Prevenimos el scroll touch en el backdrop móvil para evitar arrastrar el body
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
            return () => { document.body.style.overflow = ''; };
        }
    }, [isOpen]);

    return (
        // REGLA 1: NUNCA se desmonta del DOM. La visibilidad se controla por clases CSS.
        <div
            className={cn(
                'z-[9999] flex items-end sm:items-center justify-center p-0 pt-12 sm:p-6 transition-all duration-300',
                isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            )}
            style={isOpen && Object.keys(viewportStyle).length > 2 ? viewportStyle : { position: 'fixed', inset: 0 }}
            aria-hidden={!isOpen}
        >
            {/* Backdrop con blur */}
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-md"
                onClick={handleBackdropClick}
                onTouchMove={(e) => e.preventDefault()}
            />

            {/* Contenedor principal del chat: detiene propagación al backdrop */}
            <div
                className="relative w-full max-w-lg bg-[#fafafa] sm:rounded-3xl rounded-t-3xl overflow-hidden shadow-2xl flex flex-col animate-in slide-in-from-bottom-10 sm:zoom-in-95 duration-200"
                style={{ height: '85vh', maxHeight: '100%' }}
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
