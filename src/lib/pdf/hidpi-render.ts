import type { PDFPageProxy } from 'pdfjs-dist';

/** Tope de DPR para equilibrar nitidez retina y memoria en móvil. */
const DEFAULT_MAX_DPR = 3;
/** Límite conservador de píxeles de canvas (Safari iOS). */
const MAX_CANVAS_AREA = 14_000_000;

export function getClampedDevicePixelRatio(max = DEFAULT_MAX_DPR): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), max);
}

export function computeFitScale(pageWidthAtScale1: number, containerWidth: number): number {
  if (containerWidth <= 0 || pageWidthAtScale1 <= 0) return 1;
  return containerWidth / pageWidthAtScale1;
}

export function resolveOutputScale(
  cssWidth: number,
  cssHeight: number,
  maxDpr = DEFAULT_MAX_DPR,
): number {
  let dpr = getClampedDevicePixelRatio(maxDpr);
  while (dpr > 1 && cssWidth * cssHeight * dpr * dpr > MAX_CANVAS_AREA) {
    dpr = Math.max(1, dpr - 0.5);
  }
  return dpr;
}

/**
 * Renderiza una página PDF en canvas con devicePixelRatio real (texto nítido en retina).
 * `scale` = escala lógica PDF (fit-width × zoom del usuario).
 */
export async function renderPdfPageHiDpi(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const viewport = page.getViewport({ scale });
  const cssW = Math.floor(viewport.width);
  const cssH = Math.floor(viewport.height);
  const outputScale = resolveOutputScale(cssW, cssH);

  canvas.width = Math.floor(cssW * outputScale);
  canvas.height = Math.floor(cssH * outputScale);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  await page.render({
    canvas,
    canvasContext: ctx,
    viewport,
    transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
  }).promise;
}
