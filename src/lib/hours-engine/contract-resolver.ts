import { summarizeClosureHours } from './expected-hours.ts';
import type {
  CivilDate,
  ClosureObligationSource,
  ContractSegment,
  ContractTermFact,
  EffectiveContractWeek,
  EmployeeBoundaryFacts,
  ExpectedHoursByDay,
} from './types.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import {
  compareCivilDate,
  isAugustCivilDate,
  isCivilDateInRange,
  isPartialAugustClosureWeek,
  weekBounds,
} from './week-dates.ts';

function findTermForDay(
  day: CivilDate,
  terms: readonly ContractTermFact[],
): ContractTermFact | null {
  const matches = terms.filter((t) =>
    isCivilDateInRange(day, t.effectiveFrom, t.effectiveTo),
  );
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new Error(
      `Tramos solapados en ${day}: invariante de hechos rota (debe haber como máximo un tramo).`,
    );
  }
  return matches[0]!;
}

function getFirstTermDate(terms: readonly ContractTermFact[]): CivilDate | null {
  let first: CivilDate | null = null;
  for (const t of terms) {
    if (first === null || compareCivilDate(t.effectiveFrom, first) < 0) {
      first = t.effectiveFrom;
    }
  }
  return first;
}

/**
 * Fecha civil (inclusive) en que termina la relación laboral si está cerrada.
 * null si existe un tramo abierto (la relación continúa) o no hay tramos.
 *
 * Fuente contractual = hours_contract_terms: la relación termina cuando el
 * último tramo tiene fecha de fin (no hay tramo «Vigente»).
 */
export function relationshipEndDate(
  employee: EmployeeBoundaryFacts,
): CivilDate | null {
  if (employee.terms.some((t) => t.effectiveTo == null)) return null;
  let end: CivilDate | null = null;
  for (const t of employee.terms) {
    if (t.effectiveTo == null) continue;
    if (end === null || compareCivilDate(t.effectiveTo, end) > 0) {
      end = t.effectiveTo;
    }
  }
  return end;
}

function segmentKey(term: ContractTermFact | null, kind: 'term' | 'pre_alta' | 'gap'): string {
  if (kind === 'pre_alta' || kind === 'gap') return kind;
  if (!term) return 'none';
  return `term:${term.effectiveFrom}:${term.effectiveTo ?? 'open'}:${term.weeklyHours}:${term.bagMode}:${term.regime}`;
}

/**
 * Jornada que puede generar deuda.
 *
 * Staff, semana frontera con distribución: suma de horas previstas de los
 * días de este tramo que no son agosto. Un día de pre-alta o gap no entra.
 * Staff sin distribución: días civiles del tramo fuera de agosto / 7 × jornada.
 * El resto de regímenes no exime agosto.
 * La jornada efectiva (ordinarias/extras y alta/baja) no cambia aquí.
 */
function debtHoursForTerm(
  days: readonly CivilDate[],
  term: ContractTermFact,
  expectedHoursByDay: ExpectedHoursByDay | null,
): number {
  const rawContracted = (days.length / 7) * term.weeklyHours;
  if (term.regime !== 'staff') {
    return roundMarbellaHours(rawContracted);
  }
  if (expectedHoursByDay == null) {
    const openDayCount = days.filter((day) => !isAugustCivilDate(day)).length;
    return roundMarbellaHours((openDayCount / 7) * term.weeklyHours);
  }
  const { requiredHours } = summarizeClosureHours(days, expectedHoursByDay);
  return roundMarbellaHours(Math.max(0, requiredHours));
}

/**
 * Único punto autorizado a resolver el contrato efectivo semanal.
 * Compone por tramo: días/7 × jornada, redondeado Marbella (enteros o medias).
 *
 * Para staff también resuelve la jornada que puede generar deuda de asistencia.
 * Agosto exime deuda. En una semana frontera, solo si hay distribución
 * prevista de esa semana: la deuda es la suma fuera de agosto. Si no hay
 * distribución, se prorratea por días civiles. Fuera de la frontera, la
 * distribución se ignora. La jornada efectiva sigue incluyendo agosto.
 *
 * Pre-alta = antes del primer tramo.
 * Gap = huecos entre tramos o después del último tramo.
 */
