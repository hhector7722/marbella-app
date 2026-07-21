import type {
  CivilDate,
  ContractRegime,
  SegmentLiquidation,
  SegmentRegime,
} from './types.ts';
import { roundMarbellaHours, roundMarbellaSigned } from './marbella-round.ts';
import { isAugustCivilDate } from './week-dates.ts';

export type RegimeSegmentInput = {
  days: readonly CivilDate[];
  hoursByDay: Readonly<Record<CivilDate, number>>;
  /**
   * Horas contratadas del segmento ya resueltas por Contract Resolver.
   * Regime Policy no recalcula prorrateos ni jornadas.
   */
  contractedHours: number;
  bagMode: boolean;
  termRegime: ContractRegime;
  kind: 'term' | 'pre_alta';
};

function hoursOnDays(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
): number {
  return days.reduce((acc, d) => acc + (hoursByDay[d] ?? 0), 0);
}

/**
 * Balance de un bucket homogéneo (mismo régimen aplicado).
 * Staff: horas − contrato (ya resuelto). Sin tope: balance = horas.
 */
function balanceForRegime(
  regime: SegmentRegime,
  hours: number,
  contractedHours: number,
): { weeklyBalancePart: number; ordinaryHours: number; overtimeHours: number; contractedHours: number } {
  if (regime === 'staff') {
    const weeklyBalancePart = hours - contractedHours;
    const ordinaryHours = Math.min(hours, contractedHours);
    const overtimeHours = Math.max(0, hours - contractedHours);
    return { weeklyBalancePart, ordinaryHours, overtimeHours, contractedHours };
  }

  return {
    weeklyBalancePart: hours,
    ordinaryHours: 0,
    overtimeHours: hours,
    contractedHours,
  };
}

function resolveDayRegime(
  day: CivilDate,
  kind: 'term' | 'pre_alta',
  termRegime: ContractRegime,
): SegmentRegime {
  if (kind === 'pre_alta') return 'pre_alta';
  if (isAugustCivilDate(day)) return 'agosto';
  return termRegime;
}

/**
 * Única política de régimen. Compone por días/tramo:
 * agosto por calendario del día; manager/fixed/staff del tramo; pre-alta = todo extra.
 * El contrato efectivo llega resuelto; solo se reparte entre buckets por proporción de días.
 */
export function applyRegimeToSegment(input: RegimeSegmentInput): SegmentLiquidation {
  const { days, hoursByDay, contractedHours, bagMode, termRegime, kind } = input;

  if (days.length === 0) {
    return {
      days,
      hoursWorked: 0,
      contractedHours: 0,
      bagMode,
      regimeApplied: kind === 'pre_alta' ? 'pre_alta' : termRegime,
      weeklyBalancePart: 0,
      ordinaryHours: 0,
      overtimeHours: 0,
      kind,
    };
  }

  type Bucket = { regime: SegmentRegime; days: CivilDate[] };
  const buckets: Bucket[] = [];
  let current: Bucket | null = null;

  for (const day of days) {
    const regime = resolveDayRegime(day, kind, termRegime);
    if (!current || current.regime !== regime) {
      current = { regime, days: [day] };
      buckets.push(current);
    } else {
      current.days.push(day);
    }
  }

  const segmentDayCount = days.length;
  let hoursWorked = 0;
  let contractedHoursOut = 0;
  let weeklyBalancePart = 0;
  let ordinaryHours = 0;
  let overtimeHours = 0;

  for (const bucket of buckets) {
    const h = hoursOnDays(bucket.days, hoursByDay);
    // Reparto del contrato ya resuelto (equivalente a sub-prorrateo, sin jornada ni /7).
    const bucketContracted = (bucket.days.length / segmentDayCount) * contractedHours;
    const part = balanceForRegime(bucket.regime, h, bucketContracted);
    hoursWorked += h;
    contractedHoursOut += part.contractedHours;
    weeklyBalancePart += part.weeklyBalancePart;
    ordinaryHours += part.ordinaryHours;
    overtimeHours += part.overtimeHours;
  }

  const regimeApplied =
    buckets.length === 1 ? buckets[0]!.regime : kind === 'pre_alta' ? 'pre_alta' : termRegime;

  return {
    days,
    hoursWorked: roundMarbellaHours(hoursWorked),
    contractedHours: roundMarbellaHours(contractedHoursOut),
    bagMode,
    regimeApplied,
    weeklyBalancePart: roundMarbellaSigned(weeklyBalancePart),
    ordinaryHours: roundMarbellaHours(ordinaryHours),
    overtimeHours: roundMarbellaHours(overtimeHours),
    kind,
  };
}
