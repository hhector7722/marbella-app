import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayrollImportValidator } from './payroll-import-validator.ts';
import { PayrollImportPipeline } from './payroll-import-pipeline.ts';
import type { PayrollBatchImportInput } from '../../types/payroll-import.ts';

describe('FASE 8: Pipeline Oficial de Importación de Nóminas (SSOT)', () => {
  describe('Normalizador de Empleados (PayrollEmployeeNormalizer)', () => {
    it('ya está cubierto en su propio archivo de test (payroll-employee-normalizer.test.ts)', () => {
      assert.ok(true);
    });
  });

  describe('Validador de Nóminas (PayrollImportValidator)', () => {
    it('valida periodos, importes positivos y detecta duplicados en lote', () => {
      const invalidRecord = {
        periodYm: '2026/07', // Formato invalido
        totalCompanyCost: -100, // Importe negativo
      };

      const issues = PayrollImportValidator.validateRecord(invalidRecord, 0);
      assert.equal(issues.length >= 2, true);
      assert.equal(issues.some((i) => i.field === 'periodYm'), true);
      assert.equal(issues.some((i) => i.field === 'totalCompanyCost'), true);

      const batchWithDuplicates: PayrollBatchImportInput = {
        periodYm: '2026-07',
        records: [
          { userId: 'user-001', periodYm: '2026-07', totalCompanyCost: 1500 },
          { userId: 'user-001', periodYm: '2026-07', totalCompanyCost: 1600 },
        ],
      };

      const batchIssues = PayrollImportValidator.validateBatch(batchWithDuplicates);
      assert.equal(batchIssues.some((i) => i.message.includes('duplicado')), true);
    });
  });

  describe('Orquestador de Pipeline (PayrollImportPipeline)', () => {
    it('procesa lote completo, escribe hechos atómicos y actualiza payroll_monthly_totals', async () => {
      const mockProfiles = [
        { id: 'user-001', first_name: 'Pere', last_name: 'Soler', email: null, dni: '11111111A' },
        { id: 'user-002', first_name: 'Encarni', last_name: null, email: null, dni: '22222222B' },
      ];

      const insertedFacts: any[] = [];
      let monthlyTotalsRow: any = null;

      // Mock de SupabaseClient
      const mockSupabase: any = {
        from: (table: string) => {
          if (table === 'profiles') {
            return {
              select: () => Promise.resolve({ data: mockProfiles, error: null }),
            };
          }
          if (table === 'employee_payroll_facts') {
            return {
              select: () => ({
                eq: () => ({
                  eq: () =>
                    Promise.resolve({
                      data: insertedFacts.filter((f) => f.status === 'active'),
                      error: null,
                    }),
                }),
              }),
            };
          }
          if (table === 'payroll_monthly_totals') {
            return {
              upsert: (payload: any) => {
                monthlyTotalsRow = payload;
                return Promise.resolve({ error: null });
              },
            };
          }
          if (table === 'payroll_import_runs') {
            return {
              insert: () => Promise.resolve({ error: null }),
            };
          }
          return {};
        },
        rpc: (fn: string, args: any) => {
          if (fn === 'record_payroll_fact_atomic') {
            insertedFacts.forEach((f) => {
              if (
                f.user_id === args.p_user_id &&
                f.period_ym === args.p_period_ym &&
                f.settlement_type === args.p_settlement_type &&
                f.status === 'active'
              ) {
                f.status = 'superseded';
              }
            });

            const newFact = {
              id: `fact-${insertedFacts.length + 1}`,
              user_id: args.p_user_id,
              period_ym: args.p_period_ym,
              settlement_type: args.p_settlement_type,
              total_company_cost: args.p_total_company_cost,
              status: 'active',
            };
            insertedFacts.push(newFact);

            return Promise.resolve({
              data: { success: true, fact_id: newFact.id, version: 1 },
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
      };

      const pipeline = new PayrollImportPipeline(mockSupabase);

      const batch: PayrollBatchImportInput = {
        periodYm: '2026-07',
        records: [
          { dni: '11111111A', periodYm: '2026-07', totalCompanyCost: 1800.5 },
          { dni: '22222222B', periodYm: '2026-07', totalCompanyCost: 1650.0 },
        ],
      };

      const report = await pipeline.execute(batch);

      assert.equal(report.success, true);
      assert.equal(report.importedCount, 2);
      assert.equal(report.failedCount, 0);
      assert.equal(report.totalCompanyCost, 3450.5);
      assert.equal(report.monthlyTotalsUpserted, true);

      // Verificar UPSERT en payroll_monthly_totals
      assert.notEqual(monthlyTotalsRow, null);
      assert.equal(monthlyTotalsRow.period_ym, '2026-07');
      assert.equal(monthlyTotalsRow.total_company_cost, 3450.5);
    });
  });
});
