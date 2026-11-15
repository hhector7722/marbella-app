import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isUsageTrackingId,
  USAGE_BROWSER_COOKIE,
  USAGE_BROWSER_SESSION_COOKIE,
} from './browser-context.ts';

test('el ID de navegador es un UUID v4 validado; no es una sesión de autenticación', () => {
  assert.equal(isUsageTrackingId(crypto.randomUUID()), true);
  assert.equal(isUsageTrackingId(''), false);
  assert.equal(isUsageTrackingId('fake'), false);
  assert.equal(isUsageTrackingId('00000000-0000-0000-0000-000000000000'), false);
  assert.notEqual(USAGE_BROWSER_COOKIE, USAGE_BROWSER_SESSION_COOKIE);
});
