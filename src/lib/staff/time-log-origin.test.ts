import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isManualTimeLogEntry } from './time-log-origin.ts';

describe('origen del registro de asistencia', () => {
  it('registro creado por manager: is_manual_entry = true', () => {
    assert.equal(isManualTimeLogEntry('manager_manual'), true);
  });

  it('fichaje normal: is_manual_entry = false', () => {
    assert.equal(isManualTimeLogEntry('staff_clock'), false);
  });
});
