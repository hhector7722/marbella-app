import type {
  CivilDate,
  ContractRegime,
  SegmentLiquidation,
  SegmentRegime,
} from './types.ts';
import { roundMarbellaSigned } from './marbella-round.ts';
import { isAugustCivilDate, mondayOnOrBefore } from './week-dates.ts';

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
  kind: 'term' | 'pre_alta' | 'gap';
};

function hoursOnDays(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
): number {
  return days.reduce((acc, d) => acc + (hoursByDay[d] ?? 0), 0);
}

/**
 * Balance de un segmento homogéneo (mismo régimen contractual o pre_alta).
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

/**
 * Agosto (vacaciones): no genera deuda de asistencia.
 * Criterio: el lunes de la Semana Marbella cae en agosto (igual que el
 * histórico SQL `extract(month from week_start) = 8`). Así la última
 * semana de agosto (p. ej. 31 ago–6 sep) también queda exenta.
 * No restaura el régimen que convertía todo agosto en extras.
 */
function applyAugustDebtFloor(
  days: readonly CivilDate[],
  weeklyBalancePart: number,
): number {
  if (days.length === 0) return weeklyBalancePart;
  const weekMonday = mondayOnOrBefore(days[0]!);
  if (!isAugustCivilDate(weekMonday)) return weeklyBalancePart;
  return Math.max(0, weeklyBalancePart);
}

/**
 * Única política de régimen. Aplica el régimen contractual del segmento
 * (manager/fixed/staff o pre_alta). Staff en agosto: sin deuda de asistencia.
 * El contrato efectivo llega resuelto por Contract Resolver.
 */
export function applyRegimeToSegment(input: RegimeSegmentInput): SegmentLiquidation {
  const { days, hoursByDay, contractedHours, bagMode, termRegime, kind } = input;

  let regimeApplied: SegmentRegime = termRegime;
  if (kind === 'pre_alta') regimeApplied = 'pre_alta';
  if (kind === 'gap') regimeApplied = 'gap';

  if (days.length === 0) {
    return {
      days,
      hoursWorked: 0,
      contractedHours: 0,
      bagMode,
      regimeApplied,
      weeklyBalancePart: 0,
      ordinaryHours: 0,
      overtimeHours: 0,
      kind,
    };
  }

  const hoursWorked = hoursOnDays(days, hoursByDay);
  const part = balanceForRegime(regimeApplied, hoursWorked, contractedHours);
  const weeklyBalancePart =
    regimeApplied === 'staff'
      ? applyAugustDebtFloor(days, part.weeklyBalancePart)
      : part.weeklyBalancePart;

  return {
    days,
    hoursWorked,
    contractedHours,
    bagMode,
    regimeApplied,
    weeklyBalancePart: roundMarbellaSigned(weeklyBalancePart),
    ordinaryHours: part.ordinaryHours,
    overtimeHours: part.overtimeHours,
    kind,
  };
}
