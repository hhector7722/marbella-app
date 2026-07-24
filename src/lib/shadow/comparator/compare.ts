import {
  CANONICAL_COMPARABLE_FIELDS,
  type CanonicalComparableField,
  type CanonicalComparisonVector,
} from '../types/canonical-vector.ts';

/** Diff bruto de un campo (sin taxonomía — el Classifier asigna D00x). */
export type RawCanonicalFieldDelta = {
  field: CanonicalComparableField;
  heValue: string | number | boolean | null;
  sqlValue: string | number | boolean | null;
  /** true si un lado es null y el otro no (hueco de esquema). */
  schemaGap: boolean;
  /** Distancia numérica si ambos son number; si no, null. */
  numericDelta: number | null;
  equal: boolean;
};

export type CanonicalCompareResult = {
  employeeId: string;
  weekStart: string;
  exact: boolean;
  deltas: readonly RawCanonicalFieldDelta[];
};

const DEFAULT_EPSILON = 1e-9;

function valuesEqual(
  a: string | number | boolean | null,
  b: string | number | boolean | null,
  epsilon: number,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= epsilon;
  }
  return a === b;
}

function readField(
  v: CanonicalComparisonVector,
  field: CanonicalComparableField,
): string | number | boolean | null {
  return v[field];
}

/**
 * Compara exclusivamente dos Canonical Comparison Vectors.
 * No conoce Hours Engine ni SQL.
 */
export function compareCanonicalVectors(
  he: CanonicalComparisonVector,
  sql: CanonicalComparisonVector,
  options?: { epsilon?: number },
): CanonicalCompareResult {
  if (he.employeeId !== sql.employeeId || he.weekStart !== sql.weekStart) {
    throw new Error(
      `shadow/comparator: subject mismatch HE(${he.employeeId},${he.weekStart}) SQL(${sql.employeeId},${sql.weekStart})`,
    );
  }
  if (he.source !== 'he' || sql.source !== 'sql') {
    throw new Error(
      `shadow/comparator: expected sources he+sql, got ${he.source}+${sql.source}`,
    );
  }

  const epsilon = options?.epsilon ?? DEFAULT_EPSILON;
  const deltas: RawCanonicalFieldDelta[] = [];

  for (const field of CANONICAL_COMPARABLE_FIELDS) {
    const heValue = readField(he, field);
    const sqlValue = readField(sql, field);
    const schemaGap =
      (heValue === null && sqlValue !== null) ||
      (heValue !== null && sqlValue === null);
    const equal = valuesEqual(heValue, sqlValue, epsilon);
    const numericDelta =
      typeof heValue === 'number' && typeof sqlValue === 'number'
        ? heValue - sqlValue
        : null;

    if (!equal) {
      deltas.push({
        field,
        heValue,
        sqlValue,
        schemaGap,
        numericDelta,
        equal: false,
      });
    }
  }

  return {
    employeeId: he.employeeId,
    weekStart: he.weekStart,
    exact: deltas.length === 0,
    deltas,
  };
}
