import type {
  CivilDate,
  ContractRegime,
  SegmentLiquidation,
  SegmentRegime,
} from './types.ts';
import { roundMarbellaSigned } from './marbella-round.ts';

export type RegimeSegmentInput = {
  days: readonly CivilDate[];
  hoursByDay: Readonly<Record<CivilDate, number>>;
  /**
   * Horas contratadas del segmento ya resueltas por Contract Resolver.
   * Regime Policy no recalcula prorrateos ni jornadas.
   */
  contractedHours: number;
  /**
   * Horas del segmento que pueden generar deuda de asistencia.
   * Para staff, Contract Resolver excluye aquí los días civiles de agosto.
   * Ordinarias/extras siguen usando contractedHours.
   */
  debtContractedHours: number;
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
 * Staff:
 * - deuda: se compara contra debtContractedHours;
 * - crédito/extras: solo nace al superar contractedHours.
 *
 * Así la exención de agosto reduce la obligación que puede generar deuda,
 * pero no transforma automáticamente esas horas exentas en extras.
 *
 * Sin tope: balance = horas.
 */
function balanceForRegime(
  regime: SegmentRegime,
  hours: number,
  contractedHours: number,
  debtContractedHours: number,
): { weeklyBalancePart: number; ordinaryHours: number; overtimeHours: number; contractedHours: number } {
  if (regime === 'staff') {
    const baseBalance = hours - contractedHours;
    const weeklyBalancePart =
      baseBalance >= 0
        ? baseBalance
        : Math.min(0, hours - debtContractedHours);
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
 * Única política de régimen. Aplica el régimen contractual del segmento
 * (manager/fixed/staff o pre_alta).
 *
 * La exención de deuda de agosto llega ya resuelta en debtContractedHours:
 * la política solo decide el balance, nunca vuelve a prorratear contrato.
 */
export function applyRegimeToSegment(input: RegimeSegmentInput): SegmentLiquidation {
  const {
    days,
    hoursByDay,
    contractedHours,
    debtContractedHours,
    bagMode,
    termRegime,
    kind,
  } = input;

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
  const part = balanceForRegime(
    regimeApplied,
    hoursWorked,
    contractedHours,
    debtContractedHours,
  );

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
