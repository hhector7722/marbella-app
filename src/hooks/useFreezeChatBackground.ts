'use client';

import {useLayoutEffect} from 'react';
import {freezeChatBackground} from '@/lib/chat/background-page-lock';

/**
 * Evita que iOS mueva el dashboard detrás del asistente al abrir el teclado.
 * Sólo aplica al chat en pantallas móviles y devuelve el scroll original al
 * cerrar, sin afectar al visualViewport usado por el propio modal.
 */
export function useFreezeChatBackground(open:boolean):void {
  useLayoutEffect(()=>{
    if(!open || !window.matchMedia('(max-width: 1023px)').matches) return;
    const scrollY=window.scrollY;
    return freezeChatBackground(document, scrollY, (originalY)=>{
      if(window.scrollY!==originalY){
        // scroll instantáneo: no dejar que un scroll-behavior smooth global
        // haga que el dashboard se mueva tras cerrar el chat.
        window.scrollTo({top:originalY,behavior:'instant'});
      }
    });
  },[open]);
}
