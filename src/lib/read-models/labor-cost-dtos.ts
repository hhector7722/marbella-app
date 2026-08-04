/**
 * DTOs inmutables para los Read Models del Coste Laboral SSOT V2 (FASE 4).
 *
 * Exclusivamente dedicados a la proyección y transferencia de datos a la UI.
 * Ningún objeto anónimo. Todo fuertemente tipado.
 */

import type { PayrollReconciliationReportDTO } from '../payroll/payroll-reconciliation-service.ts';

export type WorkerLaborCostDTO = {
  id: string;
  name: string;
  fixed: number;
  overtime: number;
  total: number;
  laborPctOfSales: number | null;
  hasActivity: boolean;
  hasActiveContract: boolean;
  isEventual: boolean;
};

export type LaborCostDayDTO = {
  dateYmd: string;
  netSales: number;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  laborPctOfSales: number | null;
  isPayrollPending: boolean;
  pctStatus: 'complete' | 'incomplete_payroll_pending' | 'no_sales';
  workers: WorkerLaborCostDTO[];
  reconciliation: PayrollReconciliationReportDTO | null;
};

export type LaborCostMonthSummaryDTO = {
  periodYm: string;
  byDate: Record<
    string,
    {
      totalCost: number;
      totalFixed: number;
      totalOvertime: number;
      total?: number;
      fixed?: number;
      overtime?: number;
      laborPctOfSales: number | null;
    }
  >;
  totalFixed: number;
  totalOvertime: number;
  totalCost: number;
  isPayrollPending: boolean;
  missingPayrollMonths: string[];
};

export type ReadModelComparisonReport = {
  legacyTotalCost: number;
  v2TotalCost: number;
  legacyFixed: number;
  v2Fixed: number;
  legacyOvertime: number;
  v2Overtime: number;
  isMatch: boolean;
  discrepancies: string[];
};
