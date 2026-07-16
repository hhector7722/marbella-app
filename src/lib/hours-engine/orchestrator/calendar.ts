import { formatYmdInMadrid } from '../../madrid-date-bounds.ts';
import type { CivilDate } from '../types.ts';
import { addCivilDays, civilDateToParts } from '../week-dates.ts';

/** Lunes de la semana civil que contiene `day` (Europe/Madrid ya materializado como YMD). */
export function mondayOnOrBefore(day: CivilDate): CivilDate {
  const { y, m, d } = civilDateToParts(day);
  const dt = new Date(y, m - 1, d);
  const dow = dt.getDay(); // 0=dom … 1=lun
  const delta = dow === 0 ? -6 : 1 - dow;
  return addCivilDays(day, delta);
}

export function mondayOfClockInIso(clockInIso: string): CivilDate {
  const day = formatYmdInMadrid(clockInIso);
  if (!day) {
    throw new Error(`No se pudo obtener día Madrid de ${clockInIso}`);
  }
  return mondayOnOrBefore(day);
}

export function minMonday(days: readonly CivilDate[]): CivilDate {
  if (days.length === 0) {
    throw new Error('minMonday: lista vacía');
  }
  let min = mondayOnOrBefore(days[0]!);
  for (let i = 1; i < days.length; i++) {
    const m = mondayOnOrBefore(days[i]!);
    if (m < min) min = m;
  }
  return min;
}

export function nextWeekStart(weekStart: CivilDate): CivilDate {
  return addCivilDays(weekStart, 7);
}

export function previousWeekStart(weekStart: CivilDate): CivilDate {
  return addCivilDays(weekStart, -7);
}
