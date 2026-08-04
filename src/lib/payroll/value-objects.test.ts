import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Money, LaborCost, Percentage } from './value-objects.ts';

describe('FASE 3: Value Objects (Money, LaborCost, Percentage)', () => {
  describe('Money', () => {
    it('redondea correctamente a 2 decimales y maneja operaciones básicas', () => {
      const m1 = Money.from(100.554);
      assert.equal(m1.amount, 100.55);

      const m2 = Money.from(50.456);
      assert.equal(m2.amount, 50.46);

      const sum = m1.add(m2);
      assert.equal(sum.amount, 151.01);

      const sub = m1.subtract(m2);
      assert.equal(sub.amount, 50.09);
    });

    it('maneja divisiones por cero sin lanzar excepciones devolviendo Money.zero()', () => {
      const m = Money.from(100);
      const divZero = m.divide(0);
      assert.equal(divZero.amount, 0);
      assert.ok(divZero.isZero());

      const divNaN = m.divide(NaN);
      assert.equal(divNaN.amount, 0);
    });

    it('prorratea correctamente entre días activos (D_vigentes)', () => {
      const totalPayroll = Money.from(3100);
      const daily31 = totalPayroll.divide(31);
      assert.equal(daily31.amount, 100);

      const totalPayroll17 = Money.from(1700);
      const daily17 = totalPayroll17.divide(17);
      assert.equal(daily17.amount, 100);
    });
  });

  describe('LaborCost', () => {
    it('garantiza la invariante total = fixed + overtime', () => {
      const fixed = Money.from(40.50);
      const overtime = Money.from(15.25);
      const cost = LaborCost.create(fixed, overtime);

      assert.equal(cost.fixed.amount, 40.50);
      assert.equal(cost.overtime.amount, 15.25);
      assert.equal(cost.total.amount, 55.75); // 40.50 + 15.25
    });

    it('suma dos objetos LaborCost manteniendo invariantes', () => {
      const c1 = LaborCost.create(Money.from(40), Money.from(10));
      const c2 = LaborCost.create(Money.from(60), Money.from(20));
      const sum = c1.add(c2);

      assert.equal(sum.fixed.amount, 100);
      assert.equal(sum.overtime.amount, 30);
      assert.equal(sum.total.amount, 130);
    });
  });

  describe('Percentage', () => {
    it('calcula porcentajes sobre ventas de forma segura', () => {
      const cost = Money.from(135);
      const sales = Money.from(1350);
      const pct = Percentage.fromValues(cost, sales);

      assert.equal(pct.value, 10);
    });

    it('evita divisiones por cero devolviendo Percentage.zero() si ventas es <= 0', () => {
      const cost = Money.from(100);
      const salesZero = Money.from(0);
      const pctZero = Percentage.fromValues(cost, salesZero);

      assert.equal(pctZero.value, 0);

      const salesNeg = Money.from(-50);
      const pctNeg = Percentage.fromValues(cost, salesNeg);
      assert.equal(pctNeg.value, 0);
    });
  });
});
