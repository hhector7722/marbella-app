/**
 * Bucle de propagación: solo orquesta liquidateWeek + comparación de carryOut.
 * Sin reglas de negocio propias.
 */

import { liquidateWeek } from '../liquidation-engine.ts';
import type { CivilDate, LiquidationInput } from '../types.ts';
import { nextWeekStart, previousWeekStart } from './calendar.ts';
import type { FactStore, ResultStore } from './ports.ts';
import { compareCivilDate } from '../week-dates.ts';

export type PropagateArgs = {
  employeeId: string;
  firstWeekStart: CivilDate;
  horizonWeekStart: CivilDate;
  facts: FactStore;
  results: ResultStore;
};

export type PropagateResult = {
  recalculatedWeeks: CivilDate[];
  stoppedAtWeekStart: CivilDate;
};

function buildLiquidationInput(
  employeeId: string,
  weekStart: CivilDate,
  facts: FactStore,
  results: ResultStore,
): LiquidationInput {
  const employee = facts.getEmployee(employeeId);
  if (!employee) {
    throw new Error(`propagate: empleado desconocido ${employeeId}`);
  }
  const prev = results.get(employeeId, previousWeekStart(weekStart));
  return {
    employee,
    weekStart,
    logs: facts.listLogs(employeeId),
    isPaid: facts.isPaid(employeeId, weekStart),
    carryIn: prev?.carryOut ?? 0,
  };
}

/**
 * Recalcula desde firstWeek hasta horizon inclusive, parando cuando
 * carryOut nuevo === carryOut almacenado previo de esa misma semana.
 */
export function propagateWeeks(args: PropagateArgs): PropagateResult {
  const { employeeId, firstWeekStart, horizonWeekStart, facts, results } = args;
  const recalculatedWeeks: CivilDate[] = [];
  let weekStart = firstWeekStart;
  let stoppedAtWeekStart = firstWeekStart;

  while (compareCivilDate(weekStart, horizonWeekStart) <= 0) {
    const previousStored = results.get(employeeId, weekStart);
    const previousCarryOut = previousStored?.carryOut;

    const input = buildLiquidationInput(employeeId, weekStart, facts, results);
    const liquidation = liquidateWeek(input);
    results.save(liquidation);
    recalculatedWeeks.push(weekStart);
    stoppedAtWeekStart = weekStart;

    const carryUnchanged =
      previousCarryOut !== undefined && previousCarryOut === liquidation.carryOut;

    if (carryUnchanged) {
      break;
    }

    weekStart = nextWeekStart(weekStart);
  }

  return { recalculatedWeeks, stoppedAtWeekStart };
}
