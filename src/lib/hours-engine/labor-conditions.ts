/**
 * Condiciones laborales (v1) — formulario ↔ snapshot contractual.
 * Sin fecha efectiva libre: siempre hoy Madrid en la action.
 */

import type { ContractRegime, ContractTermFact } from './types.ts';
import type { ContractualSnapshot } from './contract-terms-versioning.ts';
import { snapshotsEqual, termToSnapshot } from './contract-terms-versioning.ts';

export type LaborConditionsFormInput = {
  weeklyHours: number;
  regime: ContractRegime;
  bagMode: boolean;
  overtimeRatePerHour: number | null;
};

export type ProfileContractMirror = {
  contracted_hours_weekly: number;
  prefer_stock_hours: boolean;
  is_fixed_salary: boolean;
  overtime_cost_per_hour: number | null;
  role: string;
};

export function validateLaborConditionsForm(
  input: LaborConditionsFormInput,
): { ok: true; snapshot: ContractualSnapshot } | { ok: false; error: string } {
  if (!Number.isFinite(input.weeklyHours) || input.weeklyHours < 0) {
    return { ok: false, error: 'Las horas semanales no pueden ser negativas' };
  }
  if (
    input.overtimeRatePerHour != null &&
    (!Number.isFinite(input.overtimeRatePerHour) || input.overtimeRatePerHour < 0)
  ) {
    return { ok: false, error: 'La tarifa de extras no puede ser negativa' };
  }
  if (input.regime !== 'staff' && input.regime !== 'manager' && input.regime !== 'fixed') {
    return { ok: false, error: 'Régimen no válido' };
  }

  const weeklyHours =
    input.regime === 'manager' || input.regime === 'fixed' ? 0 : Number(input.weeklyHours);

  if (input.regime === 'staff' && weeklyHours < 0) {
    return { ok: false, error: 'Las horas semanales no pueden ser negativas' };
  }

  return {
    ok: true,
    snapshot: {
      weeklyHours,
      bagMode: !!input.bagMode,
      regime: input.regime,
      overtimeRatePerHour:
        input.overtimeRatePerHour == null ? null : Number(input.overtimeRatePerHour),
    },
  };
}

/** Espejo en profiles para legacy (sin inventar columnas). */
export function snapshotToProfileMirror(
  snapshot: ContractualSnapshot,
  currentRole: string,
): ProfileContractMirror {
  const role =
    snapshot.regime === 'manager'
      ? 'manager'
      : currentRole === 'manager'
        ? 'staff'
        : currentRole || 'staff';

  return {
    contracted_hours_weekly: snapshot.weeklyHours,
    prefer_stock_hours: snapshot.bagMode,
    is_fixed_salary: snapshot.regime === 'fixed',
    overtime_cost_per_hour: snapshot.overtimeRatePerHour,
    role,
  };
}

export function openTermSnapshot(
  terms: readonly ContractTermFact[],
): ContractualSnapshot | null {
  const open = [...terms]
    .filter((t) => t.effectiveTo === null)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .at(-1);
  return open ? termToSnapshot(open) : null;
}

export function laborChangeIsNoop(
  terms: readonly ContractTermFact[],
  next: ContractualSnapshot,
): boolean {
  const current = openTermSnapshot(terms);
  if (!current) return false;
  return snapshotsEqual(current, next);
}

export function regimeLabel(regime: ContractRegime): string {
  if (regime === 'manager') return 'Manager';
  if (regime === 'fixed') return 'Salario fijo';
  return 'Staff';
}

export function bagLabel(bagMode: boolean): string {
  return bagMode ? 'Bolsa de horas' : 'Pago mensual';
}
