import type { ShadowMetrics } from './metrics.ts';
import type { DiscrepancySeverity } from './taxonomy.ts';

export type ShadowReportRisk = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ShadowDailyReport = {
  runId: string;
  generatedAt: string;
  semaphore: 'GREEN' | 'AMBER' | 'RED';
  executiveSummary: string;
  metrics: ShadowMetrics;
  alerts: readonly ShadowReportAlertLine[];
  recommendation: string;
  globalRisk: ShadowReportRisk;
};

export type ShadowReportAlertLine = {
  severity: DiscrepancySeverity;
  message: string;
  discrepancyId?: string;
};
