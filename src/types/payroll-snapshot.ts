/**
 * Tipos de Dominio SSOT para el Modelo "PayrollMonthSnapshot".
 *
 * El PDF Resumen de gestoría es la única fuente de verdad inicial del mes.
 * El parser no escribe en BD; genera este objeto inmutable de dominio.
 */

export type SettlementClassification =
  | 'UNCLASSIFIED'
  | 'ORDINARY'
  | 'SETTLEMENT'
  | 'EXTRA_PAY'
  | 'BACKPAY'
  | 'ADJUSTMENT';

export type SettlementStatus = 'DISCOVERED' | 'MATCHED' | 'VALIDATED' | 'RECONCILED';

export type PayrollSettlementDTO = {
  rowIndex: number;
  employeeCode: string;
  employeeName: string;
  grossSalary: number;
  irpfBase: number;
  irpf: number; // withholding IRPF
  ccBase: number;
  atBase: number;
  ssEmployee: number;
  ssEmployer: number;
  tc1: number;
  companyCost: number;
  netSalary: number;
  settlementHash: string; // SHA256 determinista
  classification: SettlementClassification;
  status: SettlementStatus;
  userId?: string | null;
};

export type PayrollSnapshotTotalsDTO = {
  totalGross: number;
  totalBaseIRPF: number;
  totalWithholdingIRPF: number;
  totalBaseCC: number;
  totalBaseAT: number;
  totalSSEmployee: number;
  totalSSEmployer: number;
  totalTC1: number;
  totalCompanyCost: number; // COST TOTAL oficial empresa
  totalNet: number;
  totalWorkers?: number | null;
};

export type PayrollSnapshotHeaderDTO = {
  company: string;
  nif: string;
  periodStart: string;
  periodEnd: string;
  periodYm: string;
  listDate: string | null;
  center: string | null;
  totalWorkers: number | null;
};

export type PayrollSnapshotMetadataDTO = {
  contentHash: string;
  parserVersion: number;
  parsedAt: string;
  filename?: string | null;
  source?: string;
};

export type PayrollMonthSnapshot = {
  version: number;
  header: PayrollSnapshotHeaderDTO;
  settlements: PayrollSettlementDTO[];
  totals: PayrollSnapshotTotalsDTO;
  metadata: PayrollSnapshotMetadataDTO;
};

export type SnapshotValidationRuleId =
  | 'INV-01'
  | 'INV-02'
  | 'INV-03'
  | 'INV-04'
  | 'INV-05'
  | 'INV-06';

export type SnapshotValidationIssue = {
  ruleId: SnapshotValidationRuleId;
  message: string;
  expected?: any;
  actual?: any;
};

export type SnapshotValidationReport = {
  valid: boolean;
  issues: SnapshotValidationIssue[];
};
