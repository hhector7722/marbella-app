/**
 * Utilidades para el manejo de fechas y zonas horarias en Bar Marbella.
 */

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
 * Parsea una fecha proveniente del TPV (Jsonb radiografia_completa).
 * El TPV manda la hora local (Madrid) pero con una 'Z' (UTC) erronea.
 * Ejemplo: '2026-04-07T03:09:28.000Z' (cuando en Madrid son las 03:09 AM).
 * Forzamos el parseo como hora LOCAL extrayendo los componentes manualmente.
 */
export function parseTPVDate(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date();
  
  if (typeof dateStr === 'string' && dateStr.includes('T')) {
    try {
      // Formato: 2026-04-07T15:55:54.000Z
      // Extraemos solo los números ignorando TZ y milisegundos
      const matches = dateStr.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      
      if (matches) {
        const [, y, m, d, h, min, s] = matches.map(Number);
        // Creamos la fecha local con esos valores numéricos exactos
        const fechaLocal = new Date(y, m - 1, d, h, min, s);
        if (!isNaN(fechaLocal.getTime())) return fechaLocal;
      }
    } catch (e) {
      console.error("Error al parsear fecha TPV nuclear:", e);
    }
  }
  
  return parseDBDate(dateStr);
}

/**
 * Formatea una fecha para mostrarla como HH:mm (local).
 */
export function formatLocalTime(date: Date | string | null | undefined): string {
  if (!date) return '--:--';
  const d = (date instanceof Date) ? date : parseTPVDate(date);
  
  return d.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: false
  });
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

const MADRID_TZ = 'Europe/Madrid';

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
