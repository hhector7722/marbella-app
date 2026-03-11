/**
 * Genera un Blob de imagen recortada (circular para avatar) a partir de la imagen
 * y el área en píxeles devuelta por react-easy-crop.
 */
export type CropAreaPixels = { x: number; y: number; width: number; height: number };

function createImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (e) => reject(e));
    image.src = url;
  });
}

/**
 * Recorta la imagen al área dada y devuelve un Blob circular (PNG con transparencia fuera del círculo).
 */
export async function getCroppedImg(
  imageSrc: string,
  pixelCrop: CropAreaPixels,
  circular: boolean = true
): Promise<Blob> {
  const image = await createImage(imageSrc);
  const size = Math.min(pixelCrop.width, pixelCrop.height);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2d not available');

  if (circular) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();
  }

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    size,
    size
  );

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/png',
      0.95
    );
  });
}
