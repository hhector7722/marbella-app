/**
 * Orquestador de Pipeline para Lotes de Importación de Nóminas (SSOT).
 *
 * Utiliza exclusivamente el modelo de hechos atómicos y delega la persistencia
 * de totales en el servicio unificado PayrollSnapshotPersistenceService.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PayrollBatchImportInput,
  PayrollImportReportDTO,
  PayrollImportRecordResult,
} from '@/types/payroll-import';
import { PayrollEmployeeNormalizer } from './payroll-employee-normalizer.ts';
import { PayrollImportValidator } from './payroll-import-validator.ts';
import { PayrollFactWriteModel } from './payroll-write-model.ts';
import { ContractTermsService } from './contract-terms-service.ts';
import { PAYROLL_SUMMARY_PARSER_VERSION } from './company-summary-parser.ts';

export class PayrollImportPipeline {
  private readonly normalizer: PayrollEmployeeNormalizer;
  private readonly writeModel: PayrollFactWriteModel;

  constructor(
    private readonly supabase: SupabaseClient,
    normalizer?: PayrollEmployeeNormalizer,
    writeModel?: PayrollFactWriteModel,
  ) {
    this.normalizer = normalizer ?? new PayrollEmployeeNormalizer(supabase);
    this.writeModel = writeModel ?? new PayrollFactWriteModel(supabase);
  }

  /**
   * Ejecuta el pipeline completo de importación de nóminas SSOT
   */
  async execute(batch: PayrollBatchImportInput): Promise<PayrollImportReportDTO> {
    const report: PayrollImportReportDTO = {
      success: false,
      periodYm: batch.periodYm,
      totalRecordsInBatch: batch.records.length,
      importedCount: 0,
      updatedCount: 0,
      failedCount: 0,
      totalCompanyCost: 0,
      monthlyTotalsUpserted: false,
      records: [],
      validationMessages: [],
      errors: [],
    };

    // 1. Validar el lote
    const batchIssues = PayrollImportValidator.validateBatch(batch);
    const fatalIssues = batchIssues.filter((i) => i.fatal);
    batchIssues.forEach((issue) => {
      const msg = `[Lote] ${issue.message}`;
      report.validationMessages.push(msg);
      if (issue.fatal) report.errors.push(msg);
    });

    if (fatalIssues.length > 0) {
      report.success = false;
      return report;
    }

    // 2. Inicializar normalizador de empleados
    try {
      await this.normalizer.initialize();
    } catch (err: any) {
      report.errors.push(`Fallo inicializando normalizador de plantilla: ${err.message}`);
      return report;
    }

    // 3. Procesar cada registro individual de nómina
    const recordResults: PayrollImportRecordResult[] = [];

    for (let i = 0; i < batch.records.length; i++) {
      const rec = batch.records[i]!;
      const recordIssues = PayrollImportValidator.validateRecord(rec, i);
      const recordFatal = recordIssues.filter((is) => is.fatal);

      const rawId = rec.userId || rec.dni || rec.email || rec.name || `Fila #${i + 1}`;
      const settlementType = rec.settlementType ?? 'ordinary';

      if (recordFatal.length > 0) {
        report.failedCount++;
        recordResults.push({
          rawIdentifier: rawId,
          status: 'rejected_validation',
          companyCost: rec.totalCompanyCost ?? 0,
          settlementType,
          message: recordFatal.map((f) => f.message).join('; '),
        });
        continue;
      }

      // Matchear trabajador
      const match = this.normalizer.matchCandidate({
        userId: rec.userId,
        dni: rec.dni,
        email: rec.email,
        name: rec.name,
      });

      if (!match.matched || !match.userId) {
        report.failedCount++;
        recordResults.push({
          rawIdentifier: rawId,
          status: 'unmatched_employee',
          companyCost: rec.totalCompanyCost,
          settlementType,
          message: match.errorMessage || 'No se pudo resolver a un usuario de profiles',
        });
        continue;
      }

      // Escribir hecho contable de forma atómica (vía RPC record_payroll_fact_atomic con fallback nativo)
      try {
        const writeResult = await this.writeModel.recordPayrollFact({
          user_id: match.userId,
          period_ym: batch.periodYm,
          settlement_type: settlementType,
          total_company_cost: rec.totalCompanyCost,
          document_id: rec.documentId ?? null,
          created_by: batch.createdBy ?? null,
        });

        if (!writeResult.success) {
          throw new Error(writeResult.error || 'Fallo transaccional en Write Model');
        }

        const isUpdate = writeResult.version > 1;
        if (isUpdate) {
          report.updatedCount++;
        } else {
          report.importedCount++;
        }

        recordResults.push({
          userId: match.userId,
          rawIdentifier: `${match.fullName || match.userId} (${match.userId})`,
          status: isUpdate ? 'updated' : 'imported',
          companyCost: rec.totalCompanyCost,
          settlementType,
          factId: writeResult.factId,
          version: writeResult.version,
        });
      } catch (err: any) {
        report.failedCount++;
        recordResults.push({
          userId: match.userId,
          rawIdentifier: rawId,
          status: 'error',
          companyCost: rec.totalCompanyCost,
          settlementType,
          message: `Error de persistencia atómica: ${err.message}`,
        });
      }
    }

    report.records = recordResults;

    // 4. Si se procesó al menos 1 registro exitosamente, recalcular total del mes y UPSERT en payroll_monthly_totals
    const successfulRecords = recordResults.filter(
      (r) => r.status === 'imported' || r.status === 'updated',
    );

    if (successfulRecords.length > 0) {
      try {
        // Cargar la suma real de todos los hechos activos del periodo
        const { data: activeFacts, error: factsErr } = await this.supabase
          .from('employee_payroll_facts')
          .select('total_company_cost')
          .eq('period_ym', batch.periodYm)
          .eq('status', 'active');

        if (factsErr) {
          throw new Error(`Error calculando acumulado de hechos activos: ${factsErr.message}`);
        }

        const totalMonthCost = (activeFacts ?? []).reduce(
          (acc, f) => acc + (Number(f.total_company_cost) || 0),
          0,
        );

        report.totalCompanyCost = Number(totalMonthCost.toFixed(2));

        const monthDays = ContractTermsService.listMonthDays(batch.periodYm);
        const periodStart = monthDays[0]!;
        const periodEnd = monthDays[monthDays.length - 1]!;
        const filePath = batch.filename || `payroll_imports/${batch.periodYm}.pdf`;

        // UPSERT oficial en payroll_monthly_totals con versión de parser oficial v2
        const { error: upsertErr } = await this.supabase
          .from('payroll_monthly_totals')
          .upsert(
            {
              period_ym: batch.periodYm,
              period_start: periodStart,
              period_end: periodEnd,
              file_path: filePath,
              total_company_cost: report.totalCompanyCost,
              content_hash: batch.contentHash ?? null,
              source: batch.source ?? 'payroll_import_pipeline',
              parser_version: PAYROLL_SUMMARY_PARSER_VERSION,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'period_ym' },
          );

        if (upsertErr) {
          throw new Error(`Error en UPSERT de payroll_monthly_totals: ${upsertErr.message}`);
        }

        report.monthlyTotalsUpserted = true;

        // Registrar auditoría inmutable en payroll_import_runs
        await this.supabase.from('payroll_import_runs').insert({
          source: batch.source ?? 'payroll_import_pipeline',
          parser_version: PAYROLL_SUMMARY_PARSER_VERSION,
          content_hash: batch.contentHash ?? null,
          filename: batch.filename ?? null,
          period_ym: batch.periodYm,
          period_start: periodStart,
          period_end: periodEnd,
          amount_detected: report.totalCompanyCost,
          amount_selected: report.totalCompanyCost,
          status: 'imported',
          validation_messages: report.validationMessages,
        });
      } catch (err: any) {
        report.errors.push(`Error actualizando resumen del mes (payroll_monthly_totals): ${err.message}`);
      }
    }

    report.success = report.failedCount === 0 && report.monthlyTotalsUpserted;
    return report;
  }
}
