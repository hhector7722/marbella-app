"use client";
import { useEffect } from 'react';
import '@n8n/chat/style.css';

export default function ChatMarbella() {
    useEffect(() => {
        import('@n8n/chat').then(({ createChat }) => {
            createChat({
                webhookUrl: 'http://192.168.1.118:5678/webhook/c7e2133c-f739-4af4-80af-e572b016c60e/chat',
                initialMessages: [], // Vacío para que no haya saludo inicial molesto
                i18n: {
                    en: {
                        title: 'Marbella Assistant',
                        subtitle: '', // Vacío
                        footer: '',   // Vacío
                        getStarted: '', // Vacío
                        inputPlaceholder: '...', // Minimalismo total
                        sendButtonText: 'Enviar',
                        closeButtonTooltip: '',
                    },
                },
            });
        });
    }, []);

    return null;
}