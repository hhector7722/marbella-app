import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { priceWeekOvertime } from './overtime-cost-engine.ts';

/**
 * Contrato de persistencia: el valor escrito debe ser el estimatedValue
 * redondeado a céntimos (numeric(10,2)), y 0 € ≠ NULL.
 */
describe('persist overtime cost — contrato de valor', () => {
  it('estimatedValue se redondea a céntimos como la columna SQL', () => {
    const r = priceWeekOvertime({
      netPayableHours: 1,
      segments: [
        { weeklyBalancePart: 1, bagMode: false, overtimeRatePerHour: 10.125 },
      ],
      settlementRateAtWeekStart: 10.125,
    });
    const persisted = Math.round(r.estimatedValue * 100) / 100;
    assert.equal(persisted, 10.13);
  });

  it('0 € es un importe válido (no se confunde con no persistido)', () => {
    const r = priceWeekOvertime({
      netPayableHours: 0,
      segments: [
        { weeklyBalancePart: 5, bagMode: true, overtimeRatePerHour: 10 },
      ],
      settlementRateAtWeekStart: 10,
    });
    assert.equal(r.estimatedValue, 0);
    const persisted = Math.round(r.estimatedValue * 100) / 100;
    assert.equal(persisted, 0);
  });
});
