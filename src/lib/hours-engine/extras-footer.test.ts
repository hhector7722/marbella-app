import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extrasFooterFromProjection,
  netPayableHoursFromProjection,
  preferStockEffective,
} from './extras-footer.ts';

describe('extrasFooterFromProjection (INV-P03)', () => {
  it('deuda (carryOut < 0) → pie 0 aunque haya OT bruto', () => {
    assert.equal(
      extrasFooterFromProjection({
        preferStock: true,
        carryIn: -29.5,
        carryOut: -17.5,
        overtimeHours: 12,
        balanceFinal: -17.5,
      }),
      0,
    );
  });

  it('bolsa sin deuda → pie = OT bruto', () => {
    assert.equal(
      extrasFooterFromProjection({
        preferStock: true,
        carryIn: 0,
        carryOut: 5,
        overtimeHours: 5,
        balanceFinal: 5,
      }),
      5,
    );
  });

  it('pago → pie = horas cobrables de esta semana, no OT bruto', () => {
    const footer = extrasFooterFromProjection({
      preferStock: false,
      carryIn: 0,
      carryOut: 2,
      overtimeHours: 10,
      balanceFinal: 5,
    });
    assert.equal(
      netPayableHoursFromProjection({
        preferStock: false,
        balanceFinal: 5,
        carryOut: 2,
      }),
      3,
    );
    assert.equal(footer, 3);
  });
});

describe('preferStockEffective', () => {
  it('override true fuerza bolsa', () => {
    assert.equal(
      preferStockEffective({ segments: [{ bagMode: false }] }, true),
      true,
    );
  });

  it('sin override: todos los segmentos bolsa', () => {
    assert.equal(
      preferStockEffective({ segments: [{ bagMode: true }, { bagMode: true }] }),
      true,
    );
    assert.equal(
      preferStockEffective({ segments: [{ bagMode: true }, { bagMode: false }] }),
      false,
    );
  });
});
