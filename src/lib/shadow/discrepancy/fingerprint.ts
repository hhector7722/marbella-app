import { createHash } from 'node:crypto';
import type { CanonicalComparableField } from '../types/canonical-vector.ts';
import type { DiscrepancyCode } from '../types/taxonomy.ts';

/**
 * Identidad estable de una discrepancia de migración.
 * Misma clave + código + campos → mismo fingerprint entre runs.
 */
export function buildDiscrepancyFingerprint(input: {
  employeeId: string;
  weekStart: string;
  discrepancyCode: DiscrepancyCode;
  affectedFields: readonly CanonicalComparableField[];
}): string {
  const fields = [...input.affectedFields].sort().join(',');
  const raw = [
    input.employeeId,
    input.weekStart,
    input.discrepancyCode,
    fields,
  ].join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}
