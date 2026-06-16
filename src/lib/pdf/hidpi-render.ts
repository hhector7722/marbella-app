import type { PDFPageProxy } from 'pdfjs-dist';

const DEFAULT_MAX_DPR = 3;
const MAX_CANVAS_AREA = 14_000_000;

export function getClampedDevicePixelRatio(max = DEFAULT_MAX_DPR): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(Math.max(window.devicePixelRatio || 1, 1), max);
}

export function computeFitScale(contentWidthAtScale1: number, containerWidth: number): number {
  if (containerWidth <= 0 || contentWidthAtScale1 <= 0) return 1;
  return containerWidth / contentWidthAtScale1;
}

function resolveOutputScale(cssWidth: number, cssHeight: number, maxDpr = DEFAULT_MAX_DPR): number {
  let dpr = getClampedDevicePixelRatio(maxDpr);
  while (dpr > 1 && cssWidth * cssHeight * dpr * dpr > MAX_CANVAS_AREA) {
    dpr = Math.max(1, dpr - 0.5);
  }
  return dpr;
}

function clearHost(host: HTMLElement): void {
  if (typeof host.replaceChildren === 'function') {
    host.replaceChildren();
    return;
  }
  host.innerHTML = '';
}

/** Renderiza página completa en canvas (patrón retina PDF.js, compatible iOS). */
async function renderFullPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number,
): Promise<{ outputScale: number; cssW: number; cssH: number }> {
  const outputScale = resolveOutputScale(
    page.getViewport({ scale: cssScale }).width,
    page.getViewport({ scale: cssScale }).height,
  );

  const renderScale = cssScale * outputScale;
  const viewport = page.getViewport({ scale: renderScale });
  const cssW = Math.floor(viewport.width / outputScale);
  const cssH = Math.floor(viewport.height / outputScale);

  canvas.width = viewport.width;
  canvas.height = viewport.height;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  await page.render({ canvas, viewport }).promise;

  return { outputScale, cssW, cssH };
}

/**
 * Render HiDPI recortado a [0, cropRightPt) en coords PDF (escala 1).
 * `cssScale` = fit-width × zoom del usuario.
 */
export async function renderPdfPageHiDpiCrop(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number,
  cropRightPt: number,
): Promise<void> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  const cropRight = Math.max(1, Math.min(cropRightPt, pageWidth));
  const cropRatio = cropRight / pageWidth;

  const offscreen = document.createElement('canvas');
  const { outputScale, cssW: fullCssW, cssH: fullCssH } = await renderFullPageToCanvas(
    page,
    offscreen,
    cssScale,
  );

  const cssCropW = Math.max(1, Math.floor(fullCssW * cropRatio));
  const srcCropW = Math.max(1, Math.floor(offscreen.width * cropRatio));
  const outW = Math.max(1, Math.floor(cssCropW * outputScale));
  const outH = Math.max(1, Math.floor(fullCssH * outputScale));

  canvas.width = outW;
  canvas.height = outH;
  canvas.style.width = `${cssCropW}px`;
  canvas.style.height = `${fullCssH}px`;

  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('No se pudo crear el contexto 2D');

  ctx.drawImage(offscreen, 0, 0, srcCropW, offscreen.height, 0, 0, outW, outH);
}

export async function renderPdfPageHiDpi(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  cssScale: number,
): Promise<void> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  await renderPdfPageHiDpiCrop(page, canvas, cssScale, pageWidth);
}

export { clearHost };
