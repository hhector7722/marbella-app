import type { PDFPageProxy } from 'pdfjs-dist';

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

/** Fallback: fracción del ancho de página hasta ~P4 en hojas CEM estándar. */
const FALLBACK_CROP_RATIO = 0.44;

function isTextItem(item: unknown): item is PdfTextItem {
  if (typeof item !== 'object' || item === null) return false;
  const t = item as Record<string, unknown>;
  return (
    typeof t.str === 'string' &&
    Array.isArray(t.transform) &&
    typeof t.width === 'number' &&
    typeof t.height === 'number'
  );
}

/**
 * Detecta el borde derecho (coord. PDF, escala 1) del recorte diario:
 * tabla de horas + columnas P1…P4 (incluida).
 * Usa la posición de PEIX como límite; si no existe, estima desde P4.
 */
export async function detectCropRightThroughP4(page: PDFPageProxy): Promise<number> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  const textContent = await page.getTextContent();
  const items = textContent.items.flatMap((item) => (isTextItem(item) ? [item] : []));

  const byLabel = (label: string) =>
    items.filter((i) => i.str.trim().toUpperCase() === label);

  const peixItems = byLabel('PEIX');
  if (peixItems.length > 0) {
    const peixX = Math.min(...peixItems.map((i) => i.transform[4]!));
    if (peixX > 0 && peixX < pageWidth) {
      return peixX;
    }
  }

  const p1 = byLabel('P1')[0];
  const p2 = byLabel('P2')[0];
  const p3 = byLabel('P3')[0];
  const p4 = byLabel('P4')[0];

  if (p4) {
    const xs = [p1, p2, p3, p4]
      .filter(Boolean)
      .map((p) => p!.transform[4]!)
      .sort((a, b) => a - b);

    let colWidth = 36;
    if (xs.length >= 2) {
      colWidth = (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1);
    }

    return Math.min(p4.transform[4]! + colWidth * 1.15, pageWidth);
  }

  return pageWidth * FALLBACK_CROP_RATIO;
}
