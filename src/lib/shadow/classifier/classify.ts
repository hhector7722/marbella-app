import type { CanonicalComparableField } from '../types/canonical-vector.ts';
import type { ShadowFieldDiff } from '../types/field-diff.ts';
import type {
  DiscrepancyCode,
  DiscrepancyOwnerDomain,
  DiscrepancySeverity,
} from '../types/taxonomy.ts';
import type { RawCanonicalFieldDelta } from '../comparator/compare.ts';
import type { CanonicalCompareResult } from '../comparator/compare.ts';

const HOURS_INPUT_FIELDS = new Set<CanonicalComparableField>([
  'computableHours',
  'justifiedHours',
  'physicalHours',
]);

const CONTRACT_FIELDS = new Set<CanonicalComparableField>([
  'contractedHoursEffective',
  'regimeLabel',
]);

const CARRY_FIELDS = new Set<CanonicalComparableField>([
  'carryIn',
  'carryOut',
  'pendingHours',
]);

const WATERFALL_FIELDS = new Set<CanonicalComparableField>([
  'payableHours',
  'compensatedHours',
  'bagModeApplied',
  'isPaid',
  'weeklyBalance',
  'balanceFinal',
]);

const OT_FIELDS = new Set<CanonicalComparableField>([
  'ordinaryHours',
  'overtimeHours',
]);

const COST_FIELDS = new Set<CanonicalComparableField>([
  'otCost',
  'laborCost',
]);

/** ε Marbella horas (.0/.5) — diffs menores se etiquetan D004. */
export const ROUNDING_EPSILON_HOURS = 0.05;

export type ClassifiedFieldDiff = ShadowFieldDiff & {
  owner: DiscrepancyOwnerDomain;
};

export type ClassifyCompareResult = {
  employeeId: string;
  weekStart: string;
  exact: boolean;
  fieldDiffs: readonly ClassifiedFieldDiff[];
  /** Código primario (mayor severidad / primero crítico). */
  primaryCode: DiscrepancyCode | null;
};

function severityFor(code: DiscrepancyCode): DiscrepancySeverity {
  switch (code) {
    case 'D000':
      return 'HIGH';
    case 'D001':
    case 'D002':
    case 'D003':
    case 'D005':
    case 'D006':
    case 'D007':
    case 'D009':
    case 'D014':
      return 'CRITICAL';
    case 'D008':
    case 'D010':
    case 'D011':
    case 'D012':
    case 'D017':
      return 'HIGH';
    case 'D004':
    case 'D013':
      return 'MEDIUM';
    case 'D015':
    case 'D016':
      return 'LOW';
    default:
      return 'HIGH';
  }
}

function ownerFor(code: DiscrepancyCode): DiscrepancyOwnerDomain {
  switch (code) {
    case 'D001':
      return 'Contract';
    case 'D002':
      return 'Liquidation';
    case 'D003':
      return 'Attendance';
    case 'D004':
    case 'D005':
    case 'D007':
      return 'Liquidation';
    case 'D006':
    case 'D015':
    case 'D016':
      return 'Architecture';
    case 'D008':
      return 'Contract';
    case 'D009':
    case 'D011':
    case 'D014':
      return 'Infra';
    case 'D012':
      return 'Payroll';
    case 'D000':
      return 'Infra';
    default:
      return 'Unknown';
  }
}

/**
 * Asigna taxonomía D000–D017 a un delta de campo.
 * Heurística de migración (no “verdad de negocio”): prioriza schema gap,
 * luego familia de campo, luego redondeo.
 */
export function classifyFieldDelta(
  delta: RawCanonicalFieldDelta,
): ClassifiedFieldDiff {
  let code: DiscrepancyCode;

  if (delta.schemaGap) {
    code = 'D000';
  } else if (
    delta.numericDelta !== null &&
    Math.abs(delta.numericDelta) > 0 &&
    Math.abs(delta.numericDelta) <= ROUNDING_EPSILON_HOURS &&
    (HOURS_INPUT_FIELDS.has(delta.field) ||
      OT_FIELDS.has(delta.field) ||
      CARRY_FIELDS.has(delta.field) ||
      WATERFALL_FIELDS.has(delta.field) ||
      CONTRACT_FIELDS.has(delta.field))
  ) {
    code = 'D004';
  } else if (HOURS_INPUT_FIELDS.has(delta.field)) {
    code = 'D003';
  } else if (CONTRACT_FIELDS.has(delta.field)) {
    code = delta.field === 'regimeLabel' ? 'D007' : 'D001';
  } else if (CARRY_FIELDS.has(delta.field)) {
    code = 'D002';
  } else if (WATERFALL_FIELDS.has(delta.field)) {
    code = delta.field === 'isPaid' || delta.field === 'bagModeApplied'
      ? 'D010'
      : 'D005';
  } else if (OT_FIELDS.has(delta.field)) {
    // Diff de OT/ordinarias con ambos valores presentes: posible alias semántico
    // o política — se etiqueta D006 si SQL tenía null en overtime y ahora no aplica;
    // con ambos números: D007 familia régimen/liquidación → usamos D006 como
    // “mismo concepto distinto significado/cálculo” hasta investigación.
    code = 'D006';
  } else if (COST_FIELDS.has(delta.field)) {
    code = delta.field === 'laborCost' ? 'D015' : 'D012';
  } else {
    code = 'D017';
  }

  return {
    field: delta.field,
    heValue: delta.heValue,
    sqlValue: delta.sqlValue,
    discrepancyCode: code,
    severity: severityFor(code),
    epsilonApplied:
      code === 'D004' ? ROUNDING_EPSILON_HOURS : null,
    owner: ownerFor(code),
  };
}

const SEVERITY_RANK: Record<DiscrepancySeverity, number> = {
  CRITICAL: 4,
  HIGH: 3,
  MEDIUM: 2,
  LOW: 1,
};

/**
 * Clasifica el resultado completo del Comparator.
 * Nunca persiste: solo produce field diffs tipificados.
 */
export function classifyCompareResult(
  result: CanonicalCompareResult,
): ClassifyCompareResult {
  if (result.exact) {
    return {
      employeeId: result.employeeId,
      weekStart: result.weekStart,
      exact: true,
      fieldDiffs: [],
      primaryCode: null,
    };
  }

  const fieldDiffs = result.deltas.map(classifyFieldDelta);
  let primary: ClassifiedFieldDiff | null = null;
  for (const d of fieldDiffs) {
    if (
      !primary ||
      SEVERITY_RANK[d.severity] > SEVERITY_RANK[primary.severity]
    ) {
      primary = d;
    }
  }

  return {
    employeeId: result.employeeId,
    weekStart: result.weekStart,
    exact: false,
    fieldDiffs,
    primaryCode: primary?.discrepancyCode ?? 'D017',
  };
}
