export const STAFF_CLOCK_MEDIA_BUCKET = 'staff-clock-media';
export const STAFF_CLOCK_MEDIA_LIMIT = 8;

export type StaffClockMediaKind = 'image' | 'audio' | 'video';
export type StaffClockAttachment = {
  kind: StaffClockMediaKind;
  path: string;
  name: string;
  contentType: string;
  size: number;
  url?: string;
};

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/webm': 'webm',
  'audio/ogg': 'ogg',
  'audio/aac': 'aac',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
};

export function staffClockMediaKind(contentType: string): StaffClockMediaKind | null {
  if (!Object.hasOwn(extensions, contentType)) return null;
  if (contentType.startsWith('image/')) return 'image';
  if (contentType.startsWith('audio/')) return 'audio';
  return 'video';
}

export function staffClockMediaExtension(contentType: string): string | null {
  return extensions[contentType] ?? null;
}

export function staffClockMediaMaxBytes(kind: StaffClockMediaKind): number {
  return kind === 'image' ? 12 * 1024 * 1024
    : kind === 'audio' ? 20 * 1024 * 1024 : 50 * 1024 * 1024;
}

export function validateClockMediaFile(file: Pick<File, 'type' | 'size'>): string | null {
  const kind = staffClockMediaKind(file.type);
  if (!kind) return 'Formato no admitido. Usa imágenes, audio MP3/M4A/WAV o vídeo MP4/MOV/WebM.';
  if (file.size === 0 || file.size > staffClockMediaMaxBytes(kind)) {
    return 'Archivo vacío o demasiado grande (imagen 12 MB, audio 20 MB, vídeo 50 MB).';
  }
  return null;
}

export function validateClockMediaAttachments(
  value: unknown,
  senderId: string,
): value is StaffClockAttachment[] {
  if (!Array.isArray(value) || value.length > STAFF_CLOCK_MEDIA_LIMIT) return false;
  const paths = new Set<string>();
  return value.every((item) => {
    if (!item || typeof item !== 'object') return false;
    const a = item as Record<string, unknown>;
    if (typeof a.contentType !== 'string' || typeof a.kind !== 'string') return false;
    const kind = staffClockMediaKind(a.contentType);
    if (!kind || a.kind !== kind) return false;
    if (typeof a.path !== 'string' || typeof a.name !== 'string' || 
        !Number.isInteger(a.size) || (a.size as number) <= 0 ||
        (a.size as number) > staffClockMediaMaxBytes(kind)) return false;
    const extension = staffClockMediaExtension(a.contentType);
    const prefix = senderId + '/';
    const fileName = a.path.startsWith(prefix) ? a.path.slice(prefix.length) : '';
    if (!extension || !/^[0-9a-f-]{36}\.[a-z0-9]+$/i.test(fileName) ||
        !fileName.endsWith('.' + extension) ||
        a.name.length > 180 || !a.name.trim() || paths.has(a.path)) return false;
    paths.add(a.path);
    return true;
  });
}
