/**
 * Generación de horizonte de semanas (lunes) para Shadow CLI.
 * Infraestructura / ops — no pertenece al dominio Shadow.
 */

import {
  mondayOnOrBefore,
  nextWeekStart,
  compareCivilDate,
} from '../../../lib/hours-engine/week-dates.ts';
import type { CivilDate } from '../../../lib/hours-engine/types.ts';

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export function assertCivilYmd(value: string, label: string): CivilDate {
  if (!YMD.test(value)) {
    throw new Error(`${label} debe ser YYYY-MM-DD (recibido: ${value})`);
  }
  return value;
}

/**
 * Lista lunes inclusivos del horizonte.
 * `from`/`to` pueden ser cualquier día civil; se anclan al lunes de su semana.
 */
export function listWeekStartsInclusive(
  fromYmd: string,
  toYmd: string,
): CivilDate[] {
  const from = assertCivilYmd(fromYmd, '--from');
  const to = assertCivilYmd(toYmd, '--to');
  if (compareCivilDate(from, to) > 0) {
    throw new Error(`--from (${from}) no puede ser posterior a --to (${to})`);
  }
  const start = mondayOnOrBefore(from);
  const end = mondayOnOrBefore(to);
  const weeks: CivilDate[] = [];
  for (
    let w = start;
    compareCivilDate(w, end) <= 0;
    w = nextWeekStart(w)
  ) {
    weeks.push(w);
  }
  return weeks;
}

export function resolveHorizonBounds(input: {
  week?: string;
  from?: string;
  to?: string;
}): { horizonStart: CivilDate; horizonEnd: CivilDate; weekStarts: CivilDate[] } {
  if (input.week) {
    const week = assertCivilYmd(input.week, '--week');
    const monday = mondayOnOrBefore(week);
    return {
      horizonStart: monday,
      horizonEnd: monday,
      weekStarts: [monday],
    };
  }
  if (!input.from || !input.to) {
    throw new Error(
      'Indica --week YYYY-MM-DD o el par --from/--to YYYY-MM-DD',
    );
  }
  const weekStarts = listWeekStartsInclusive(input.from, input.to);
  return {
    horizonStart: weekStarts[0]!,
    horizonEnd: weekStarts[weekStarts.length - 1]!,
    weekStarts,
  };
}
