/**
 * Servicio de Persistencia Decoplado para PayrollMonthSnapshot (SSOT).
 *
 * Responsabilidad ÚNICA: Persistir los datos del Snapshot validado en Supabase.
 * - NO parsea.
 * - NO calcula.
 * - NO valida (asume que la validación ya ocurrió exitosamente).
 *
 * Invariante Contable: Escribe EXACTAMENTE 1 HECHO (`employee_payroll_facts`) por cada Settlement
 * en `snapshot.settlements`. Si un trabajador tiene 2 liquidaciones (ej. nómina + finiquito),
 * se crean 2 hechos contables en la base de datos.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { PayrollMonthSnapshot } from '../../types/payroll-snapshot.ts';
import type { SettlementType } from '../../types/payroll-facts.ts';
import { PayrollEmployeeNormalizer } from './payroll-employee-normalizer.ts';
import { PayrollFactWriteModel } from './payroll-write-model.ts';

export type PersistenceResultDTO = {
  success: boolean;
  periodYm: string;
  totalSettlements: number;
  factsInsertedCount: number;
  monthlyTotalsUpserted: boolean;
  importRunId?: string;
  errors: string[];
  totalWorkers: number;
  imported: number;
  skippedNotFound: number;
  skippedAmbiguous: number;
};

export class PayrollSnapshotPersistenceService {
  private readonly writeModel: PayrollFactWriteModel;

  constructor(private readonly supabase: SupabaseClient) {
    this.writeModel = new PayrollFactWriteModel(supabase);
  }

  /**
   * Persiste un PayrollMonthSnapshot validado en la base de datos.
   */
  async persistSnapshot(snapshot: PayrollMonthSnapshot): Promise<PersistenceResultDTO> {
    const errors: string[] = [];
    const periodYm = snapshot.header.periodYm;

    // 1. Inicializar normalizador para vincular employeeCode / DNI con user_id de profiles
    const normalizer = new PayrollEmployeeNormalizer(this.supabase);
    try {
      await normalizer.initialize();
    } catch (err: any) {
      errors.push(`Error inicializando plantilla de empleados: ${err.message}`);
    }

    let factsInsertedCount = 0;
    let factsSkippedNotFound = 0;
    let factsSkippedMultiple = 0;

    // 2. Escribir 1 HECHO CONTABLE por cada Settlement (Invariante Contable)
    for (const settlement of snapshot.settlements) {
      const match = normalizer.matchCandidate({
        dni: settlement.employeeCode,
        name: settlement.employeeName,
      });

      // Caso 2 y 3: No hay coincidencia (o hay múltiples).
      if (!match.matched || !match.userId) {
        if (match.errorMessage && match.errorMessage.includes('Ambigüedad')) {
          factsSkippedMultiple++;
        } else {
          factsSkippedNotFound++;
        }
        
        errors.push(
          `No se inserta el registro, trabajador: ${settlement.employeeName}, apellidos extraídos: ${match.errorMessage ?? 'Desconocido'}`
        );
        continue; // SALTAMOS ESTE REGISTRO
      }

      const userId = match.userId;

      let settlementType: SettlementType = 'ordinary';
      if (settlement.classification === 'SETTLEMENT') {
        settlementType = 'severance';
      } else if (settlement.classification === 'EXTRA_PAY') {
        settlementType = 'complementary';
      }

      const factResult = await this.writeModel.recordPayrollFact({
        user_id: userId,
        period_ym: periodYm,
        settlement_type: settlementType,
        total_company_cost: settlement.companyCost,
        document_id: null,
        created_by: null,
      });

      if (factResult.success) {
        factsInsertedCount++;
      } else {
        errors.push(
          `Fallo al insertar hecho para ${settlement.employeeName} (${settlement.settlementHash}): ${factResult.error}`,
        );
      }
    }

    // 3. Upsert en payroll_monthly_totals (Tomar exacto snapshot.totals.totalCompanyCost)
    let monthlyTotalsUpserted = false;
    const { error: totalsErr } = await this.supabase
      .from('payroll_monthly_totals')
      .upsert(
        {
          period_ym: periodYm,
          period_start: snapshot.header.periodStart,
          period_end: snapshot.header.periodEnd,
          total_company_cost: snapshot.totals.totalCompanyCost,
          content_hash: snapshot.metadata.contentHash || null,
          parser_version: snapshot.metadata.parserVersion,
          source: snapshot.metadata.source ?? 'gmail_summary',
          file_path: snapshot.metadata.storagePath ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'period_ym' },
      );

    if (totalsErr) {
      errors.push(`Error al realizar upsert en payroll_monthly_totals: ${totalsErr.message}`);
    } else {
      monthlyTotalsUpserted = true;
    }

    // 4. Registro en payroll_import_runs
    let importRunId: string | undefined;
    const { data: runData, error: runErr } = await this.supabase
      .from('payroll_import_runs')
      .insert({
        source: snapshot.metadata.source ?? 'gmail_summary',
        parser_version: snapshot.metadata.parserVersion,
        content_hash: snapshot.metadata.contentHash || null,
        filename: snapshot.metadata.filename || null,
        period_ym: periodYm,
        period_start: snapshot.header.periodStart,
        period_end: snapshot.header.periodEnd,
        amount_detected: snapshot.totals.totalCompanyCost,
        amount_selected: snapshot.totals.totalCompanyCost,
        candidates: [snapshot.totals.totalCompanyCost],
        label_used: 'COST TOTAL',
        status: errors.length === 0 && factsSkippedMultiple === 0 && factsSkippedNotFound === 0 ? 'imported' : 'error',
        validation_messages: [
          `Snapshot v${snapshot.version} procesado.`,
          `Trabajadores en PDF: ${snapshot.settlements.length}`,
          `Trabajadores asignados correctamente: ${factsInsertedCount}`,
          `Trabajadores sin coincidencia (omitidos): ${factsSkippedNotFound}`,
          `Trabajadores con coincidencias múltiples (omitidos): ${factsSkippedMultiple}`,
        ],
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
      .select('id')
      .single();

    if (!runErr && runData) {
      importRunId = runData.id;
    }

    return {
      success: errors.length === 0,
      periodYm,
      totalSettlements: snapshot.settlements.length,
      factsInsertedCount,
      monthlyTotalsUpserted,
      importRunId,
      errors,
      totalWorkers: snapshot.settlements.length,
      imported: factsInsertedCount,
      skippedNotFound: factsSkippedNotFound,
      skippedAmbiguous: factsSkippedMultiple,
    };
  }
}
