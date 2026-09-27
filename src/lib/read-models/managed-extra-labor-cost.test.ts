import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveLaborWorkerDay } from './labor-worker-day.ts';

describe('coste laboral de extra gestionado', () => {
  it('sin actividad no aparece, aunque el tramo de 0 h esté abierto', () => {
    const day = resolveLaborWorkerDay({
      staffingMode: 'managed_extra',
      hasActivity: false,
      hasActiveContract: true,
      includeAllContracted: true,
      fixed: 40,
      overtime: 0,
    });
    assert.equal(day.include, false);
    assert.equal(day.fixed, 0);
    assert.equal(day.overtime, 0);
    assert.equal(day.total, 0);
  });

  it('con actividad: fijo 0, extras de la proyección, total = extras', () => {
    const day = resolveLaborWorkerDay({
      staffingMode: 'managed_extra',
      hasActivity: true,
      hasActiveContract: true,
      includeAllContracted: false,
      fixed: 40,
      overtime: 60,
    });
    assert.equal(day.include, true);
    assert.equal(day.fixed, 0);
    assert.equal(day.overtime, 60);
    assert.equal(day.total, 60);
  });

  it('un trabajador regular con contrato sigue apareciendo con el toggle de plantilla', () => {
    const day = resolveLaborWorkerDay({
      staffingMode: 'regular',
      hasActivity: false,
      hasActiveContract: true,
      includeAllContracted: true,
      fixed: 100,
      overtime: 0,
    });
    assert.equal(day.include, true);
    assert.equal(day.fixed, 100);
    assert.equal(day.total, 100);
  });
});
