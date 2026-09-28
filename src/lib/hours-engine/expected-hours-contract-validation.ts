import { resolveEffectiveContract } from './contract-resolver.ts';
import {
  ExpectedHoursError,
  summarizeClosureHours,
  type ClosureHoursSummary,
} from './expected-hours.ts';
import type {
  CivilDate,
  EmployeeBoundaryFacts,
  ExpectedHoursByDay,
} from './types.ts';
import { weekBounds } from './week-dates.ts';

export type ExpectedHoursContractValidation = {
  referenceHours: number;
  summary: ClosureHoursSummary;
};

function activeStaffDays(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): { referenceHours: number; days: Set<CivilDate> } {
  const contract = resolveEffectiveContract(employee, weekStart);
  const staffSegments = contract.segments.filter(
    (segment) => segment.kind === 'term' && segment.termRegime === 'staff',
  );
  if (staffSegments.length === 0) {
    throw new ExpectedHoursError(
      'no_staff_contract',
      `La semana ${weekStart} no tiene ningún tramo staff activo.`,
    );
  }

  return {
    referenceHours: staffSegments.reduce(
      (total, segment) => total + segment.contractedHours,
      0,
    ),
    days: new Set(staffSegments.flatMap((segment) => segment.days)),
  };
}

export function expectedHoursContractReference(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
): number {
  return activeStaffDays(employee, weekStart).referenceHours;
}

export function assertExpectedHoursMatchContract(
  employee: EmployeeBoundaryFacts,
  weekStart: CivilDate,
  byDay: ExpectedHoursByDay,
): ExpectedHoursContractValidation {
  const contract = activeStaffDays(employee, weekStart);
  const { days } = weekBounds(weekStart);

  for (const day of days) {
    if (!contract.days.has(day) && (byDay[day] ?? 0) > 1e-9) {
      throw new ExpectedHoursError(
        'inactive_day',
        `Las horas previstas de ${day} deben ser 0: el día no tiene contrato staff activo.`,
      );
    }
  }

  const summary = summarizeClosureHours(days, byDay);
  const activeTotal = [...contract.days].reduce(
    (total, day) => total + (byDay[day] ?? 0),
    0,
  );
  if (Math.abs(activeTotal - contract.referenceHours) > 1e-9) {
    throw new ExpectedHoursError(
      'reference_mismatch',
      `El total previsto debe sumar ${contract.referenceHours} h para esta semana.`,
    );
  }

  return {
    referenceHours: contract.referenceHours,
    summary,
  };
}