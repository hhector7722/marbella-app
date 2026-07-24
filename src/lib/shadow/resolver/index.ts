import type { DiscrepancyStatus } from '../types/discrepancy.ts';
import { DISCREPANCY_TRANSITIONS } from '../types/discrepancy.ts';

/**
 * Resolver de ciclo de vida de ShadowDiscrepancy (Commit 3+).
 * Scaffolding: solo validación de transiciones.
 */
export function canTransitionDiscrepancyStatus(
  from: DiscrepancyStatus,
  to: DiscrepancyStatus,
): boolean {
  return DISCREPANCY_TRANSITIONS[from].includes(to);
}

export function resolveDiscrepancyNotImplemented(): never {
  throw new Error('shadow/resolver: persistencia de ciclo de vida (Commit 3)');
}
