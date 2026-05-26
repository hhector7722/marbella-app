/**
 * Utilidades para el manejo de fechas y zonas horarias en Bar Marbella.
 * Contrato: datos en tránsito/BD en UTC (ISO-8601 con Z). Presentación en Europe/Madrid.
 */

import { formatInTimeZone } from 'date-fns-tz';

const MADRID_TZ = 'Europe/Madrid';

/**
 * Parsea una fecha proveniente de la base de datos (Supabase timestamptz).
 * Como el valor en DB es el correcto UTC (ej: 01:00Z para las 03:00 en Madrid),
 * el navegador lo convierte automáticamente al usar new Date().
 */
export function parseDBDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * Fecha/hora local tipo TPV o export SQL español: `12/05/2026 11:30` o `12/05/2026 11:30:00`.
 * Construye con `new Date(y, m-1, d, …)` (regla anti-shift del proyecto).
 */
export function parseEuropeanDateTimeLocal(s: string | null | undefined): Date | null {
  if (!s) return null;
  const t = s.trim();
  const m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const hour = m[4] != null ? Number(m[4]) : 0;
  const minute = m[5] != null ? Number(m[5]) : 0;
  const second = m[6] != null ? Number(m[6]) : 0;
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, hour, minute, second);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parsea una fecha proveniente del TPV (Jsonb radiografia_completa).
 * El TPV manda la hora local (Madrid) pero con una 'Z' (UTC) erronea.
 * Ejemplo: '2026-04-07T03:09:28.000Z' (cuando en Madrid son las 03:09 AM).
 * Forzamos el parseo como hora LOCAL extrayendo los componentes manualmente.
 */
export function parseTPVDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  
  if (typeof dateStr === 'string' && /(\d{4})-(\d{2})-(\d{2})[T ]\d{2}:\d{2}/.test(dateStr)) {
    try {
      // Formato: 2026-04-07T15:55:54.000Z o SQL 2026-04-07 15:55:54.000
      // Extraemos solo los números ignorando TZ y milisegundos (hora local TPV, Z errónea)
      let matches = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/);
      if (!matches) {
        matches = dateStr.match(/(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?![0-9])/);
        if (matches) {
          const [, y, m, d, h, min] = matches.map(Number);
          const fechaLocal = new Date(y, m - 1, d, h, min, 0);
          if (!isNaN(fechaLocal.getTime())) return fechaLocal;
        }
      } else {
        const [, y, m, d, h, min, s] = matches.map(Number);
        const fechaLocal = new Date(y, m - 1, d, h, min, s);
        if (!isNaN(fechaLocal.getTime())) return fechaLocal;
      }
    } catch (e) {
      console.error("Error al parsear fecha TPV nuclear:", e);
    }
  }
  
  const eu = parseEuropeanDateTimeLocal(dateStr);
  if (eu) return eu;

  return parseDBDate(dateStr);
}

/**
 * Timestamps en `estado_sala.radiografia_completa` (ver `context/index.txt`):
 * - El bridge Node usa `new Date(row.Hora).toISOString()` → **ISO UTC con Z real** (hay que usar `new Date(iso)`).
 * - Otros emisores pueden mandar “hora local con Z mentirosa” → `parseTPVDate` (componentes literales).
 */
export function parseRadiografiaTimestamp(raw: string | number | null | undefined): Date | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    const ms = raw > 0 && raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = raw.trim();
  if (!s || s.toLowerCase() === 'invalid date') return null;
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // ISO 8601 con Z u offset (incl. ms) — contrato del extractor `index.txt`
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:?\d{2})$/i.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = parseTPVDate(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Convierte un instante UTC (Date o ISO) a cadena en Europe/Madrid.
 */
export function formatUtcInstantInMadrid(
  date: Date | string | null | undefined,
  pattern = 'HH:mm'
): string {
  if (!date) return '---';
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else {
    d = parseRadiografiaTimestamp(date) ?? parseDBDate(date);
    if (Number.isNaN(d.getTime())) {
      d = parseTPVDate(date);
    }
  }
  if (Number.isNaN(d.getTime())) return '---';
  return formatInTimeZone(d, MADRID_TZ, pattern);
}

/**
 * Formatea una fecha para mostrarla como HH:mm en Europe/Madrid.
 */
export function formatLocalTime(date: Date | string | null | undefined): string {
  if (!date) return '--:--';
  const formatted = formatUtcInstantInMadrid(date, 'HH:mm');
  return formatted === '---' ? '--:--' : formatted;
}

/** Hora de ticket (hora_cierre o fecha) en Madrid — sustituye split manual de ISO. */
export function formatTicketTimeMadrid(
  horaCierre?: string | null,
  fechaFallback?: string | null
): string {
  const raw = horaCierre ?? fechaFallback;
  if (!raw) return '---';
  return formatUtcInstantInMadrid(raw, 'HH:mm');
}

/**
 * Hora local HH:mm para cabecera KDS: sin cero a la izquierda en la hora (8:28, no 08:28).
 * Medianoche 00:xx se deja con dos cifras en hora para no confundir con 0:xx.
 */
export function formatLocalTimeKdsHeader(date: Date | string | null | undefined): string {
  const base = formatLocalTime(date);
  if (base === '--:--') return base;
  return base.replace(/^0([1-9]:\d{2})$/, '$1');
}

/**
 * Obtiene el inicio del día local en Madrid (00:00:00)
 */
export function getStartOfLocalToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

function madridDatePartsFromInstant(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: MADRID_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = Number(parts.find((p) => p.type === 'year')?.value);
  const m = Number(parts.find((p) => p.type === 'month')?.value);
  const day = Number(parts.find((p) => p.type === 'day')?.value);
  return { y, m, day };
}

/**
 * Inicio del día operativo en Marbella: **00:00 Europe/Madrid** convertido a un `Date` JS correcto.
 *
 * Importante: NO usar `new Date('YYYY-MM-DD')` (regla anti-shift) y NO asumir la TZ del navegador
 * para el “día en curso” del KDS (kioscos mal configurados en UTC colaban comandas de ayer).
 */
export function getStartOfEuropeMadridToday(now: Date = new Date()): Date {
  const { y, m, day } = madridDatePartsFromInstant(now);

  // Ancla: mismo calendario "numérico" a mediodía UTC (evita ambigüedades cerca de medianoche).
  const pMid = madridDatePartsFromInstant(new Date(Date.UTC(y, m - 1, day, 12, 0, 0, 0)));

  // Diferencia de días entre el calendario numérico UTC y el calendario Madrid en ese instante.
  const utcNoon = Date.UTC(y, m - 1, day, 12, 0, 0, 0);
  const madNoon = Date.UTC(pMid.y, pMid.m - 1, pMid.day, 12, 0, 0, 0);
  const dayDeltaMs = madNoon - utcNoon;

  // Medianoche Madrid (00:00) expresada como instante UTC: restamos 12h desde el "mediodía Madrid"
  // alineado con el día objetivo (y-m-day).
  return new Date(Date.UTC(y, m - 1, day, 12, 0, 0, 0) - dayDeltaMs - 12 * 60 * 60 * 1000);
}

/** Próxima medianoche Europe/Madrid (00:00) después de `now`. */
export function getNextEuropeMadridMidnight(now: Date = new Date()): Date {
  const startToday = getStartOfEuropeMadridToday(now);
  return new Date(startToday.getTime() + 24 * 60 * 60 * 1000);
}
