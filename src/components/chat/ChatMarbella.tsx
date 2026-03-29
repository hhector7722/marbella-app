"use client";
import { useState, useEffect } from 'react';
import '@n8n/chat/style.css';

export default function ChatMarbella() {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        if (isOpen) {
            import('@n8n/chat').then(({ createChat }) => {
                createChat({
                    webhookUrl: 'http://192.168.1.118:5678/webhook/c7e2133c-f739-4af4-80af-e572b016c60e/chat',
                    mode: 'element' as any,
                    target: '#n8n-chat-container',
                    initialMessages: [],
                    i18n: {
                        en: {
                            title: '', subtitle: '', footer: '', getStarted: '',
                            inputPlaceholder: '¿Qué receta o dato necesitas?',
                            sendButtonText: 'Enviar', closeButtonTooltip: ''
                        }
                    }
                } as any);
            });
        }
    }, [isOpen]);

    return (
        <>
            {/* EL ÚNICO BOTÓN DE IA EN LA CABECERA */}
            <button
                onClick={() => setIsOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors text-white"
            >
                <span className="font-bold text-sm">IA</span>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M18 10c0 3.866-3.582 7-8 7a8.841 8.841 0 01-4.083-.98L2 17l1.338-3.123C2.493 12.767 2 11.434 2 10c0-3.866 3.582-7 8-7s8 3.134 8 7zM7 9H5v2h2V9zm8 0h-2v2h2V9zM9 9h2v2H9V9z" clipRule="evenodd" />
                </svg>
            </button>

            {/* MODAL NATIVO */}
            {isOpen && (
                <div className="fixed inset-0 z-[999] flex items-end justify-center marbella-modal-overlay p-4 pb-safe" onClick={() => setIsOpen(false)}>
                    <div
                        className="w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl marbella-chat-container"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Cabecera Petróleo */}
                        <div className="bg-[#3F5E7A] p-4 flex justify-between items-center text-white">
                            <span className="font-bold text-sm tracking-widest">MARBELLA AI ASISTENTE</span>
                            <button onClick={() => setIsOpen(false)} className="p-1 hover:bg-white/10 rounded-full">
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {/* Contenedor del chat inyectado */}
                        <div id="n8n-chat-container" className="flex-grow"></div>
                    </div>
                </div>
            )}
        </>
    );
}