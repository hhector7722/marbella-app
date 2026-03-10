import { getDocument } from 'pdfjs-dist';

/**
 * Convierte todas las páginas de un PDF (Blob) en una sola imagen PNG para copiar al portapapeles.
 */
export async function pdfFirstPageToPngBlob(pdfBlob: Blob): Promise<Blob> {
  const buffer = await pdfBlob.arrayBuffer();
  const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const numPages = pdfDoc.numPages;
  const scale = 2;

  type PageViewport = Awaited<ReturnType<Awaited<ReturnType<typeof pdfDoc.getPage>>['getViewport']>>;
  const pageViewports: { page: Awaited<ReturnType<typeof pdfDoc.getPage>>; viewport: PageViewport }[] = [];
  let totalHeight = 0;
  let pageWidth = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale });
    pageViewports.push({ page, viewport });
    totalHeight += viewport.height;
    if (viewport.width > pageWidth) pageWidth = viewport.width;
  }

  const canvas = document.createElement('canvas');
  canvas.width = pageWidth;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No canvas context');

  let yOffset = 0;
  for (const { page, viewport } of pageViewports) {
    const pageCanvas = document.createElement('canvas');
    pageCanvas.width = viewport.width;
    pageCanvas.height = viewport.height;
    await page.render({ canvas: pageCanvas, viewport }).promise;
    ctx.drawImage(pageCanvas, 0, yOffset, viewport.width, viewport.height);
    yOffset += viewport.height;
  }

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      0.95
    );
  });
}
