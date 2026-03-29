"use client";
import { useEffect } from 'react';
import '@n8n/chat/style.css';

export default function ChatMarbella() {
  useEffect(() => {
    import('@n8n/chat').then(({ createChat }) => {
      createChat({
        webhookUrl: 'http://192.168.1.118:5678/webhook/c7e2133c-f739-4af4-80af-e572b016c60e/chat',
        // Inyectamos en el DIV del layout, no como burbuja
        mode: 'element' as any, 
        target: '#n8n-chat-marbella-container',
        initialMessages: [], 
        i18n: {
          en: {
            title: '', 
            subtitle: '',
            footer: '', // Intento de eliminar branding vía JS
            getStarted: '', 
            inputPlaceholder: 'Escribe aquí tu consulta...',
            sendButtonText: 'Enviar',
            closeButtonTooltip: '',
          },
        },
      } as any);
    });
  }, []);

  return null;
}