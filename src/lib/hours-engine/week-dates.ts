import type { CivilDate } from './types.ts';

/** Construye Date local civil sin parse UTC de 'YYYY-MM-DD'. */
export function civilDateToParts(ymd: CivilDate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) {
    throw new Error(`Fecha civil inválida: ${ymd}`);
  }
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function partsToCivilDate(y: number, m: number, d: number): CivilDate {
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

/** Comparación lexicográfica válida para YYYY-MM-DD. */
export function compareCivilDate(a: CivilDate, b: CivilDate): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

export function isCivilDateInRange(
  day: CivilDate,
  from: CivilDate,
  to: CivilDate | null,
): boolean {
  if (compareCivilDate(day, from) < 0) return false;
  if (to !== null && compareCivilDate(day, to) > 0) return false;
  return true;
}

/** Añade días a una fecha civil (calendario gregoriano local matemático). */
export function addCivilDays(ymd: CivilDate, delta: number): CivilDate {
  const { y, m, d } = civilDateToParts(ymd);
  const dt = new Date(y, m - 1, d + delta);
  return partsToCivilDate(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

/**
 * Exige lunes. weekEnd = domingo.
 * No usa new Date('YYYY-MM-DD') nativo.
 */
export function assertMonday(weekStart: CivilDate): void {
  const { y, m, d } = civilDateToParts(weekStart);
  const dt = new Date(y, m - 1, d);
  // getDay(): 0=dom … 1=lun
  if (dt.getDay() !== 1) {
    throw new Error(`weekStart debe ser lunes: ${weekStart}`);
  }
}

export function weekBounds(weekStart: CivilDate): {
  weekStart: CivilDate;
  weekEnd: CivilDate;
  days: CivilDate[];
} {
  assertMonday(weekStart);
  const days: CivilDate[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addCivilDays(weekStart, i));
  }
  return { weekStart, weekEnd: days[6]!, days };
}

export function isAugustCivilDate(ymd: CivilDate): boolean {
  return civilDateToParts(ymd).m === 8;
}
