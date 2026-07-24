/**
 * Taxonomía de discrepancias Shadow (dominio Migración).
 * Códigos estables — el classifier los asignará en commits posteriores.
 */

export const DISCREPANCY_CODES = [
  'D000', // Schema gap
  'D001', // Contract input
  'D002', // Carry chain
  'D003', // Hours input
  'D004', // Rounding
  'D005', // Waterfall
  'D006', // Semantic alias
  'D007', // Regime policy
  'D008', // Boundary employment
  'D009', // Temporal fence
  'D010', // Flag process
  'D011', // Stale snapshot
  'D012', // Cost derivation
  'D013', // Partial week
  'D014', // Determinism breach
  'D015', // Cross-domain leak
  'D016', // Accepted legacy
  'D017', // Unknown
] as const;

export type DiscrepancyCode = (typeof DISCREPANCY_CODES)[number];

export type DiscrepancySeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export type DiscrepancyOwnerDomain =
  | 'Attendance'
  | 'Contract'
  | 'Liquidation'
  | 'Payroll'
  | 'Tips'
  | 'Insights'
  | 'Infra'
  | 'Architecture'
  | 'Unknown';
