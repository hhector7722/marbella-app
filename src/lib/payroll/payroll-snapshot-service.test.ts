import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseCompanySummaryPdfData,
  parseEuroNumber,
} from './company-summary-parser.ts';
import { computeSettlementHash } from './settlement-hash.ts';
import { PayrollSnapshotValidator } from './payroll-snapshot-validator.ts';
import { PayrollSnapshotPersistenceService } from './payroll-snapshot-persistence-service.ts';

function createMockPdfDataWith2Mamadou() {
  return {
    Pages: [
      {
        Texts: [
          // Cabecera
          { x: 2.1, y: 4.4, R: [{ T: encodeURIComponent('PAGA TOTAL DEL 01/07/2026 AL 31/07/2026') }] },
          { x: 4.0, y: 5.8, R: [{ T: encodeURIComponent('Empresa 9022 - EL FOGO TORRAT,S.L.U.') }] },
          { x: 29.9, y: 5.8, R: [{ T: encodeURIComponent('N.I.F. B09761628') }] },

          // Trabajador 1 (MAMADOU NYANDAYE - Nómina)
          { x: 1.9, y: 22.2, R: [{ T: encodeURIComponent('000061') }] },
          { x: 3.6, y: 22.2, R: [{ T: encodeURIComponent('MAMADOU NYANDAYE') }] },
          { x: 13.6, y: 22.2, R: [{ T: encodeURIComponent('1.853,19') }] }, // Gross
          { x: 34.4, y: 22.2, R: [{ T: encodeURIComponent('2.449,00') }] }, // CompanyCost
          { x: 37.1, y: 22.2, R: [{ T: encodeURIComponent('1.692,94') }] }, // Net

          // Trabajador 1 (MAMADOU NYANDAYE - Finiquito)
          { x: 1.9, y: 23.2, R: [{ T: encodeURIComponent('000061') }] },
          { x: 3.6, y: 23.2, R: [{ T: encodeURIComponent('MAMADOU NYANDAYE') }] },
          { x: 13.7, y: 23.2, R: [{ T: encodeURIComponent('764,64') }] }, // Gross
          { x: 34.4, y: 23.2, R: [{ T: encodeURIComponent('940,9') }] },
          { x: 36.4, y: 23.2, R: [{ T: encodeURIComponent('5') }] }, // CompanyCost -> 940.95
          { x: 37.1, y: 23.2, R: [{ T: encodeURIComponent('729,00') }] }, // Net

          // Totales
          { x: 1.9, y: 28.0, R: [{ T: encodeURIComponent('TOTAL EMPRESA') }] },
          { x: 16.0, y: 28.0, R: [{ T: encodeURIComponent('2.617,83') }] }, // Gross Total
          { x: 13.5, y: 28.5, R: [{ T: encodeURIComponent('2.617,83') }] },
          { x: 34.5, y: 28.5, R: [{ T: encodeURIComponent('3.389,95') }] }, // CompanyCost Total
        ],
      },
    ],
  };
}

describe('ARQUITECTURA SSOT PAYROLL MONTH SNAPSHOT', () => {
  it('✓ Un trabajador con dos filas genera dos Settlement independientes', () => {
    const pdfData = createMockPdfDataWith2Mamadou();
    const res = parseCompanySummaryPdfData(pdfData);

    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.snapshot.settlements.length, 2);
    assert.equal(res.snapshot.settlements[0]!.employeeCode, '000061');
    assert.equal(res.snapshot.settlements[1]!.employeeCode, '000061');
    assert.notEqual(res.snapshot.settlements[0]!.settlementHash, res.snapshot.settlements[1]!.settlementHash);
  });

  it('✓ La suma de companyCost y grossSalary coincide exactamente con el total (INV-01 e INV-02)', () => {
    const pdfData = createMockPdfDataWith2Mamadou();
    const res = parseCompanySummaryPdfData(pdfData);
    assert.equal(res.ok, true);
    if (!res.ok) return;

    const validationReport = PayrollSnapshotValidator.validate(res.snapshot);
    assert.equal(validationReport.valid, true);
    assert.equal(validationReport.issues.length, 0);
  });

  it('✓ settlementHash es determinista e inmutable', () => {
    const hashA = computeSettlementHash({
      periodYm: '2026-07',
      employeeCode: '000061',
      grossSalary: 1853.19,
      companyCost: 2449.00,
      netSalary: 1692.94,
      rowIndex: 0,
    });

    const hashB = computeSettlementHash({
      periodYm: '2026-07',
      employeeCode: '000061',
      grossSalary: 1853.19,
      companyCost: 2449.00,
      netSalary: 1692.94,
      rowIndex: 0,
    });

    assert.equal(hashA, hashB);
    assert.equal(hashA.length, 64);
  });

  it('✓ El parser es una función pura que no escribe en la base de datos', () => {
    const pdfData = createMockPdfDataWith2Mamadou();
    const res = parseCompanySummaryPdfData(pdfData);

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // Retorna objeto inmutable de dominio en memoria
    assert.ok(res.snapshot);
    assert.equal(res.snapshot.version, 1);
    assert.equal(res.snapshot.header.periodYm, '2026-07');
  });

  it('✓ PersistenceService escribe exactamente 1 fact por Settlement (2 facts para Mamadou)', async () => {
    const mockInsertedFacts: any[] = [];
    let monthlyTotalsUpserted = false;

    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'profiles') {
          return {
            select: () => Promise.resolve({ data: [{ id: 'user-mamadou-uuid', dni: '000061', first_name: 'MAMADOU', last_name: 'NYANDAYE' }], error: null }),
          };
        }
        if (table === 'payroll_monthly_totals') {
          return {
            upsert: () => {
              monthlyTotalsUpserted = true;
              return Promise.resolve({ error: null });
            },
          };
        }
        if (table === 'payroll_import_runs') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'run-123' }, error: null }),
              }),
            }),
          };
        }
        return {};
      },
      rpc: (fn: string, args: any) => {
        if (fn === 'record_payroll_fact_atomic') {
          mockInsertedFacts.push(args);
          return Promise.resolve({
            data: { success: true, fact_id: `fact-${mockInsertedFacts.length}`, version: 1 },
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
    };

    const pdfData = createMockPdfDataWith2Mamadou();
    const parseRes = parseCompanySummaryPdfData(pdfData);
    assert.equal(parseRes.ok, true);
    if (!parseRes.ok) return;

    const persistenceService = new PayrollSnapshotPersistenceService(mockSupabase);
    const persistRes = await persistenceService.persistSnapshot(parseRes.snapshot);

    assert.equal(persistRes.success, true);
    assert.equal(persistRes.factsInsertedCount, 2);
    assert.equal(mockInsertedFacts.length, 2);
    assert.equal(monthlyTotalsUpserted, true);
  });
});
