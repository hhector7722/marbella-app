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
import { weekBounds } from './week-dates.ts';

export type DailyBreakdownSegmentInput = {
  days: readonly CivilDate[];
  hoursByDay: Readonly<Record<CivilDate, number>>;
  contractedHours: number;
  termRegime: ContractRegime;
  kind: 'term' | 'pre_alta' | 'gap';
};

function isAllOvertimeRegime(regime: SegmentRegime): boolean {
  return (
    regime === 'pre_alta' ||
    regime === 'gap' ||
    regime === 'manager' ||
    regime === 'fixed'
  );
}

/**
 * Regla funcional inmutable (running):
 * acumulado semanal (dentro del segmento) vs cupo ordinario contratado;
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

    let regime: SegmentRegime = seg.termRegime;
    if (seg.kind === 'pre_alta') regime = 'pre_alta';
    if (seg.kind === 'gap') regime = 'gap';

    if (isAllOvertimeRegime(regime)) {
      attributeAllOvertime(seg.days, hoursByDay, byDay);
    } else {
      attributeRunningStaff(seg.days, hoursByDay, seg.contractedHours, byDay);
    }
  }

  const days = weekDays.map((d) => byDay.get(d)!);
  const ordinaryHoursTotal = days.reduce((a, d) => a + d.ordinaryHours, 0);
  const overtimeHoursTotal = days.reduce((a, d) => a + d.overtimeHours, 0);

  return { days, ordinaryHoursTotal, overtimeHoursTotal };
}
