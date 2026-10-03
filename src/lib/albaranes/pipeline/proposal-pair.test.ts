import assert from 'node:assert/strict'
import test from 'node:test'
import { proposalMappingPair } from './proposal-pair.ts'

test('conserva la pareja completa de un mapping candidato', () => {
  assert.deepEqual(proposalMappingPair('ingredient', 'version'),
    { ingredientId: 'ingredient', mappingVersionId: 'version' })
})

test('una identidad sin presentación queda como sugerencia sin pareja económica', () => {
  assert.deepEqual(proposalMappingPair('ingredient', null),
    { ingredientId: null, mappingVersionId: null })
})
