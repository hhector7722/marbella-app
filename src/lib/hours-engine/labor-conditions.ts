/**
 * Condiciones laborales — formulario ↔ snapshot contractual.
 * Fecha efectiva editable (Europe/Madrid); splice histórico en el planificador.
 */

import type { CivilDate, ContractRegime, ContractTermFact } from './types.ts';
import type { ContractualSnapshot } from './contract-terms-versioning.ts';
import {
  findTermContaining,
  snapshotsEqual,
  termToSnapshot,
} from './contract-terms-versioning.ts';

const CIVIL_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export type LaborConditionsFormInput = {
  weeklyHours: number;
  regime: ContractRegime;
  bagMode: boolean;
  overtimeRatePerHour: number | null;
  /** YYYY-MM-DD; por defecto la action usa hoy Madrid si falta. */
  effectiveFrom?: string;
};

export type ProfileContractMirror = {
  contracted_hours_weekly: number;
  prefer_stock_hours: boolean;
  is_fixed_salary: boolean;
  overtime_cost_per_hour: number | null;
  role: string;
};

export function parseCivilYmd(raw: string): CivilDate | null {
  const m = CIVIL_YMD.exec(String(raw || '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) {
    return null;
  }
  return `${m[1]}-${m[2]}-${m[3]}`;
}

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

/** Noop respecto al tramo que contiene la fecha efectiva. */
export function laborChangeIsNoopAt(
  terms: readonly ContractTermFact[],
  next: ContractualSnapshot,
  effectiveFrom: CivilDate,
): boolean {
  const t = findTermContaining(terms, effectiveFrom);
  if (!t) return false;
  return snapshotsEqual(termToSnapshot(t), next);
}

/** @deprecated Preferir laborChangeIsNoopAt con fecha efectiva. */
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
