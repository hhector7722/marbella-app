/**
 * Atribución diaria de ordinarias / extras.
 * No inventa un segundo motor: reparte el mismo overtime que Regime Policy
 * con la regla running (exceso el día en que se supera el cupo ordinario).
 */

import type {
  CivilDate,
  ContractRegime,
  DailyBreakdown,
  DailyBreakdownDay,
  SegmentRegime,
} from './types.ts';
import { isAugustCivilDate, weekBounds } from './week-dates.ts';

export type DailyBreakdownSegmentInput = {
  days: readonly CivilDate[];
  hoursByDay: Readonly<Record<CivilDate, number>>;
  contractedHours: number;
  termRegime: ContractRegime;
  kind: 'term' | 'pre_alta';
};

function resolveDayRegime(
  day: CivilDate,
  kind: 'term' | 'pre_alta',
  termRegime: ContractRegime,
): SegmentRegime {
  if (kind === 'pre_alta') return 'pre_alta';
  if (isAugustCivilDate(day)) return 'agosto';
  return termRegime;
}

function isAllOvertimeRegime(regime: SegmentRegime): boolean {
  return (
    regime === 'pre_alta' ||
    regime === 'agosto' ||
    regime === 'manager' ||
    regime === 'fixed'
  );
}

/**
 * Regla funcional inmutable (running):
 * acumulado semanal (dentro del bucket homogéneo) vs cupo ordinario;
 * el exceso pertenece al día donde se supera el límite.
 */
function attributeRunningStaff(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
  ordinaryCap: number,
  out: Map<CivilDate, DailyBreakdownDay>,
): void {
  let accumulated = 0;
  for (const day of days) {
    const hours = hoursByDay[day] ?? 0;
    let ordinaryHours = 0;
    let overtimeHours = 0;

    if (hours > 0) {
      if (accumulated >= ordinaryCap) {
        overtimeHours = hours;
      } else if (accumulated + hours > ordinaryCap) {
        overtimeHours = accumulated + hours - ordinaryCap;
        ordinaryHours = hours - overtimeHours;
      } else {
        ordinaryHours = hours;
      }
      accumulated += hours;
    }

    out.set(day, { day, hours, ordinaryHours, overtimeHours });
  }
}

function attributeAllOvertime(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
  out: Map<CivilDate, DailyBreakdownDay>,
): void {
  for (const day of days) {
    const hours = hoursByDay[day] ?? 0;
    out.set(day, {
      day,
      hours,
      ordinaryHours: 0,
      overtimeHours: hours,
    });
  }
}

/**
 * Construye el desglose diario de una semana a partir de los mismos
 * segmentos/asistencia que alimentan la liquidación.
 */
export function buildDailyBreakdown(
  weekStart: CivilDate,
  hoursByDay: Readonly<Record<CivilDate, number>>,
  segments: readonly DailyBreakdownSegmentInput[],
): DailyBreakdown {
  const { days: weekDays } = weekBounds(weekStart);
  const byDay = new Map<CivilDate, DailyBreakdownDay>();
  for (const day of weekDays) {
    byDay.set(day, {
      day,
      hours: hoursByDay[day] ?? 0,
      ordinaryHours: 0,
      overtimeHours: 0,
    });
  }

  for (const seg of segments) {
    if (seg.days.length === 0) continue;

    type Bucket = { regime: SegmentRegime; days: CivilDate[] };
    const buckets: Bucket[] = [];
    let current: Bucket | null = null;

    for (const day of seg.days) {
      const regime = resolveDayRegime(day, seg.kind, seg.termRegime);
      if (!current || current.regime !== regime) {
        current = { regime, days: [day] };
        buckets.push(current);
      } else {
        current.days.push(day);
      }
    }

    const segmentDayCount = seg.days.length;
    for (const bucket of buckets) {
      const bucketContracted =
        (bucket.days.length / segmentDayCount) * seg.contractedHours;

      if (isAllOvertimeRegime(bucket.regime)) {
        attributeAllOvertime(bucket.days, hoursByDay, byDay);
      } else {
        attributeRunningStaff(bucket.days, hoursByDay, bucketContracted, byDay);
      }
    }
  }

  const days = weekDays.map((d) => byDay.get(d)!);
  const ordinaryHoursTotal = days.reduce((a, d) => a + d.ordinaryHours, 0);
  const overtimeHoursTotal = days.reduce((a, d) => a + d.overtimeHours, 0);

  return { days, ordinaryHoursTotal, overtimeHoursTotal };
}
