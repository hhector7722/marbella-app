import type { CivilDate } from '../types.ts';
import { mondayOfClockInIso, mondayOnOrBefore, minMonday } from './calendar.ts';
import type { FactChange } from './fact-change.ts';
import type { FactStore, ResultStore } from './ports.ts';
import { propagateWeeks } from './propagate.ts';

/**
 * Localiza la primera semana (lunes) afectada por un cambio de hecho.
 * Sin reglas de liquidación: solo calendario + tipo de cambio.
 */
export function locateFirstAffectedWeek(change: FactChange): CivilDate {
  switch (change.kind) {
    case 'upsert_time_log': {
      const mondays = [mondayOfClockInIso(change.log.clockInIso)];
      if (change.previousClockInIso) {
        mondays.push(mondayOfClockInIso(change.previousClockInIso));
      }
      return mondays.sort()[0]!;
    }
    case 'delete_time_log':
      return mondayOfClockInIso(change.clockInIso);
    case 'replace_contract_terms':
      return mondayOnOrBefore(change.effectiveFrom);
    case 'set_joining_date': {
      const days: CivilDate[] = [];
      if (change.joiningDate) days.push(change.joiningDate);
      if (change.previousJoiningDate) days.push(change.previousJoiningDate);
      if (days.length === 0) {
        throw new Error('set_joining_date sin fechas para localizar impacto');
      }
      return minMonday(days);
    }
    case 'set_end_date': {
      const days: CivilDate[] = [];
      if (change.endDate) days.push(change.endDate);
      if (change.previousEndDate) days.push(change.previousEndDate);
      if (days.length === 0) {
        throw new Error('set_end_date sin fechas para localizar impacto');
      }
      return minMonday(days);
    }
    default: {
      const _exhaustive: never = change;
      return _exhaustive;
    }
  }
}

/**
 * Informe de impacto: primera semana + semanas pagadas que la cascada tocaría.
 * Usa un sandbox (clone) para no mutar el estado real.
 */
export function analyzeFactChangeImpact(
  change: FactChange,
  facts: FactStore,
  results: ResultStore,
  horizonWeekStart: CivilDate,
): {
  employeeId: string;
  firstWeekStart: CivilDate;
  paidWeeksAffected: CivilDate[];
  weeksThatWouldRecalculate: CivilDate[];
} {
  const employeeId = change.employeeId;
  const firstWeekStart = locateFirstAffectedWeek(change);

  const paidCandidates = facts.listPaidWeekStarts(
    employeeId,
    firstWeekStart,
    horizonWeekStart,
  );

  const sandboxFacts = facts.clone();
  const sandboxResults = results.clone();
  sandboxFacts.applyFactChange(change);
  for (const week of paidCandidates) {
    sandboxFacts.setPaid(employeeId, week, false);
  }

  const { recalculatedWeeks } = propagateWeeks({
    employeeId,
    firstWeekStart,
    horizonWeekStart,
    facts: sandboxFacts,
    results: sandboxResults,
  });

  const touched = new Set(recalculatedWeeks);
  const paidWeeksAffected = paidCandidates.filter((w) => touched.has(w));

  return {
    employeeId,
    firstWeekStart,
    paidWeeksAffected,
    weeksThatWouldRecalculate: recalculatedWeeks,
  };
}
