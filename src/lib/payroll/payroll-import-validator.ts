import type { IndividualPayrollImportInput, PayrollBatchImportInput } from '@/types/payroll-import';

export interface ValidationIssue {
  recordIndex?: number;
  field?: string;
  message: string;
  fatal: boolean;
}

export class PayrollImportValidator {
  /**
   * Valida un registro individual del lote
   */
  static validateRecord(record: IndividualPayrollImportInput, index: number): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    // 1. Period YM
    if (!record.periodYm || !/^\d{4}-(0[1-9]|1[0-2])$/.test(record.periodYm)) {
      issues.push({
        recordIndex: index,
        field: 'periodYm',
        message: `Periodo inválido '${record.periodYm}'. Debe ser 'YYYY-MM'`,
        fatal: true,
      });
    }

    // 2. Total Company Cost
    if (typeof record.totalCompanyCost !== 'number' || Number.isNaN(record.totalCompanyCost)) {
      issues.push({
        recordIndex: index,
        field: 'totalCompanyCost',
        message: `Coste empresa no es un número válido: ${record.totalCompanyCost}`,
        fatal: true,
      });
    } else if (record.totalCompanyCost < 0) {
      issues.push({
        recordIndex: index,
        field: 'totalCompanyCost',
        message: `Coste empresa no puede ser negativo: ${record.totalCompanyCost} €`,
        fatal: true,
      });
    }

    // 3. Importes opcionales no negativos
    const checkPositive = (val: number | null | undefined, name: string) => {
      if (val !== null && val !== undefined) {
        if (typeof val !== 'number' || Number.isNaN(val) || val < 0) {
          issues.push({
            recordIndex: index,
            field: name,
            message: `${name} no puede ser un número negativo (${val})`,
            fatal: true,
          });
        }
      }
    };

    checkPositive(record.grossSalary, 'salarioBruto');
    checkPositive(record.netSalary, 'salarioNeto');
    checkPositive(record.companySocialSecurity, 'seguridadSocialEmpresa');
    checkPositive(record.workerSocialSecurity, 'seguridadSocialTrabajador');
    checkPositive(record.irpf, 'irpf');

    // 4. Coherencia financiera basica
    if (
      typeof record.totalCompanyCost === 'number' &&
      record.totalCompanyCost > 0 &&
      typeof record.grossSalary === 'number' &&
      record.grossSalary > 0
    ) {
      if (record.totalCompanyCost < record.grossSalary) {
        issues.push({
          recordIndex: index,
          field: 'totalCompanyCost',
          message: `Inconsistencia financiera: coste empresa (${record.totalCompanyCost} €) es menor que el salario bruto (${record.grossSalary} €)`,
          fatal: false, // Advertencia no fatal
        });
      }
    }

    return issues;
  }

  /**
   * Valida el lote completo garantizando no duplicidad dentro del lote
   */
  static validateBatch(batch: PayrollBatchImportInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];

    if (!batch.periodYm || !/^\d{4}-(0[1-9]|1[0-2])$/.test(batch.periodYm)) {
      issues.push({
        message: `Periodo del lote inválido: '${batch.periodYm}'`,
        fatal: true,
      });
    }

    if (!batch.records || batch.records.length === 0) {
      issues.push({
        message: 'El lote de nóminas está vacío (0 registros)',
        fatal: true,
      });
      return issues;
    }

    // Verificar duplicidad dentro del mismo lote (por userId + settlementType o por DNI)
    const seenKeys = new Set<string>();

    batch.records.forEach((record, index) => {
      const recordIssues = this.validateRecord(record, index);
      issues.push(...recordIssues);

      const key = `${record.userId || record.dni || record.email || record.name}_${record.settlementType || 'ordinary'}`;
      if (seenKeys.has(key)) {
        issues.push({
          recordIndex: index,
          message: `Registro duplicado dentro del mismo lote para el trabajador: ${key}`,
          fatal: true,
        });
      } else {
        seenKeys.add(key);
      }
    });

    return issues;
  }
}
