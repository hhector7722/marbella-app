import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PayrollFactWriteModel } from './payroll-write-model.ts';
import type { InsertEmployeePayrollFactDTO } from '../../types/payroll-facts.ts';

describe('FASE 2: Payroll Write Model Transaccional Atómico (employee_payroll_facts)', () => {
  it('instancia el Write Model atómico correctamente sin consumidores de lectura', () => {
    const mockSupabase: any = {
      rpc: () => Promise.resolve({ data: { success: true, fact_id: 'fact_1', version: 1 }, error: null }),
    };

    const writeModel = new PayrollFactWriteModel(mockSupabase);
    assert.ok(writeModel);
  });

  it('ejecuta la RPC atómica PostgreSQL record_payroll_fact_atomic y retorna el resultado de Audit Ledger', async () => {
    let rpcCalledWith: any = null;

    const mockSupabase: any = {
      rpc: (fnName: string, params: any) => {
        assert.equal(fnName, 'record_payroll_fact_atomic');
        rpcCalledWith = params;
        return Promise.resolve({
          data: {
            success: true,
            fact_id: 'fact_v2_atomic',
            version: 2,
            superseded_fact_id: 'fact_v1_old',
          },
          error: null,
        });
      },
    };

    const writeModel = new PayrollFactWriteModel(mockSupabase);

    const dto: InsertEmployeePayrollFactDTO = {
      user_id: 'usr_alba_001',
      period_ym: '2026-07',
      settlement_type: 'ordinary',
      total_company_cost: 2150.00,
      created_by: 'manager_admin',
    };

    const result = await writeModel.recordPayrollFact(dto);

    assert.equal(result.success, true);
    assert.equal(result.factId, 'fact_v2_atomic');
    assert.equal(result.version, 2);
    assert.equal(result.supersededFactId, 'fact_v1_old');

    // Invariantes pasados a la RPC transaccional
    assert.equal(rpcCalledWith.p_user_id, 'usr_alba_001');
    assert.equal(rpcCalledWith.p_period_ym, '2026-07');
    assert.equal(rpcCalledWith.p_settlement_type, 'ordinary');
    assert.equal(rpcCalledWith.p_total_company_cost, 2150.00);
    assert.equal(rpcCalledWith.p_created_by, 'manager_admin');
  });

  it('maneja y captura errores transaccionales en PostgreSQL sin dejar estado inconsistente', async () => {
    const eqObj: any = {
      eq: () => eqObj,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };

    const mockSupabase: any = {
      rpc: () => Promise.resolve({
        data: null,
        error: { message: 'unique_violation on active status' },
      }),
      from: () => ({
        select: () => eqObj,
        insert: () => ({
          select: () => ({
            single: () => Promise.resolve({ data: null, error: { message: 'unique_violation on active status' } }),
          }),
        }),
      }),
    };

    const writeModel = new PayrollFactWriteModel(mockSupabase);
    const result = await writeModel.recordPayrollFact({
      user_id: 'usr_err_001',
      period_ym: '2026-07',
      total_company_cost: 1500.00,
    });

    assert.equal(result.success, false);
    assert.equal(result.factId, '');
    assert.equal(result.version, 0);
    assert.ok(result.error?.includes('unique_violation'));
  });
});
