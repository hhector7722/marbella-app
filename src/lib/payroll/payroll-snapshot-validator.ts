/**
 * Validador de Invariantes del Modelo PayrollMonthSnapshot.
 *
 * Ejecuta las 6 validaciones obligatorias antes de cualquier persistencia:
 * INV-01: Suma companyCost === totals.totalCompanyCost (tolerancia 0.01 €).
 * INV-02: Suma grossSalary === totals.totalGross (tolerancia 0.01 €).
 * INV-03: Número de liquidaciones === header.totalWorkers (si totalWorkers existe).
 * INV-04: Periodo único coherente.
 * INV-05: Ningún Settlement sin employeeCode.
 * INV-06: Todos los settlementHash deben ser únicos dentro del snapshot.
 */

import type {
  PayrollMonthSnapshot,
  SnapshotValidationIssue,
  SnapshotValidationReport,
} from '../../types/payroll-snapshot.ts';

export class PayrollSnapshotValidator {
  /**
   * Valida un objeto PayrollMonthSnapshot contra las 6 invariantes de dominio.
   */
  static validate(snapshot: PayrollMonthSnapshot): SnapshotValidationReport {
    const issues: SnapshotValidationIssue[] = [];

    // INV-01: Suma companyCost === totals.totalCompanyCost (tolerancia 0.01 €)
    const sumCompanyCost = snapshot.settlements.reduce((acc, s) => acc + s.companyCost, 0);
    const sumCompanyCostRounded = Math.round(sumCompanyCost * 100) / 100;
    const totalCompanyCostRounded = Math.round(snapshot.totals.totalCompanyCost * 100) / 100;
    if (Math.abs(sumCompanyCostRounded - totalCompanyCostRounded) > 0.01) {
      issues.push({
        ruleId: 'INV-01',
        message: `INV-01 Fallida: Suma de coste empresa de liquidaciones (${sumCompanyCostRounded} €) ≠ COST TOTAL (${totalCompanyCostRounded} €)`,
        expected: totalCompanyCostRounded,
        actual: sumCompanyCostRounded,
      });
    }

    // INV-02: Suma grossSalary === totals.totalGross (tolerancia 0.01 €)
    const sumGross = snapshot.settlements.reduce((acc, s) => acc + s.grossSalary, 0);
    const sumGrossRounded = Math.round(sumGross * 100) / 100;
    const totalGrossRounded = Math.round(snapshot.totals.totalGross * 100) / 100;
    if (Math.abs(sumGrossRounded - totalGrossRounded) > 0.01) {
      issues.push({
        ruleId: 'INV-02',
        message: `INV-02 Fallida: Suma de salarios brutos (${sumGrossRounded} €) ≠ BRUT TOTAL (${totalGrossRounded} €)`,
        expected: totalGrossRounded,
        actual: sumGrossRounded,
      });
    }

    // INV-03: Número de trabajadores / liquidaciones === header.totalWorkers
    if (
      snapshot.header.totalWorkers != null &&
      snapshot.header.totalWorkers > 0 &&
      snapshot.settlements.length !== snapshot.header.totalWorkers
    ) {
      issues.push({
        ruleId: 'INV-03',
        message: `INV-03 Fallida: Número de liquidaciones (${snapshot.settlements.length}) ≠ TOTAL TRABAJADORES (${snapshot.header.totalWorkers})`,
        expected: snapshot.header.totalWorkers,
        actual: snapshot.settlements.length,
      });
    }

    // INV-04: Periodo único
    if (!snapshot.header.periodYm || !/^\d{4}-\d{2}$/.test(snapshot.header.periodYm)) {
      issues.push({
        ruleId: 'INV-04',
        message: `INV-04 Fallida: Formato de periodo YM inválido (${snapshot.header.periodYm})`,
        expected: 'YYYY-MM',
        actual: snapshot.header.periodYm,
      });
    }

    // INV-05: Ningún Settlement sin employeeCode
    const invalidCodes = snapshot.settlements.filter((s) => !s.employeeCode || !s.employeeCode.trim());
    if (invalidCodes.length > 0) {
      issues.push({
        ruleId: 'INV-05',
        message: `INV-05 Fallida: Se encontraron ${invalidCodes.length} liquidaciones sin employeeCode`,
        expected: 0,
        actual: invalidCodes.length,
      });
    }

    // INV-06: Todos los settlementHash únicos
    const hashesSeen = new Set<string>();
    const duplicateHashes: string[] = [];
    for (const s of snapshot.settlements) {
      if (hashesSeen.has(s.settlementHash)) {
        duplicateHashes.push(s.settlementHash);
      } else {
        hashesSeen.add(s.settlementHash);
      }
    }
    if (duplicateHashes.length > 0) {
      issues.push({
        ruleId: 'INV-06',
        message: `INV-06 Fallida: Se encontraron ${duplicateHashes.length} hashes de liquidación duplicados`,
        expected: 0,
        actual: duplicateHashes.length,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }
}
