/** Extrae yyyy-MM-dd de asunto, nombre de archivo o fecha de recepción (Madrid). */

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const DMY_SLASH = /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
const DMY_DASH = /(\d{1,2})-(\d{1,2})-(\d{4})/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function toIsoDate(y: number, m: number, d: number): string | null {
  if (!isValidYmd(y, m, d)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseActivityDateFromText(text: string): string | null {
  const t = text.trim();
  if (!t) return null;

  const iso = ISO_DATE.exec(t);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    return toIsoDate(y, m, d);
  }

  for (const re of [DMY_SLASH, DMY_DASH]) {
    const m = re.exec(t);
    if (m) {
      const d = Number(m[1]);
      const mo = Number(m[2]);
      const y = Number(m[3]);
      return toIsoDate(y, mo, d);
    }
  }

  return null;
}

/** Fecha local Madrid desde epoch ms (Gmail internalDate). */
export function madridIsoDateFromEpochMs(epochMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(epochMs));

  const y = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const m = parts.find((p) => p.type === 'month')?.value ?? '01';
  const d = parts.find((p) => p.type === 'day')?.value ?? '01';
  return `${y}-${m}-${d}`;
}

export function resolveActivityDate(params: {
  subject?: string | null;
  filename?: string | null;
  receivedAtMs?: number | null;
}): string | null {
  const fromSubject = parseActivityDateFromText(params.subject ?? '');
  if (fromSubject) return fromSubject;

  const fromFilename = parseActivityDateFromText(params.filename ?? '');
  if (fromFilename) return fromFilename;

  if (params.receivedAtMs != null && Number.isFinite(params.receivedAtMs)) {
    return madridIsoDateFromEpochMs(params.receivedAtMs);
  }

  return null;
}
