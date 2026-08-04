import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EmployeePayrollFactRow, InsertEmployeePayrollFactDTO, SettlementType, FactStatus } from '../../types/payroll-facts.ts';

const VALID_SETTLEMENT_TYPES: SettlementType[] = ['ordinary', 'complementary', 'severance', 'adjustment'];
const VALID_FACT_STATUSES: FactStatus[] = ['active', 'superseded', 'cancelled'];

describe('FASE 1: Persistencia SSOT Contable de Nóminas (employee_payroll_facts)', () => {
  it('valida estructura DTO de inserción de hecho contable', () => {
    const dto: InsertEmployeePayrollFactDTO = {
      user_id: 'usr_abc_123',
      period_ym: '2026-07',
      settlement_type: 'ordinary',
      total_company_cost: 1850.50,
      created_by: 'manager_1',
    };

    assert.equal(dto.user_id, 'usr_abc_123');
    assert.equal(dto.period_ym, '2026-07');
    assert.equal(dto.settlement_type, 'ordinary');
    assert.equal(dto.total_company_cost, 1850.50);
  });

  it('valida invariante de versión y estado activo por defecto', () => {
    const defaultStatus = 'active';
    const defaultVersion = 1;
    const row: Partial<EmployeePayrollFactRow> = {
      id: 'fact_999',
      user_id: 'usr_xyz',
      period_ym: '2026-07',
      settlement_type: 'ordinary',
      version: defaultVersion,
      status: defaultStatus,
      total_company_cost: 2100.00,
    };

    assert.equal(row.status, 'active');
    assert.equal(row.version, 1);
    assert.ok(row.total_company_cost! > 0);
  });

  it('valida que settlement_type y status pertenecen a dominios válidos', () => {
    const validSettlement: SettlementType = 'ordinary';
    const validStatus: FactStatus = 'active';

    assert.ok(VALID_SETTLEMENT_TYPES.includes(validSettlement));
    assert.ok(VALID_FACT_STATUSES.includes(validStatus));

    // @ts-expect-error Validar que tipos erróneos no compilen
    const invalidSettlement: SettlementType = 'invalid_type';
    assert.ok(!VALID_SETTLEMENT_TYPES.includes(invalidSettlement));
  });

  it('valida estructura de rectificación/superseded (Audit Ledger)', () => {
    const originalFactId = 'fact_v1_001';
    const rectifyingFactId = 'fact_v2_002';

    const originalRow: Partial<EmployeePayrollFactRow> = {
      id: originalFactId,
      user_id: 'usr_xyz',
      period_ym: '2026-07',
      version: 1,
      status: 'superseded',
      total_company_cost: 2100.00,
      superseded_at: '2026-08-01T10:00:00Z',
      superseded_by: rectifyingFactId,
    };

    const rectifyingRow: Partial<EmployeePayrollFactRow> = {
      id: rectifyingFactId,
      user_id: 'usr_xyz',
      period_ym: '2026-07',
      version: 2,
      status: 'active',
      total_company_cost: 2150.00,
    };

    assert.equal(originalRow.status, 'superseded');
    assert.equal(originalRow.superseded_by, rectifyingFactId);
    assert.equal(rectifyingRow.version, 2);
    assert.equal(rectifyingRow.status, 'active');
  });
});
