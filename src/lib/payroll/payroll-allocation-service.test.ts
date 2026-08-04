import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollAllocationService } from './payroll-allocation-service.ts';
import { Money } from './value-objects.ts';

describe('FASE 3: PayrollAllocationService (Regla Oficial Fijo Diario)', () => {
  it('calcula el coste fijo diario dividiendo exactamente entre D_vigentes (31 días)', async () => {
    const mockRepo: any = {
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(3100)),
      getActiveFactsForUser: () => Promise.resolve([{ id: 'f1', total_company_cost: 3100 }]),
    };

    const mockContractService: any = {
      getActiveContractDaysBatch: () => Promise.resolve({ usr_1: 31 }),
      isContractActiveOn: () => Promise.resolve(true),
    };

    const service = new PayrollAllocationService(mockRepo, mockContractService);
    const result = await service.getDailyPayrollCost('usr_1', '2026-07-10');

    assert.equal(result.dailyFixedCost.amount, 100); // 3100 / 31 = 100
    assert.equal(result.monthlyCompanyCost.amount, 3100);
    assert.equal(result.activeContractDays, 31);
    assert.equal(result.isContractActiveOnDate, true);
    assert.ok(result.traceability.formula.includes('3100 € / 31 días vigentes'));
  });

  it('divide por 17 días cuando el contrato es un alta a mitad de mes (día 15)', async () => {
    const mockRepo: any = {
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(1700)),
      getActiveFactsForUser: () => Promise.resolve([{ id: 'f1', total_company_cost: 1700 }]),
    };

    const mockContractService: any = {
      getActiveContractDaysBatch: () => Promise.resolve({ usr_alta_15: 17 }),
      isContractActiveOn: (uId: string, d: string) => Promise.resolve(d >= '2026-07-15'),
    };

    const service = new PayrollAllocationService(mockRepo, mockContractService);

    // Consulta el día 20 (dentro de contrato activo)
    const resultActive = await service.getDailyPayrollCost('usr_alta_15', '2026-07-20');
    assert.equal(resultActive.dailyFixedCost.amount, 100); // 1700 / 17 = 100
    assert.equal(resultActive.activeContractDays, 17);

    // Consulta el día 5 (antes del alta)
    const resultBeforeHigh = await service.getDailyPayrollCost('usr_alta_15', '2026-07-05');
    assert.equal(resultBeforeHigh.dailyFixedCost.amount, 0); // Fuera de contrato = 0 €/día
  });

  it('asigna coste fijo diario = 0 € a trabajadores eventuales (D_vigentes = 0)', async () => {
    const mockRepo: any = {
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.zero()),
      getActiveFactsForUser: () => Promise.resolve([]),
    };

    const mockContractService: any = {
      getActiveContractDaysBatch: () => Promise.resolve({ usr_eventual: 0 }),
      isContractActiveOn: () => Promise.resolve(false),
    };

    const service = new PayrollAllocationService(mockRepo, mockContractService);
    const result = await service.getDailyPayrollCost('usr_eventual', '2026-07-10');

    assert.equal(result.dailyFixedCost.amount, 0);
    assert.equal(result.monthlyCompanyCost.amount, 0);
    assert.equal(result.activeContractDays, 0);
  });

  it('consolida múltiples hechos de nómina (ordinaria + complementaria + finiquito)', async () => {
    const mockRepo: any = {
      getMonthlyCompanyCostConsolidated: () => Promise.resolve(Money.from(3100)), // 2000 + 500 + 600
      getActiveFactsForUser: () => Promise.resolve([
        { id: 'f1', settlement_type: 'ordinary', total_company_cost: 2000 },
        { id: 'f2', settlement_type: 'complementary', total_company_cost: 500 },
        { id: 'f3', settlement_type: 'severance', total_company_cost: 600 },
      ]),
    };

    const mockContractService: any = {
      getActiveContractDaysBatch: () => Promise.resolve({ usr_multi: 31 }),
      isContractActiveOn: () => Promise.resolve(true),
    };

    const service = new PayrollAllocationService(mockRepo, mockContractService);
    const result = await service.getDailyPayrollCost('usr_multi', '2026-07-15');

    assert.equal(result.monthlyCompanyCost.amount, 3100);
    assert.equal(result.dailyFixedCost.amount, 100); // 3100 / 31 = 100
    assert.equal(result.traceability.settlementsCount, 3);
  });
});
