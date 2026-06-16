import type { PDFPageProxy } from 'pdfjs-dist';

/** Fracción del ancho de página hasta ~P4 en hojas CEM estándar (A3 landscape). */
export const PAVILION_CROP_RATIO = 0.42;

/** Columnas a la derecha de P4: el recorte termina en su borde izquierdo. */
const COLUMNS_AFTER_P4 = ['PEDX', 'PEIX', 'TATAMI', 'NOUS', 'ANTIC', 'MODU'] as const;

export type PavilionCropBounds = {
  /** Borde izquierdo del recorte (coords PDF, escala 1). */
  leftPt: number;
  /** Borde derecho del recorte (coords PDF, escala 1). */
  rightPt: number;
};

function normalizeLabel(str: string): string {
  return str.trim().toUpperCase().replace(/\s+/g, '');
}

function itemX(item: { transform: number[] }): number {
  return item.transform[4] ?? 0;
}

/**
 * Recorte horas + P1…P4. Prioriza el borde izquierdo de PEDX/PEIX; si falla el texto, ratio fijo.
 */
export async function detectCropBoundsThroughP4(page: PDFPageProxy): Promise<PavilionCropBounds> {
  const pageWidth = page.getViewport({ scale: 1 }).width;
  const fallbackRight = pageWidth * PAVILION_CROP_RATIO;

  try {
    const textContent = await page.getTextContent();
    const rawItems = textContent?.items;
    if (!Array.isArray(rawItems)) {
      return { leftPt: 0, rightPt: fallbackRight };
    }

    type Item = { str: string; transform: number[] };
    const items: Item[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as Record<string, unknown>;
      if (item && typeof item.str === 'string' && Array.isArray(item.transform)) {
        items.push({ str: item.str, transform: item.transform as number[] });
      }
    }

    const matchCol = (label: string) =>
      items.filter((it) => normalizeLabel(it.str) === label);

    for (const label of COLUMNS_AFTER_P4) {
      const hits = matchCol(label);
      if (hits.length > 0) {
        const x = Math.min(...hits.map(itemX));
        if (x > pageWidth * 0.15 && x < pageWidth * 0.85) {
          return { leftPt: 0, rightPt: x };
        }
      }
    }

    const p1 = matchCol('P1')[0];
    const p2 = matchCol('P2')[0];
    const p3 = matchCol('P3')[0];
    const p4 = matchCol('P4')[0];

    if (p4) {
      const xs = [p1, p2, p3, p4]
        .filter(Boolean)
        .map((p) => itemX(p!))
        .sort((a, b) => a - b);

      let colWidth = 40;
      if (xs.length >= 2) {
        colWidth = (xs[xs.length - 1]! - xs[0]!) / (xs.length - 1);
      }
      const right = Math.min(itemX(p4) + colWidth * 1.12, pageWidth * 0.55);
      return { leftPt: 0, rightPt: Math.max(right, pageWidth * 0.28) };
    }
  } catch {
    // getTextContent puede fallar en algunos PDF/workers móviles
  }

  return { leftPt: 0, rightPt: fallbackRight };
}

/** @deprecated Usar detectCropBoundsThroughP4 */
export async function detectCropRightThroughP4(page: PDFPageProxy): Promise<number> {
  const bounds = await detectCropBoundsThroughP4(page);
  return bounds.rightPt;
}
