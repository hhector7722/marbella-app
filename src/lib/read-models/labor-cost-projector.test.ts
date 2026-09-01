import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LaborCostDayReadModelProjector } from './labor-cost-day-projector.ts';
import { Money } from '../payroll/value-objects.ts';

describe('FASE 4: Read Models & Projectors (Coste Laboral V2 SSOT)', () => {
  it('elimina completamente la fila sintética Nómina empresa y atribuye el coste a trabajadores reales', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'daily_sales') {
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: { total_net_amount: 1000 } }),
              }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'usr_alba', first_name: 'Alba', last_name: 'Martín', visible_in_plantilla: true },
              ],
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        };
      },
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: () => Promise.resolve({
        userId: 'usr_alba',
        dailyFixedCost: Money.from(100),
      }),
    };

    const mockContractService: any = {
      isContractActiveOn: () => Promise.resolve(true),
    };

    const mockPayrollRepo: any = {
      getActiveFactsForPeriod: () => Promise.resolve([{ id: 'f1', user_id: 'usr_alba' }]),
    };

    const projector = new LaborCostDayReadModelProjector(
      mockSupabase,
      mockAllocationService,
      mockContractService,
      mockPayrollRepo,
    );

    const dto = await projector.projectDayDetail('2026-07-15', { includeAllContracted: true });

    assert.equal(dto.workers.length, 1);
    assert.equal(dto.workers[0]?.name, 'Alba Martín');
    assert.equal(dto.workers[0]?.fixed, 100);
    assert.equal(dto.totalFixed, 100);

    const hasSyntheticRow = dto.workers.some((w) => w.name.includes('Nómina empresa'));
    assert.equal(hasSyntheticRow, false);
  });

  it('Toggle OFF: incluye únicamente trabajadores con actividad real (fichajes > 0 u extras > 0)', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'daily_sales') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { total_net_amount: 1500 } }) }),
            }),
          };
        }
        if (table === 'profiles') {
          return {
            select: () => Promise.resolve({
              data: [
                { id: 'usr_active', first_name: 'Trabajador', last_name: 'Activo', visible_in_plantilla: true },
                { id: 'usr_inactive', first_name: 'Trabajador', last_name: 'Inactivo', visible_in_plantilla: true },
              ],
            }),
          };
        }
        return {
          select: () => ({
            eq: () => ({
              gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }),
            }),
          }),
        };
      },
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: (uId: string) => Promise.resolve({
        userId: uId,
        dailyFixedCost: Money.from(100),
      }),
    };

    const mockContractService: any = {
      isContractActiveOn: () => Promise.resolve(true),
    };

    const mockPayrollRepo: any = {
      getActiveFactsForPeriod: () => Promise.resolve([{ id: 'f1', user_id: 'usr_active' }]),
    };

    const projector = new LaborCostDayReadModelProjector(
      mockSupabase,
      mockAllocationService,
      mockContractService,
      mockPayrollRepo,
    );

    const dtoToggleOff = await projector.projectDayDetail('2026-07-15', { includeAllContracted: false });
    assert.equal(dtoToggleOff.workers.length, 0);

    const dtoToggleOn = await projector.projectDayDetail('2026-07-15', { includeAllContracted: true });
    assert.equal(dtoToggleOn.workers.length, 2);
  });

  it('marca isPayrollPending = true y pctStatus = incomplete_payroll_pending cuando un mes no tiene nómina', async () => {
    const mockSupabase: any = {
      from: (table: string) => {
        if (table === 'daily_sales') {
          return {
            select: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { total_net_amount: 2000 } }) }),
            }),
          };
        }
        if (table === 'profiles') {
          return { select: () => Promise.resolve({ data: [] }) };
        }
        return {};
      },
    };

    const mockAllocationService: any = {
      getDailyPayrollCost: () => Promise.resolve({ dailyFixedCost: Money.zero() }),
    };

    const mockContractService: any = {
      isContractActiveOn: () => Promise.resolve(false),
    };

    const mockPayrollRepo: any = {
      getActiveFactsForPeriod: () => Promise.resolve([]),
    };

    const projector = new LaborCostDayReadModelProjector(
      mockSupabase,
      mockAllocationService,
      mockContractService,
      mockPayrollRepo,
    );

    const dto = await projector.projectDayDetail('2026-07-15');

    assert.equal(dto.isPayrollPending, true);
    assert.equal(dto.pctStatus, 'incomplete_payroll_pending');
    assert.equal(dto.totalFixed, 0);
  });
});
