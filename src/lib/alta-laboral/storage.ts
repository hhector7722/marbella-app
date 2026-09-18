export const ALTA_IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp']);
export const ALTA_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ALTA_BUCKET = 'employee-documents';

export function imageExtension(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return ALTA_IMAGE_EXTS.has(ext) ? ext : null;
}

export function intakeImagePath(intakeId: string, side: 'delantera' | 'trasera', ext: string): string {
  return `intakes/${intakeId}/${side}.${ext}`;
}

export function profileDniPath(userId: string, side: 'delantera' | 'trasera', ext: string): string {
  return `${userId}/dni/${side}.${ext}`;
}

export function validateAltaImage(file: File | null, label: string): { ok: true } | { ok: false; error: string } {
  if (!file || typeof file.size !== 'number' || file.size === 0) {
    return { ok: false, error: `Falta la imagen ${label}` };
  }
  if (file.size > ALTA_IMAGE_MAX_BYTES) {
    return { ok: false, error: `La imagen ${label} no puede superar 5 MB` };
  }
  if (!imageExtension(file.name)) {
    return { ok: false, error: `Formato no permitido en ${label}` };
  }
  return { ok: true };
}
