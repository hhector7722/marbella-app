"use client";
import { useState, useEffect } from 'react';
import '@n8n/chat/style.css';

export default function ChatMarbella() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Busca tu botón de IA original por el ID que le pongas
    const iaButton = document.getElementById('ia-button');
    
    if (iaButton) {
      const handleOpen = (e: MouseEvent) => {
        e.preventDefault();
        setIsOpen(true);
      };
      iaButton.addEventListener('click', handleOpen as any);
      return () => iaButton.removeEventListener('click', handleOpen as any);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      import('@n8n/chat').then(({ createChat }) => {
        createChat({
          webhookUrl: 'http://192.168.1.118:5678/webhook/c7e2133c-f739-4af4-80af-e572b016c60e/chat',
          mode: 'element' as any,
          target: '#n8n-chat-container-modal',
          initialMessages: [],
          i18n: {
            en: {
              title: '', subtitle: '', footer: '', getStarted: '',
              inputPlaceholder: 'Consultar I+D Marbella...',
              sendButtonText: 'Enviar', closeButtonTooltip: ''
            }
          }
        } as any);
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[999] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 pb-safe md:items-center" 
      onClick={() => setIsOpen(false)}
    >
      <div 
        className="w-full max-w-lg bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[75vh]" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal Estilo Petróleo */}
        <div className="bg-[#3F5E7A] p-4 flex justify-between items-center text-white">
          <span className="font-bold text-xs tracking-widest uppercase">Asistente I+D Marbella</span>
          <button 
            onClick={() => setIsOpen(false)} 
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-5 h-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Contenedor donde se inyecta el chat de n8n */}
        <div id="n8n-chat-container-modal" className="flex-grow overflow-hidden"></div>
      </div>
    </div>
  );
}