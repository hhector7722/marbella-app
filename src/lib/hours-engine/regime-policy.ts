import type {
  CivilDate,
  ContractRegime,
  SegmentLiquidation,
  SegmentRegime,
} from './types.ts';
import { roundMarbellaSigned } from './marbella-round.ts';
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
  kind: 'term' | 'pre_alta' | 'gap';
};

function hoursOnDays(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
): number {
  return days.reduce((acc, d) => acc + (hoursByDay[d] ?? 0), 0);
}

type BalancePart = {
  weeklyBalancePart: number;
  ordinaryHours: number;
  overtimeHours: number;
  contractedHours: number;
};

/**
 * Balance de un segmento homogéneo (mismo régimen contractual o pre_alta).
 * Staff: horas − contrato (ya resuelto). Sin tope: balance = horas.
 * `floorDebt`: no genera deuda de asistencia (agosto / vacaciones).
 */
function balanceForRegime(
  regime: SegmentRegime,
  hours: number,
  contractedHours: number,
  floorDebt = false,
): BalancePart {
  if (regime === 'staff') {
    const rawBalance = hours - contractedHours;
    const weeklyBalancePart = floorDebt ? Math.max(0, rawBalance) : rawBalance;
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
 * Staff con días de agosto: el contrato se reparte por días; la parte de
 * agosto no genera deuda (suelo en 0). Ordinarias/extras siguen el contrato.
 * No restaura el régimen histórico que convertía todo agosto en extras.
 */
function balanceStaffWithAugustFloor(
  days: readonly CivilDate[],
  hoursByDay: Readonly<Record<CivilDate, number>>,
  contractedHours: number,
): BalancePart {
  const augustDays = days.filter(isAugustCivilDate);
  const otherDays = days.filter((d) => !isAugustCivilDate(d));

  if (augustDays.length === 0) {
    return balanceForRegime('staff', hoursOnDays(days, hoursByDay), contractedHours);
  }
  if (otherDays.length === 0) {
    return balanceForRegime(
      'staff',
      hoursOnDays(days, hoursByDay),
      contractedHours,
      true,
    );
  }

  const segmentDayCount = days.length;
  const augustContracted = (augustDays.length / segmentDayCount) * contractedHours;
  const otherContracted = (otherDays.length / segmentDayCount) * contractedHours;

  const augustPart = balanceForRegime(
    'staff',
    hoursOnDays(augustDays, hoursByDay),
    augustContracted,
    true,
  );
  const otherPart = balanceForRegime(
    'staff',
    hoursOnDays(otherDays, hoursByDay),
    otherContracted,
    false,
  );

  return {
    weeklyBalancePart: augustPart.weeklyBalancePart + otherPart.weeklyBalancePart,
    ordinaryHours: augustPart.ordinaryHours + otherPart.ordinaryHours,
    overtimeHours: augustPart.overtimeHours + otherPart.overtimeHours,
    contractedHours: augustPart.contractedHours + otherPart.contractedHours,
  };
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
  const part =
    regimeApplied === 'staff'
      ? balanceStaffWithAugustFloor(days, hoursByDay, contractedHours)
      : balanceForRegime(regimeApplied, hoursWorked, contractedHours);

  return {
    days,
    hoursWorked,
    contractedHours,
    bagMode,
    regimeApplied,
    weeklyBalancePart: roundMarbellaSigned(part.weeklyBalancePart),
    ordinaryHours: part.ordinaryHours,
    overtimeHours: part.overtimeHours,
    kind,
  };
}
