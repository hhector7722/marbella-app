import { getDocument } from 'pdfjs-dist';

/**
 * Convierte la primera página de un PDF (Blob) a imagen PNG para copiar al portapapeles.
 */
export async function pdfFirstPageToPngBlob(pdfBlob: Blob): Promise<Blob> {
  const buffer = await pdfBlob.arrayBuffer();
  const pdfDoc = await getDocument({ data: new Uint8Array(buffer) }).promise;
  const page = await pdfDoc.getPage(1);
  const scale = 2;
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvas,
    viewport,
  }).promise;

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      0.95
    );
  });
}
