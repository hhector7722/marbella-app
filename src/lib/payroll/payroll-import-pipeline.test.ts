import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PayrollEmployeeNormalizer, cleanDni, normalizeText } from './payroll-employee-normalizer.ts';
import { PayrollImportValidator } from './payroll-import-validator.ts';
import { PayrollImportPipeline } from './payroll-import-pipeline.ts';
import type { PayrollBatchImportInput } from '../../types/payroll-import.ts';

describe('FASE 8: Pipeline Oficial de Importación de Nóminas (SSOT)', () => {
  describe('Normalizador de Empleados (PayrollEmployeeNormalizer)', () => {
    const mockProfiles = [
      {
        id: 'user-001-uuid',
        first_name: 'Pere',
        last_name: 'Soler',
        email: 'pere.marbella@gmail.com',
        dni: '12345678A',
      },
      {
        id: 'user-002-uuid',
        first_name: 'Encarni',
        last_name: 'Gómez',
        email: 'encarni.marbella@gmail.com',
        dni: '87654321B',
      },
    ];

    it('limpia DNI y normaliza texto correctamente', () => {
      assert.equal(cleanDni(' 12345678-A '), '12345678A');
      assert.equal(cleanDni(null), null);
      assert.equal(normalizeText(' José María '), 'jose maria');
    });

    it('resuelve coincidencia exacta por DNI, email y nombre completo', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);

      // Coincidencia DNI
      const resDni = normalizer.matchCandidate({ dni: '12345678-A' });
      assert.equal(resDni.matched, true);
      assert.equal(resDni.userId, 'user-001-uuid');
      assert.equal(resDni.matchMethod, 'dni');

      // Coincidencia Email
      const resEmail = normalizer.matchCandidate({ email: 'ENCARNI.MARBELLA@GMAIL.COM' });
      assert.equal(resEmail.matched, true);
      assert.equal(resEmail.userId, 'user-002-uuid');
      assert.equal(resEmail.matchMethod, 'email');

      // Coincidencia Nombre
      const resName = normalizer.matchCandidate({ name: 'Pere Soler' });
      assert.equal(resName.matched, true);
      assert.equal(resName.userId, 'user-001-uuid');
      assert.equal(resName.matchMethod, 'fullName');
    });

    it('retorna unmatched_employee para trabajadores inexistentes', async () => {
      const normalizer = new PayrollEmployeeNormalizer();
      await normalizer.initialize(mockProfiles);

      const res = normalizer.matchCandidate({ name: 'Empleado Desconocido', dni: '99999999Z' });
      assert.equal(res.matched, false);
      assert.equal(res.userId, null);
      assert.equal(res.matchMethod, 'none');
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
      assert.equal(monthlyTotalsRow.is_final, true);
    });
  });
});
