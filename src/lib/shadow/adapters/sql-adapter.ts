import type { CanonicalComparisonVector } from '../types/canonical-vector.ts';

/**
 * Forma mínima de weekly_snapshots que el SQL Adapter conoce.
 * Definida en Shadow (no importa supabase types) para desacoplar el dominio.
 */
export type SqlWeeklySnapshotRow = {
  user_id?: string | null;
  week_start: string;
  total_hours?: number | null;
  balance_hours?: number | null;
  pending_balance?: number | null;
  final_balance?: number | null;
  contracted_hours_snapshot?: number | null;
  ordinary_hours?: number | null;
  extra_hours?: number | null;
  total_cost?: number | null;
  is_paid?: boolean | null;
  prefer_stock_hours_override?: boolean | null;
};

export type SqlAdapterSnapshotInput = {
  employeeId: string;
  weekStart: string;
  snapshot: SqlWeeklySnapshotRow;
  /**
   * Preferencia de bolsa del perfil si override es null.
   * Si no se aporta y override es null → bagModeApplied = null (D000).
   */
  profilePreferStock?: boolean | null;
};

function asCivilDate(weekStart: string): string {
  return weekStart.includes('T') ? weekStart.split('T')[0]! : weekStart;
}

function resolveBagMode(
  override: boolean | null | undefined,
  profilePreferStock: boolean | null | undefined,
): boolean | null {
  if (override === true) return true;
  if (override === false) return false;
  if (profilePreferStock === true) return true;
  if (profilePreferStock === false) return false;
  return null;
}

/**
 * CarryOut canónico desde hechos SQL (no hay columna `carry_out`).
 *
 * Equivalente funcional a lo que `fn_recalc` pondría en `pending_balance`
 * de la semana siguiente a partir de este `final_balance`:
 * - crédito (`final > 0`): solo arrastra si Bolsa y semana no pagada;
 * - deuda / cero: arrastra siempre.
 *
 * Así se alinea con HE `carryOut` (modo Pago → crédito liquidado = 0).
 * Si el modo bolsa no se puede resolver y hay crédito → `null` (no inventar).
 */
export function projectSqlCarryOut(input: {
  finalBalance: number | null;
  bagMode: boolean | null;
  isPaid: boolean | null;
}): number | null {
  const { finalBalance, bagMode, isPaid } = input;
  if (finalBalance === null) return null;
  if (finalBalance > 0) {
    if (bagMode === null) return null;
    const paid = isPaid === true;
    if (bagMode && !paid) return finalBalance;
    return 0;
  }
  return finalBalance;
}

/**
 * Proyecta weekly_snapshots → CanonicalComparisonVector.
 *
 * - overtimeHours ← extra_hours si informado; si no, null (no inventar).
 * - balanceFinal ← final_balance (saldo contable de la semana).
 * - carryOut ← proyección de arrastre a W+1 (regla pending de fn_recalc),
 *   no el final_balance crudo (bug Fernando / modo Pago).
 */
export function sqlSnapshotToCanonical(
  input: SqlAdapterSnapshotInput,
): CanonicalComparisonVector {
  const row = input.snapshot;
  const weekStart = asCivilDate(input.weekStart);
  const rowWeek = asCivilDate(String(row.week_start));
  if (rowWeek !== weekStart) {
    throw new Error(
      `shadow/sql-adapter: weekStart mismatch (${weekStart} vs ${rowWeek})`,
    );
  }
  if (row.user_id && row.user_id !== input.employeeId) {
    throw new Error(
      `shadow/sql-adapter: employeeId mismatch (${input.employeeId} vs ${row.user_id})`,
    );
  }

  const bagMode = resolveBagMode(
    row.prefer_stock_hours_override,
    input.profilePreferStock,
  );
  const finalBal =
    row.final_balance === undefined || row.final_balance === null
      ? null
      : Number(row.final_balance);
  const pending =
    row.pending_balance === undefined || row.pending_balance === null
      ? null
      : Number(row.pending_balance);
  const weeklyBal =
    row.balance_hours === undefined || row.balance_hours === null
      ? null
      : Number(row.balance_hours);

  const extraExplicit =
    row.extra_hours === undefined || row.extra_hours === null
      ? null
      : Number(row.extra_hours);

  const ordinary =
    row.ordinary_hours === undefined || row.ordinary_hours === null
      ? null
      : Number(row.ordinary_hours);

  const totalCost =
    row.total_cost === undefined || row.total_cost === null
      ? null
      : Number(row.total_cost);

  const isPaid = row.is_paid ?? null;
  const carryOut = projectSqlCarryOut({
    finalBalance: finalBal,
    bagMode,
    isPaid,
  });

  /** En SQL, total_cost > 0 implica horas cobrables; no hay campo payable hours. */
  const payableHours =
    bagMode === true
      ? 0
      : totalCost !== null && totalCost > 0 && finalBal !== null
        ? Math.max(0, finalBal)
        : bagMode === false && finalBal !== null
          ? Math.max(0, finalBal)
          : null;

  const compensatedHours =
    bagMode === true && finalBal !== null ? Math.max(0, finalBal) : bagMode === false ? 0 : null;

  return {
    employeeId: input.employeeId,
    weekStart,
    source: 'sql',
    computableHours:
      row.total_hours === undefined || row.total_hours === null
        ? null
        : Number(row.total_hours),
    justifiedHours: null,
    physicalHours: null,
    contractedHoursEffective:
      row.contracted_hours_snapshot === undefined ||
      row.contracted_hours_snapshot === null
        ? null
        : Number(row.contracted_hours_snapshot),
    regimeLabel: null,
    ordinaryHours: ordinary,
    overtimeHours: extraExplicit,
    carryIn: pending,
    carryOut,
    weeklyBalance: weeklyBal,
    balanceFinal: finalBal,
    pendingHours: pending,
    payableHours,
    compensatedHours,
    bagModeApplied: bagMode,
    isPaid,
    otCost: totalCost,
    laborCost: null,
  };
}

export type SqlAdapter = {
  toCanonical(input: SqlAdapterSnapshotInput): CanonicalComparisonVector;
};

export function createSqlAdapter(): SqlAdapter {
  return { toCanonical: sqlSnapshotToCanonical };
}

/** @deprecated stub Commit 1 */
export function createSqlAdapterStub(): SqlAdapter {
  return {
    toCanonical() {
      throw new Error(
        'shadow/adapters: use createSqlAdapter() (Commit 2 implementado)',
      );
    },
  };
}

export type SqlAdapterInput = SqlAdapterSnapshotInput;
