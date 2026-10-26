/**
 * Congela el documento situado detrás del chat en Safari/iOS. Usar únicamente
 * con modales ya abiertos (el Modal genérico se ocupa del bloqueo de overflow).
 *
 * "overflow:hidden" no basta en Safari: el teclado puede desplazar el
 * documento al enfocar el textarea incluso si los toques están deshabilitados.
 * La posición fija conserva exactamente la posición visual inicial.
 */
export function freezeChatBackground(
  doc: Document,
  scrollY: number,
  restoreScroll: (y: number) => void,
): () => void {
  const body = doc.body;
  const html = doc.documentElement;
  const previous = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    htmlOverscroll: html.style.overscrollBehavior,
  };
  const originalY = Math.max(0, scrollY);
  body.style.position = 'fixed';
  body.style.top = `-${originalY}px`;
  body.style.left = '0';
  body.style.right = '0';
  body.style.width = '100%';
  html.style.overscrollBehavior = 'none';

  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    body.style.position = previous.position;
    body.style.top = previous.top;
    body.style.left = previous.left;
    body.style.right = previous.right;
    body.style.width = previous.width;
    html.style.overscrollBehavior = previous.htmlOverscroll;
    // Restaurar el scroll inicial sin mover el dashboard ni dejar la página
    // en la posición que Safari trató de desplazar al abrir el teclado.
    restoreScroll(originalY);
  };
}
