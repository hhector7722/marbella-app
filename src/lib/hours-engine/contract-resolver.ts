import type {
  CivilDate,
  ContractSegment,
  ContractTermFact,
  EffectiveContractWeek,
  EmployeeBoundaryFacts,
} from './types.ts';
import { roundMarbellaHours } from './marbella-round.ts';
import {
  compareCivilDate,
  isCivilDateInRange,
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

function isEmployedDay(
  day: CivilDate,
  joiningDate: CivilDate | null,
  endDate: CivilDate | null,
): boolean {
  if (joiningDate !== null && compareCivilDate(day, joiningDate) < 0) {
    return false;
  }
  if (endDate !== null && compareCivilDate(day, endDate) > 0) {
    return false;
  }
  return true;
}

function isPreAltaDay(day: CivilDate, joiningDate: CivilDate | null): boolean {
  return joiningDate !== null && compareCivilDate(day, joiningDate) < 0;
}

function segmentKey(term: ContractTermFact | null, kind: 'term' | 'pre_alta'): string {
  if (kind === 'pre_alta') return 'pre_alta';
  if (!term) return 'none';
  return `term:${term.effectiveFrom}:${term.effectiveTo ?? 'open'}:${term.weeklyHours}:${term.bagMode}:${term.regime}`;
}

/**
 * Único punto autorizado a resolver el contrato efectivo semanal.
 * Compone por tramo: días/7 × jornada, redondeado Marbella (enteros o medias).
 * Pre-alta = sin tramo (contrato 0). Post-baja = días excluidos.
 */
export function resolveEffectiveContract(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): EffectiveContractWeek {
  const { weekEnd, days } = weekBounds(weekStart);
  const { joiningDate, endDate, terms } = employee;

  type Acc = {
    kind: 'term' | 'pre_alta';
    term: ContractTermFact | null;
    days: CivilDate[];
  };

  const groups: Acc[] = [];
  let current: Acc | null = null;

  for (const day of days) {
    if (endDate !== null && compareCivilDate(day, endDate) > 0) {
      // post-baja: no computa
      current = null;
      continue;
    }

    if (isPreAltaDay(day, joiningDate)) {
      const key = segmentKey(null, 'pre_alta');
      if (!current || segmentKey(current.term, current.kind) !== key) {
        current = { kind: 'pre_alta', term: null, days: [day] };
        groups.push(current);
      } else {
        current.days.push(day);
      }
      continue;
    }

    if (!isEmployedDay(day, joiningDate, endDate)) {
      current = null;
      continue;
    }

    const term = findTermForDay(day, terms);
    if (!term) {
      // Empleado activo sin tramo: no hay contrato ese día (horas se tratan fuera vía asistencia).
      current = null;
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
    if (g.kind === 'pre_alta') {
      return {
        days: g.days,
        weeklyHoursOfTerm: 0,
        contractedHours: 0,
        bagMode: false,
        termRegime: 'staff',
        overtimeRatePerHour: null,
        kind: 'pre_alta',
        effectiveFrom: null,
        effectiveTo: null,
      };
    }
    const term = g.term!;
    // Prorrateo días/7 × jornada → solo enteros o medias (regla Marbella).
    const contractedHours = roundMarbellaHours(
      (g.days.length / 7) * term.weeklyHours,
    );
    return {
      days: g.days,
      weeklyHoursOfTerm: term.weeklyHours,
      contractedHours,
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
    segments,
    contractedHoursEffective,
  };
}
