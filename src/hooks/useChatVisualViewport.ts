'use client';

import {useLayoutEffect} from 'react';
import {chatVisibleArea} from '@/lib/chat/chat-visible-area';

type VirtualKeyboardLike = {
  boundingRect?: {top:number; height:number};
  addEventListener?: (type:'geometrychange', listener:EventListener)=>void;
  removeEventListener?: (type:'geometrychange', listener:EventListener)=>void;
};

/**
 * Ancla el modal de chat a la ventana realmente visible.
 *
 * En iOS, enfocar un textarea puede desplazar el visualViewport sin cambiar
 * el alto del viewport de layout al que se anclan elementos position:fixed.
 * Conservamos la distancia ORIGINAL entre la cabecera y el borde superior;
 * cuando aparece el teclado se comprime el chat hacia abajo, nunca se mueve
 * su cabecera ni se desplaza el historial fuera de la pantalla.
 *
 * En Chromium "overlays-content", también escuchamos VirtualKeyboard.
 * No cambiamos ningún otro modal ni hacemos scroll de la página.
 */
export function useChatVisualViewport(open:boolean):void {
  useLayoutEffect(()=>{
    if(!open) return;
    const root=document.querySelector<HTMLElement>(
      '[data-component="Modal"][data-instance="chat-marbella"]'
    );
    const frame=root?.querySelector<HTMLElement>('[data-element="frame"]');
    const panel=root?.querySelector<HTMLElement>('[data-element="container"]');
    if(!root || !frame || !panel) return;

    // Medimos ANTES de cambiar la alineación: altura/posición constantes
    // para que el teclado no recentre el cuadro hacia arriba.
    const topInFrame=Math.max(0,panel.getBoundingClientRect().top-frame.getBoundingClientRect().top);
    const expandedHeight=panel.getBoundingClientRect().height;
    root.style.setProperty('--chat-modal-anchor-top',`${topInFrame}px`);
    root.style.setProperty('--chat-modal-expanded-height',`${expandedHeight}px`);
    root.dataset.chatViewportPinned='true';

    const keyboard=(navigator as Navigator & {virtualKeyboard?:VirtualKeyboardLike}).virtualKeyboard;
    let raf=0;
    const measure=()=>{
      const vv=window.visualViewport;
      const visible=chatVisibleArea({
        top:vv?.offsetTop??0,
        left:vv?.offsetLeft??0,
        height:vv?.height??window.innerHeight,
        width:vv?.width??window.innerWidth,
        keyboardTop:keyboard?.boundingRect?.top,
        keyboardHeight:keyboard?.boundingRect?.height??0,
      });
      root.style.setProperty('--chat-visible-top',`${visible.top}px`);
      root.style.setProperty('--chat-visible-left',`${visible.left}px`);
      root.style.setProperty('--chat-visible-height',`${visible.height}px`);
      root.style.setProperty('--chat-visible-width',`${visible.width}px`);
    };
    const schedule=()=>{
      cancelAnimationFrame(raf);
      raf=requestAnimationFrame(measure);
    };
    measure();
    window.visualViewport?.addEventListener('resize',schedule);
    window.visualViewport?.addEventListener('scroll',schedule);
    window.addEventListener('resize',schedule);
    window.addEventListener('orientationchange',schedule);
    root.addEventListener('focusin',schedule);
    root.addEventListener('focusout',schedule);
    keyboard?.addEventListener?.('geometrychange',schedule);

    return ()=>{
      cancelAnimationFrame(raf);
      window.visualViewport?.removeEventListener('resize',schedule);
      window.visualViewport?.removeEventListener('scroll',schedule);
      window.removeEventListener('resize',schedule);
      window.removeEventListener('orientationchange',schedule);
      root.removeEventListener('focusin',schedule);
      root.removeEventListener('focusout',schedule);
      keyboard?.removeEventListener?.('geometrychange',schedule);
      root.removeAttribute('data-chat-viewport-pinned');
      for(const name of [
        '--chat-modal-anchor-top','--chat-modal-expanded-height',
        '--chat-visible-top','--chat-visible-left',
        '--chat-visible-height','--chat-visible-width',
      ]) root.style.removeProperty(name);
    };
  },[open]);
}
