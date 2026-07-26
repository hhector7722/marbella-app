import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  hasOvertimeRateOverride,
  priceWeekOvertime,
} from './overtime-cost-engine.ts';

describe('Overtime Cost Engine — priceWeekOvertime', () => {
  it('un tramo pago: netPayable × rate', () => {
    const r = priceWeekOvertime({
      netPayableHours: 5,
      segments: [
        { weeklyBalancePart: 5, bagMode: false, overtimeRatePerHour: 10 },
      ],
      settlementRateAtWeekStart: 10,
    });
    assert.equal(r.estimatedValue, 50);
    assert.equal(r.hourlyRate, 10);
  });

  it('dos tarifas en la misma semana (waterfill P⁺)', () => {
    const r = priceWeekOvertime({
      netPayableHours: 8,
      segments: [
        { weeklyBalancePart: 3, bagMode: false, overtimeRatePerHour: 10 },
        { weeklyBalancePart: 5, bagMode: false, overtimeRatePerHour: 14 },
      ],
      settlementRateAtWeekStart: 10,
    });
    // 3×10 + 5×14 = 100
    assert.equal(r.estimatedValue, 100);
    assert.ok(Math.abs(r.hourlyRate - 100 / 8) < 1e-9);
  });

  it('override semanal: prioridad absoluta (también sobre dos segmentos)', () => {
    const r = priceWeekOvertime({
      netPayableHours: 8,
      segments: [
        { weeklyBalancePart: 3, bagMode: false, overtimeRatePerHour: 10 },
        { weeklyBalancePart: 5, bagMode: false, overtimeRatePerHour: 14 },
      ],
      overrideRate: 20,
      settlementRateAtWeekStart: 10,
    });
    assert.equal(r.estimatedValue, 160);
    assert.equal(r.hourlyRate, 20);
  });

  it('override 0 es válido (no se trata como ausencia)', () => {
    assert.equal(hasOvertimeRateOverride(0), true);
    assert.equal(hasOvertimeRateOverride(null), false);
    assert.equal(hasOvertimeRateOverride(undefined), false);
    const r = priceWeekOvertime({
      netPayableHours: 5,
      segments: [
        { weeklyBalancePart: 5, bagMode: false, overtimeRatePerHour: 10 },
      ],
      overrideRate: 0,
      settlementRateAtWeekStart: 10,
    });
    assert.equal(r.estimatedValue, 0);
    assert.equal(r.hourlyRate, 0);
  });

  it('bolsa pura: netPayable 0 → estimatedValue 0', () => {
    const r = priceWeekOvertime({
      netPayableHours: 0,
      segments: [
        { weeklyBalancePart: 5, bagMode: true, overtimeRatePerHour: 10 },
      ],
      settlementRateAtWeekStart: 10,
    });
    assert.equal(r.estimatedValue, 0);
    assert.equal(r.hourlyRate, 10);
  });

  it('deuda (netPayable 0): no cobra', () => {
    const r = priceWeekOvertime({
      netPayableHours: 0,
      segments: [
        { weeklyBalancePart: -3, bagMode: false, overtimeRatePerHour: 10 },
      ],
      settlementRateAtWeekStart: 12,
    });
    assert.equal(r.estimatedValue, 0);
  });

  it('carry liquidado: residual × settlementRateAtWeekStart (lunes)', () => {
    // P⁺ = 2h @ 14; netPayable = 7 → banco 5h @ settlement 10
    const r = priceWeekOvertime({
      netPayableHours: 7,
      segments: [
        { weeklyBalancePart: 2, bagMode: false, overtimeRatePerHour: 14 },
      ],
      settlementRateAtWeekStart: 10,
    });
    // 2×14 + 5×10 = 78
    assert.equal(r.estimatedValue, 78);
  });

  it('mixto semana + banco: waterfill luego settlement', () => {
    const r = priceWeekOvertime({
      netPayableHours: 10,
      segments: [
        { weeklyBalancePart: 4, bagMode: false, overtimeRatePerHour: 10 },
        { weeklyBalancePart: 3, bagMode: false, overtimeRatePerHour: 12 },
      ],
      settlementRateAtWeekStart: 11,
    });
    // 4×10 + 3×12 + 3×11 = 40+36+33 = 109
    assert.equal(r.estimatedValue, 109);
  });

  it('override + dos segmentos: ignora tarifas de tramo y settlement', () => {
    const r = priceWeekOvertime({
      netPayableHours: 10,
      segments: [
        { weeklyBalancePart: 4, bagMode: false, overtimeRatePerHour: 10 },
        { weeklyBalancePart: 3, bagMode: false, overtimeRatePerHour: 12 },
      ],
      overrideRate: 15,
      settlementRateAtWeekStart: 11,
    });
    assert.equal(r.estimatedValue, 150);
    assert.equal(r.hourlyRate, 15);
  });

  it('banco sin settlementRate → error explícito', () => {
    assert.throws(
      () =>
        priceWeekOvertime({
          netPayableHours: 5,
          segments: [
            { weeklyBalancePart: 2, bagMode: false, overtimeRatePerHour: 10 },
          ],
          // sin settlement → residual 3h sin tarifa
        }),
      /settlementRateAtWeekStart/,
    );
  });

  it('segmento cobrable sin rate → error (sin fallback a profiles)', () => {
    assert.throws(
      () =>
        priceWeekOvertime({
          netPayableHours: 3,
          segments: [
            { weeklyBalancePart: 3, bagMode: false, overtimeRatePerHour: null },
          ],
          settlementRateAtWeekStart: 10,
        }),
      /sin overtimeRatePerHour/,
    );
  });
});
