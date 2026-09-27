import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromZonedTime } from 'date-fns-tz';
import { deriveManagedExtraPunctuality } from './managed-extra-punctuality.ts';

function madridIso(local: string): string {
  return fromZonedTime(local, 'Europe/Madrid').toISOString();
}

describe('puntualidad de extra gestionado', () => {
  it('turno 18:00 y entrada 18:07: retraso 7 min', () => {
    const result = deriveManagedExtraPunctuality({
      publishedShiftStartIso: madridIso('2026-09-26T18:00:00'),
      firstRegularClockInIso: madridIso('2026-09-26T18:07:00'),
    });
    assert.equal(result.kind, 'late');
    if (result.kind === 'late') assert.equal(result.minutes, 7);
    assert.equal(result.label, 'Retraso: 7 min');
  });

  it('turno 18:00 y entrada 17:55: a tiempo', () => {
    const result = deriveManagedExtraPunctuality({
      publishedShiftStartIso: madridIso('2026-09-26T18:00:00'),
      firstRegularClockInIso: madridIso('2026-09-26T17:55:00'),
    });
    assert.equal(result.kind, 'on_time');
    assert.equal(result.label, 'A tiempo');
  });

  it('turno 18:00–01:00 con entrada pasada la medianoche', () => {
    const start = madridIso('2026-09-26T18:00:00');
    const clockIn = madridIso('2026-09-27T00:10:00');
    const result = deriveManagedExtraPunctuality({
      publishedShiftStartIso: start,
      firstRegularClockInIso: clockIn,
    });
    assert.equal(result.kind, 'late');
    if (result.kind === 'late') assert.equal(result.minutes, 6 * 60 + 10);
  });

  it('sin turno publicado', () => {
    const result = deriveManagedExtraPunctuality({
      publishedShiftStartIso: null,
      firstRegularClockInIso: madridIso('2026-09-26T18:07:00'),
    });
    assert.equal(result.label, 'Sin turno previsto');
  });

  it('con turno y sin registro', () => {
    const result = deriveManagedExtraPunctuality({
      publishedShiftStartIso: madridIso('2026-09-26T18:00:00'),
      firstRegularClockInIso: null,
    });
    assert.equal(result.label, 'Sin registro');
  });
});
