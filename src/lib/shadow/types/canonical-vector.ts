/**
 * Canonical Comparison Vector — único modelo comparable en Shadow.
 *
 * HE Adapter y SQL Adapter proyectan hacia aquí.
 * El Comparator solo conoce este tipo (nunca LiquidationResult ni filas SQL).
 */

/** Identidad del sujeto de comparación (empleado × semana laboral). */
export type ShadowSubjectKey = {
  employeeId: string;
  /** Lunes civil YYYY-MM-DD (Europe/Madrid). */
  weekStart: string;
};

/**
 * Campos numéricos/semánticos alineados al mapa de paridad.
 * `null` = no disponible en el origen (candidato a D000 tras classify).
 */
export type CanonicalComparisonVector = ShadowSubjectKey & {
  /** Origen de la proyección (trazabilidad; no entra en igualdad de negocio). */
  source: 'he' | 'sql';

  computableHours: number | null;
  justifiedHours: number | null;
  physicalHours: number | null;

  contractedHoursEffective: number | null;
  regimeLabel: string | null;

  ordinaryHours: number | null;
  overtimeHours: number | null;

  carryIn: number | null;
  carryOut: number | null;
  weeklyBalance: number | null;
  balanceFinal: number | null;

  pendingHours: number | null;
  payableHours: number | null;
  compensatedHours: number | null;

  bagModeApplied: boolean | null;
  isPaid: boolean | null;

  otCost: number | null;
  laborCost: number | null;
};

/** Campos del vector que el Comparator puede confrontar. */
export const CANONICAL_COMPARABLE_FIELDS = [
  'computableHours',
  'justifiedHours',
  'physicalHours',
  'contractedHoursEffective',
  'regimeLabel',
  'ordinaryHours',
  'overtimeHours',
  'carryIn',
  'carryOut',
  'weeklyBalance',
  'balanceFinal',
  'pendingHours',
  'payableHours',
  'compensatedHours',
  'bagModeApplied',
  'isPaid',
  'otCost',
  'laborCost',
] as const;

export type CanonicalComparableField =
  (typeof CANONICAL_COMPARABLE_FIELDS)[number];

/**
 * Campos que solo generan delta si **ambos** lados tienen valor.
 * Evita D000 sistemático (p.ej. regimeLabel solo en HE).
 */
export const CANONICAL_OPTIONAL_COMPARE_FIELDS = [
  'justifiedHours',
  'physicalHours',
  'regimeLabel',
  'ordinaryHours',
  'overtimeHours',
  'otCost',
  'laborCost',
] as const satisfies readonly CanonicalComparableField[];
