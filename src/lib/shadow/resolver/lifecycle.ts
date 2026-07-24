import {
  DISCREPANCY_TRANSITIONS,
  type DiscrepancyStatus,
  type ShadowDiscrepancy,
} from '../types/discrepancy.ts';
import { withDiscrepancyStatus } from './factory.ts';

export class InvalidDiscrepancyTransitionError extends Error {
  readonly from: DiscrepancyStatus;
  readonly to: DiscrepancyStatus;

  constructor(from: DiscrepancyStatus, to: DiscrepancyStatus) {
    super(`shadow/resolver: transición inválida ${from} → ${to}`);
    this.name = 'InvalidDiscrepancyTransitionError';
    this.from = from;
    this.to = to;
  }
}

export function canTransitionDiscrepancyStatus(
  from: DiscrepancyStatus,
  to: DiscrepancyStatus,
): boolean {
  return DISCREPANCY_TRANSITIONS[from].includes(to);
}

export function transitionDiscrepancy(
  d: ShadowDiscrepancy,
  to: DiscrepancyStatus,
  nowIso?: string,
): ShadowDiscrepancy {
  if (!canTransitionDiscrepancyStatus(d.status, to)) {
    throw new InvalidDiscrepancyTransitionError(d.status, to);
  }
  return withDiscrepancyStatus(d, to, nowIso);
}
