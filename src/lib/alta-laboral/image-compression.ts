import { ALTA_IMAGE_EXTS } from './storage.ts';

const TARGET_BYTES = 1.5 * 1024 * 1024;
const MAX_EDGE = 2400;
const MIN_EDGE = 1200;
const SHRINK = 0.75;
const QUALITIES = [0.85, 0.75, 0.65, 0.55] as const;
const FALLBACK_NAME = 'documento';

function hasAllowedExtension(name: string): boolean {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return ALTA_IMAGE_EXTS.has(ext);
}

export function jpegFileName(original: string): string {
  const base = original.replace(/\.[^./\\]+$/, '').trim() || FALLBACK_NAME;
  return `${base}.jpg`;
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('No se ha podido leer la imagen'));
    image.src = url;
  });
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(
      () => null,
    );
    if (bitmap) {
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        release: () => bitmap.close(),
      };
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      release: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function toJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se ha podido preparar la imagen'))),
      'image/jpeg',
      quality,
    );
  });
}

function toFile(blob: Blob, original: File): File {
  return new File([blob], jpegFileName(original.name), {
    type: 'image/jpeg',
    lastModified: original.lastModified,
  });
}

export async function prepareIntakeImage(file: File): Promise<File> {
  if (file.size <= TARGET_BYTES && hasAllowedExtension(file.name)) return file;

  const decoded = await decodeImage(file);
  try {
    const longest = Math.max(decoded.width, decoded.height);
    let edge = Math.min(MAX_EDGE, Math.max(MIN_EDGE, longest));
    let smallest: Blob | null = null;

    while (edge >= MIN_EDGE) {
      const scale = longest > 0 ? Math.min(1, edge / longest) : 1;
      const width = Math.max(1, Math.round(decoded.width * scale));
      const height = Math.max(1, Math.round(decoded.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se ha podido preparar la imagen');
      context.drawImage(decoded.source, 0, 0, width, height);

      for (const quality of QUALITIES) {
        const blob = await toJpegBlob(canvas, quality);
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= TARGET_BYTES) return toFile(blob, file);
      }

      edge = Math.round(edge * SHRINK);
    }

    if (smallest) return toFile(smallest, file);
    throw new Error('No se ha podido preparar la imagen');
  } finally {
    decoded.release();
  }
}
