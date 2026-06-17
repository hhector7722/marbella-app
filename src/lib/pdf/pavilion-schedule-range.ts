import type { PDFPageProxy } from 'pdfjs-dist';

const TIME_SLOT_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;

type TextItem = { str: string; transform: number[] };

type TimeSlot = {
  str: string;
  start: string;
  x: number;
  pdfY: number;
};

function extractTextItems(page: PDFPageProxy): Promise<TextItem[]> {
  return page.getTextContent().then((textContent) => {
    const rawItems = textContent?.items;
    if (!Array.isArray(rawItems)) return [];

    const items: TextItem[] = [];
    for (let i = 0; i < rawItems.length; i++) {
      const item = rawItems[i] as Record<string, unknown>;
      if (item && typeof item.str === 'string' && Array.isArray(item.transform)) {
        items.push({ str: item.str, transform: item.transform as number[] });
      }
    }
    return items;
  });
}

function parseTimeSlots(items: TextItem[]): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (const item of items) {
    const match = item.str.match(TIME_SLOT_RE);
    if (!match) continue;
    const hh = match[1]!.padStart(2, '0');
    const mm = match[2]!.padStart(2, '0');
    slots.push({
      str: item.str,
      start: `${hh}:${mm}`,
      x: item.transform[4] ?? 0,
      pdfY: item.transform[5] ?? 0,
    });
  }
  return slots;
}

function medianRowHeightCss(slots: TimeSlot[], pageHeightPt: number, pxPerPt: number): number {
  const pdfYToCssTop = (pdfY: number) => (pageHeightPt - pdfY) * pxPerPt;
  const cssTops = [...slots]
    .sort((a, b) => b.pdfY - a.pdfY)
    .map((s) => pdfYToCssTop(s.pdfY));

  const deltas: number[] = [];
  for (let i = 1; i < cssTops.length; i++) {
    const d = cssTops[i]! - cssTops[i - 1]!;
    if (d > 2 && d < pageHeightPt * pxPerPt * 0.08) deltas.push(d);
  }

  if (deltas.length === 0) return pageHeightPt * pxPerPt * 0.022;

  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)]!;
}

/**
 * Borde inferior (px CSS desde arriba) de la fila 23:30, para encuadrar el horario completo.
 */
export async function detectScheduleBottomCssY(page: PDFPageProxy, cssH: number): Promise<number> {
  const pageWidthPt = page.getViewport({ scale: 1 }).width;
  const pageHeightPt = page.getViewport({ scale: 1 }).height;
  const pxPerPt = cssH / pageHeightPt;
  const pdfYToCssTop = (pdfY: number) => (pageHeightPt - pdfY) * pxPerPt;

  try {
    const items = await extractTextItems(page);
    const slots = parseTimeSlots(items);
    if (slots.length === 0) return cssH * 0.97;

    const leftSlots = slots.filter((s) => s.x < pageWidthPt * 0.2);
    const pool = leftSlots.length >= 3 ? leftSlots : slots;

    const slot2330 = pool.find((s) => s.start === '23:30');
    if (!slot2330) return cssH * 0.97;

    const rowH = medianRowHeightCss(pool, pageHeightPt, pxPerPt);
    const rowTop = pdfYToCssTop(slot2330.pdfY);
    return Math.min(cssH, rowTop + rowH * 1.06);
  } catch {
    return cssH * 0.97;
  }
}

export function computeInitialScaleForScheduleRange(options: {
  containerWidth: number;
  containerHeight: number;
  cssW: number;
  cssH: number;
  pageWidthPt: number;
  cropLeftPt: number;
  cropRightPt: number;
  contentTopCss: number;
  contentBottomCss: number;
}): number {
  const {
    containerWidth,
    containerHeight,
    cssW,
    cssH,
    pageWidthPt,
    cropLeftPt,
    cropRightPt,
    contentTopCss,
    contentBottomCss,
  } = options;

  const cropWidthCss = cssW * ((cropRightPt - cropLeftPt) / pageWidthPt);
  const contentHeight = Math.max(1, contentBottomCss - contentTopCss);

  const scaleByWidth = containerWidth / cropWidthCss;
  const scaleByHeight = (containerHeight / contentHeight) * 0.99;

  return Math.min(scaleByWidth, scaleByHeight);
}
