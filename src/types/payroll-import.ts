/**
 * DTOs e Interfaces SSOT para el Pipeline Oficial de Importación de Nóminas y Conciliación Contable.
 */

import type { SettlementType } from './payroll-facts.ts';

export type { SettlementType };

export type PayrollImportRecordInput = {
  userId?: string;
  dni?: string;
  email?: string;
  name?: string;
  periodYm: string; // Formato YYYY-MM
  settlementType?: SettlementType;
  grossSalary?: number;
  netSalary?: number;
  totalCompanyCost: number;
  companySocialSecurity?: number;
  workerSocialSecurity?: number;
  irpf?: number;
  documentId?: string;
};

export type IndividualPayrollImportInput = PayrollImportRecordInput;

export type PayrollBatchImportInput = {
  periodYm: string; // Formato YYYY-MM
  source?: string; // p.ej. 'pdf_extractor', 'excel_importer', 'gmail_summary'
  filename?: string;
  contentHash?: string; // Para deduplicación de lote
  records: PayrollImportRecordInput[];
  createdBy?: string;
};

export type EmployeeMatchResult = {
  matched: boolean;
  userId?: string | null;
  fullName?: string | null;
  dni?: string | null;
  email?: string | null;
  matchType?: 'id' | 'dni' | 'email' | 'name';
  matchMethod?: string;
  errorMessage?: string;
};

export type PayrollImportRecordResult = {
  userId?: string;
  rawIdentifier: string;
  status: 'imported' | 'updated' | 'unmatched_employee' | 'rejected_validation' | 'error';
  companyCost: number;
  settlementType: SettlementType;
  factId?: string;
  version?: number;
  message?: string;
};

export type PayrollImportReportDTO = {
  success: boolean;
  periodYm: string;
  totalRecordsInBatch: number;
  importedCount: number;
  updatedCount: number;
  failedCount: number;
  totalCompanyCost: number;
  monthlyTotalsUpserted: boolean;
  records: PayrollImportRecordResult[];
  validationMessages: string[];
  errors: string[];
};

export type PayrollReconciliationStatus =
  | 'NO_SUMMARY'
  | 'WAITING_PAYROLLS'
  | 'RECONCILED'
  | 'PENDING_RECONCILIATION';

export interface PayrollReconciliationSummaryDTO {
  status: PayrollReconciliationStatus;
  totalSummary: number; // Resumen gestoría (payroll_monthly_totals)
  totalPayrolls: number; // Suma nóminas individuales activas (employee_payroll_facts)
  difference: number; // totalSummary - totalPayrolls
  importedCount: number; // Trabajadores únicos con hechos activos importados
}
