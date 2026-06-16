import type { PDFPageProxy } from 'pdfjs-dist';

/** Tope de DPR para equilibrar nitidez retina y memoria en móvil. */
const DEFAULT_MAX_DPR = 3;
/** Límite conservador de píxeles de canvas (Safari iOS). */
const MAX_CANVAS_AREA = 14_000_000;

export function getClampedDevicePixelRatio(max = DEFAULT_MAX_DPR): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), max);
}

export function computeFitScale(contentWidthAtScale1: number, containerWidth: number): number {
  if (containerWidth <= 0 || contentWidthAtScale1 <= 0) return 1;
  return containerWidth / contentWidthAtScale1;
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

async function renderFullPageHiDpi(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<number> {
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

  return outputScale;
}

/**
 * Renderiza una página PDF en canvas HiDPI, recortada a [0, cropRightPt) en coords PDF (escala 1).
 * `scale` = escala lógica sobre el ancho del recorte (fit-width × zoom).
 */
export async function renderPdfPageHiDpiCrop(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
  cropRightPt: number,
): Promise<void> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  const cropRight = Math.max(1, Math.min(cropRightPt, pageWidth));

  const offscreen = document.createElement('canvas');
  const outputScale = await renderFullPageHiDpi(page, offscreen, scale);

  const cssCropW = Math.floor(cropRight * scale);
  const cssFullW = parseFloat(offscreen.style.width) || offscreen.width / outputScale;
  const cssH = parseFloat(offscreen.style.height) || offscreen.height / outputScale;

  const srcCropW = Math.min(
    Math.floor((cssCropW / cssFullW) * offscreen.width),
    offscreen.width,
  );

  const outW = Math.floor(cssCropW * outputScale);
  const outH = Math.floor(cssH * outputScale);

  canvas.width = outW;
  canvas.height = outH;
  canvas.style.width = `${cssCropW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, outW, outH);
  ctx.drawImage(offscreen, 0, 0, srcCropW, offscreen.height, 0, 0, outW, outH);
}

/** Renderizado completo (sin recorte) — compatibilidad. */
export async function renderPdfPageHiDpi(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number,
): Promise<void> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  await renderPdfPageHiDpiCrop(page, canvas, scale, pageWidth);
}
