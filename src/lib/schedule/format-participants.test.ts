import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatParticipantCount } from './format-participants.ts';

test('participantes: separador de millares con puntos', () => {
  assert.equal(formatParticipantCount(0), '0');
  assert.equal(formatParticipantCount(999), '999');
  assert.equal(formatParticipantCount(1000), '1.000');
  assert.equal(formatParticipantCount(2525), '2.525');
  assert.equal(formatParticipantCount(10000), '10.000');
  assert.equal(formatParticipantCount(1234567), '1.234.567');
});
