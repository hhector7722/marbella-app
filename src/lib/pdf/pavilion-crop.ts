import type { PDFPageProxy } from 'pdfjs-dist';

/** Fracción del ancho de página hasta ~P4 en hojas CEM estándar (A3 landscape). */
export const PAVILION_CROP_RATIO = 0.44;

/**
 * Borde derecho del recorte (coords PDF, escala 1): horas + P1…P4.
 * Si la detección por texto falla (p. ej. iOS), usa ratio fijo.
 */
export async function detectCropRightThroughP4(page: PDFPageProxy): Promise<number> {
  const pageWidth = page.getViewport({ scale: 1 }).width;

  try {
    const textContent = await page.getTextContent();
    const rawItems = textContent?.items;
    if (!Array.isArray(rawItems)) {
      return pageWidth * PAVILION_CROP_RATIO;
    }

    type Item = { str: string; transform: number[] };
    const items: Item[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as Record<string, unknown>;
      if (
        item &&
        typeof item.str === 'string' &&
        Array.isArray(item.transform)
      ) {
        items.push({ str: item.str, transform: item.transform as number[] });
      }
    }

    const matchCol = (label: string) =>
      items.filter((it) => it.str.trim().toUpperCase().replace(/\s+/g, '') === label);

    const peixItems = matchCol('PEIX');
    if (peixItems.length > 0) {
      const peixX = Math.min(...peixItems.map((it) => it.transform[4] ?? 0));
      if (peixX > 0 && peixX < pageWidth) return peixX;
    }

    const p1 = matchCol('P1')[0];
    const p2 = matchCol('P2')[0];
    const p3 = matchCol('P3')[0];
    const p4 = matchCol('P4')[0];

    if (p4) {
      const xs = [p1, p2, p3, p4]
        .filter(Boolean)
        .map((p) => p!.transform[4] ?? 0)
        .sort((a, b) => a - b);

      let colWidth = 36;
      if (xs.length >= 2) {
        colWidth = (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1);
      }
      return Math.min((p4.transform[4] ?? 0) + colWidth * 1.15, pageWidth);
    }
  } catch {
    // getTextContent puede fallar en algunos PDF/workers móviles
  }

  return pageWidth * PAVILION_CROP_RATIO;
}
