/**
/**
 * Tipos DTO e interfaces para el Pipeline Oficial de Importación de Nóminas (SSOT)
 */

export type PayrollSettlementType = 'ordinary' | 'complementary' | 'severance' | 'adjustment';

export type PayrollImportRecordStatus =
  | 'imported'
  | 'updated'
  | 'skipped_duplicate'
  | 'rejected_validation'
  | 'unmatched_employee'
  | 'error';

/**
 * Datos individuales de nómina extraídos por empleado
 */
export interface IndividualPayrollImportInput {
  userId?: string | null;
  dni?: string | null;
  email?: string | null;
  name?: string | null;
  periodYm: string; // Formato 'YYYY-MM'
  settlementType?: PayrollSettlementType;
  grossSalary?: number | null;
  netSalary?: number | null;
  totalCompanyCost: number;
  companySocialSecurity?: number | null;
  workerSocialSecurity?: number | null;
  irpf?: number | null;
  documentId?: string | null;
}

/**
 * Lote de nóminas de un periodo determinado
 */
export interface PayrollBatchImportInput {
  periodYm: string;
  source?: string;
  filename?: string;
  contentHash?: string;
  createdBy?: string | null;
  records: IndividualPayrollImportInput[];
}

/**
 * Resultado de la coincidencia y resolución de un trabajador contra `profiles`
 */
export interface EmployeeMatchResult {
  matched: boolean;
  userId: string | null;
  fullName: string | null;
  dni: string | null;
  email: string | null;
  matchMethod: 'userId' | 'dni' | 'email' | 'fullName' | 'none';
  errorMessage?: string;
}

/**
 * Resultado individual de procesar un registro del lote
 */
export interface PayrollImportRecordResult {
  userId?: string | null;
  rawIdentifier: string;
  status: PayrollImportRecordStatus;
  companyCost: number;
  settlementType: PayrollSettlementType;
  message?: string;
  factId?: string;
  version?: number;
}

/**
 * Informe final del Pipeline de Importación SSOT
 */
export interface PayrollImportReportDTO {
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
}
