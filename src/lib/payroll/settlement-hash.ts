/**
 * Identificador determinista para liquidaciones de nómina (Settlements).
 *
 * Garantiza reproducibilidad inmutable sin depender de UUIDs generados al azar.
 */

import { createHash } from 'crypto';

export function computeSettlementHash(input: {
  periodYm: string;
  employeeCode: string;
  grossSalary: number;
  companyCost: number;
  netSalary: number;
  rowIndex: number;
}): string {
  const payload = `${input.periodYm}|${input.employeeCode}|${input.grossSalary.toFixed(2)}|${input.companyCost.toFixed(2)}|${input.netSalary.toFixed(2)}|${input.rowIndex}`;
  return createHash('sha256').update(payload).digest('hex');
}
