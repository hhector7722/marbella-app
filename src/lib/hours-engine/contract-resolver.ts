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

function getFirstTermDate(terms: readonly ContractTermFact[]): CivilDate | null {
  let first: CivilDate | null = null;
  for (const t of terms) {
    if (first === null || compareCivilDate(t.effectiveFrom, first) < 0) {
      first = t.effectiveFrom;
    }
  }
  return first;
}

function segmentKey(term: ContractTermFact | null, kind: 'term' | 'pre_alta' | 'gap'): string {
  if (kind === 'pre_alta' || kind === 'gap') return kind;
  if (!term) return 'none';
  return `term:${term.effectiveFrom}:${term.effectiveTo ?? 'open'}:${term.weeklyHours}:${term.bagMode}:${term.regime}`;
}

/**
 * Único punto autorizado a resolver el contrato efectivo semanal.
 * Compone por tramo: días/7 × jornada, redondeado Marbella (enteros o medias).
 * Pre-alta = antes del primer tramo.
 * Gap = huecos entre tramos o después del último tramo.
 */
export function resolveEffectiveContract(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): EffectiveContractWeek {
  const { weekEnd, days } = weekBounds(weekStart);
  const { terms } = employee;

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
    contractedHoursEffective,
    segments,
  };
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
