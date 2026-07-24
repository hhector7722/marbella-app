import type { CanonicalComparableField } from './canonical-vector.ts';
import type { DiscrepancyCode, DiscrepancySeverity } from './taxonomy.ts';

/** Diff de un campo canónico tras Classifier (antes de agrupar en Discrepancy). */
export type ShadowFieldDiff = {
  field: CanonicalComparableField;
  heValue: string | number | boolean | null;
  sqlValue: string | number | boolean | null;
  discrepancyCode: DiscrepancyCode;
  severity: DiscrepancySeverity;
  epsilonApplied: number | null;
};
