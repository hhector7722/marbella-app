/**
 * Invalidation Orchestrator — Fase 2.
 * Coordina impacto → confirmación → reapertura → liquidateWeek → propagación.
 * No contiene reglas de negocio de liquidación.
 */

import { analyzeFactChangeImpact, locateFirstAffectedWeek } from './impact-analyzer.ts';
import type {
  ConfirmationDecision,
  FactChange,
  OrchestratorApplyResult,
} from './fact-change.ts';
import type { FactStore, ResultStore } from './ports.ts';
import { propagateWeeks } from './propagate.ts';
import type { CivilDate } from '../types.ts';

export type OrchestratorDeps = {
  facts: FactStore;
  results: ResultStore;
  /** Último lunes inclusive del horizonte de cascada. */
  horizonWeekStart: CivilDate;
};

export function analyzeChange(
  change: FactChange,
  deps: OrchestratorDeps,
): ReturnType<typeof analyzeFactChangeImpact> {
  return analyzeFactChangeImpact(
    change,
    deps.facts,
    deps.results,
    deps.horizonWeekStart,
  );
}

/**
 * Aplica un cambio de hecho con el flujo completo de invalidación.
 * Sin confirmation y con semanas pagadas afectadas → needs_confirmation (sin mutar).
 * confirmation.cancel → aborted (sin mutar).
 * sin pagadas o confirmation.accept → aplica hechos, reabre, propaga, persiste resultados.
 */
export function applyFactChange(
  change: FactChange,
  deps: OrchestratorDeps,
  confirmation?: ConfirmationDecision,
): OrchestratorApplyResult {
  const impact = analyzeFactChangeImpact(
    change,
    deps.facts,
    deps.results,
    deps.horizonWeekStart,
  );

  if (impact.paidWeeksAffected.length > 0) {
    if (!confirmation) {
      return {
        status: 'needs_confirmation',
        employeeId: impact.employeeId,
        firstWeekStart: impact.firstWeekStart,
        paidWeeksAffected: impact.paidWeeksAffected,
      };
    }
    if (confirmation.decision === 'cancel') {
      return { status: 'aborted' };
    }
  }

  // Mutación real
  deps.facts.applyFactChange(change);

  const reopenedWeeks: CivilDate[] = [];
  for (const week of impact.paidWeeksAffected) {
    deps.facts.setPaid(change.employeeId, week, false);
    reopenedWeeks.push(week);
  }

  const { recalculatedWeeks, stoppedAtWeekStart } = propagateWeeks({
    employeeId: change.employeeId,
    firstWeekStart: impact.firstWeekStart,
    horizonWeekStart: deps.horizonWeekStart,
    facts: deps.facts,
    results: deps.results,
  });

  return {
    status: 'applied',
    employeeId: change.employeeId,
    firstWeekStart: impact.firstWeekStart,
    reopenedWeeks,
    recalculatedWeeks,
    stoppedAtWeekStart,
  };
}

export { locateFirstAffectedWeek };