export function resolveEffectiveContract(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
  expectedHoursByDay?: ExpectedHoursByDay | null,
): EffectiveContractWeek {
  const { weekEnd, days } = weekBounds(weekStart);
  const { terms } = employee;
  const closureObligationSource: ClosureObligationSource = !isPartialAugustClosureWeek(weekStart)
    ? 'not_boundary'
    : expectedHoursByDay == null
      ? 'legacy_unconfigured'
      : 'weekly_expected_hours';
  const appliedExpected =
    closureObligationSource === 'weekly_expected_hours' ? expectedHoursByDay! : null;

  const firstTermDate = getFirstTermDate(terms);

  type Acc = {
    kind: 'term' | 'pre_alta' | 'gap';
    term: ContractTermFact | null;
    days: CivilDate[];
  };

  const groups: Acc[] = [];
  let current: Acc | null = null;

  for (const day of days) {
    const term = findTermForDay(day, terms);

    if (!term) {
      const kind =
        firstTermDate === null || compareCivilDate(day, firstTermDate) < 0
          ? 'pre_alta'
          : 'gap';
      const key = segmentKey(null, kind);

      if (!current || segmentKey(current.term, current.kind) !== key) {
        current = { kind, term: null, days: [day] };
        groups.push(current);
      } else {
        current.days.push(day);
      }
      continue;
    }

    const key = segmentKey(term, 'term');
    if (!current || segmentKey(current.term, current.kind) !== key) {
      current = { kind: 'term', term, days: [day] };
      groups.push(current);
    } else {
      current.days.push(day);
    }
  }

  const segments: ContractSegment[] = groups.map((g) => {
    if (g.kind === 'pre_alta' || g.kind === 'gap') {
      return {
        days: g.days,
        weeklyHoursOfTerm: 0,
        contractedHours: 0,
        debtContractedHours: 0,
        bagMode: false,
        termRegime: 'staff',
        overtimeRatePerHour: null,
        kind: g.kind,
        effectiveFrom: null,
        effectiveTo: null,
      };
    }
    const term = g.term!;
    // Prorrateo días/7 × jornada → solo enteros o medias (regla Marbella).
    const contractedHours = roundMarbellaHours(
      (g.days.length / 7) * term.weeklyHours,
    );
    const debtContractedHours = debtHoursForTerm(g.days, term, appliedExpected);
    return {
      days: g.days,
      weeklyHoursOfTerm: term.weeklyHours,
      contractedHours,
      debtContractedHours,
      bagMode: term.bagMode,
      termRegime: term.regime,
      overtimeRatePerHour: term.overtimeRatePerHour ?? null,
      kind: 'term',
      effectiveFrom: term.effectiveFrom,
      effectiveTo: term.effectiveTo,
    };
  });

  const contractedHoursEffective = segments
    .filter((s) => s.kind === 'term')
    .reduce((acc, s) => acc + s.contractedHours, 0);

  return {
    weekStart,
    weekEnd,
    contractedHoursEffective,
    segments,
    closureObligationSource,
  };
}

/**
 * Jornada contractual de referencia de la semana: la jornada contratada
 * efectiva de los tramos activos, con la misma semántica del motor
 * (días del tramo / 7 × jornada, redondeo Marbella). Pre-alta y gap aportan 0.
 * No descuenta agosto: es el objetivo de la distribución prevista, no la deuda.
 * La reutilizan la server action y el editor para no divergir del motor.
 */
export function weeklyContractReferenceHours(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): number {
  return resolveEffectiveContract(employee, weekStart).contractedHoursEffective;
}

/**
 * Solo para estimación económica.
 * Devuelve null si no hay contrato efectivo para obtener el precio.
 */
export function resolveEffectiveOvertimeRate(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
  overrideRate?: number | null,
): number | null {
  if (overrideRate != null) return overrideRate;

  const contract = resolveEffectiveContract(employee, weekStart);

  // First, try to find a segment that includes the Monday with a defined rate
  for (const s of contract.segments) {
    if (!s.days.includes(weekStart)) continue;
    if (s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
    // If pre_alta, gap, or segment without rate, stop scanning further segments for this week
    break;
  }

  // Fallback: any term segment with a rate
  for (const s of contract.segments) {
    if (s.kind === 'term' && s.overtimeRatePerHour != null && Number.isFinite(s.overtimeRatePerHour)) {
      return Number(s.overtimeRatePerHour);
    }
  }

  // Historical fallback from employee terms, newest first
  const sortedTerms = [...employee.terms].sort((a, b) =>
    compareCivilDate(b.effectiveFrom, a.effectiveFrom),
  );

  for (const t of sortedTerms) {
    if (
      compareCivilDate(t.effectiveFrom, weekStart) <= 0 &&
      t.overtimeRatePerHour != null && Number.isFinite(t.overtimeRatePerHour)
    ) {
      return Number(t.overtimeRatePerHour);
    }
  }

  // Any known historical rate
  for (const t of sortedTerms) {
    if (t.overtimeRatePerHour != null && Number.isFinite(t.overtimeRatePerHour)) {
      return Number(t.overtimeRatePerHour);
    }
  }

  return null;
}
