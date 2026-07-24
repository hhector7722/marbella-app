export {
  canTransitionDiscrepancyStatus,
  InvalidDiscrepancyTransitionError,
  transitionDiscrepancy,
} from './lifecycle.ts';

/** @deprecated scaffolding — usar transitionDiscrepancy */
export function resolveDiscrepancyNotImplemented(): never {
  throw new Error(
    'shadow/resolver: usar transitionDiscrepancy + DiscrepancyStore',
  );
}
