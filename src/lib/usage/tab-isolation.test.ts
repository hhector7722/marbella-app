import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isTabSessionOccupied, shouldAcknowledgeTabClaim } from './tab-isolation.ts';

const tabA = '2dba04c7-e2d9-4993-9ce5-dc12ce35e391';
const tabB = '8367c28d-4c4b-4dde-a71a-0d402bc1920f';
const sessionA = '9d90f265-5f4e-48e2-af64-e52b7d58479e';
const sessionB = '7b17e936-821c-4ca1-ad66-25b89cb055e3';

test('pestaña duplicada: la original avisa sólo a quien heredó su ID', () => {
  assert.equal(shouldAcknowledgeTabClaim({
    kind: 'claim', sessionId: sessionA, runtimeId: tabB,
  }, sessionA, tabA), true);
  assert.equal(isTabSessionOccupied({
    kind: 'occupied', sessionId: sessionA, targetId: tabB,
  }, sessionA, tabB), true);
  assert.equal(isTabSessionOccupied({
    kind: 'occupied', sessionId: sessionA, targetId: tabB,
  }, sessionA, tabA), false);
});

test('actividades simultáneas con IDs independientes no colisionan', () => {
  assert.equal(shouldAcknowledgeTabClaim({
    kind: 'claim', sessionId: sessionB, runtimeId: tabB,
  }, sessionA, tabA), false);
  assert.equal(isTabSessionOccupied({
    kind: 'occupied', sessionId: sessionB, targetId: tabA,
  }, sessionA, tabA), false);
});
