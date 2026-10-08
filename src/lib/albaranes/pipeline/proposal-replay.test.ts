import assert from 'node:assert/strict'
import { test } from 'node:test'
import { selectReplayProposals } from './proposal-replay.ts'

const base = (id: string, hash: string, revision = false) => ({
  id, source_row_index: 0, supplier_profile_hash: hash,
  provenance: revision ? { revision: 'human' } : { source: 'mistral_canonical' },
})

test('una línea antigua sin revisión se reevalúa y conserva su antecesor', () => {
  const selected = selectReplayProposals([base('old', 'v4')], 'v5', new Set())
  assert.equal(selected.currentByRow.get(0), undefined)
  assert.equal(selected.previousByRow.get(0), 'old')
})

test('una revisión humana prevalece sobre el perfil nuevo', () => {
  const selected = selectReplayProposals([base('old', 'v4'), base('human', 'v4', true)], 'v5', new Set(['old']))
  assert.equal(selected.currentByRow.get(0), 'human')
  assert.equal(selected.previousByRow.get(0), 'old')
})

test('una propuesta ya sustituida no recibe otro sucesor', () => {
  const selected = selectReplayProposals([base('old', 'v4')], 'v5', new Set(['old']))
  assert.equal(selected.currentByRow.get(0), 'old')
})

test('reprocesar el mismo perfil reutiliza la propuesta vigente', () => {
  const selected = selectReplayProposals([base('old', 'v4'), base('new', 'v5')], 'v5', new Set(['old']))
  assert.equal(selected.currentByRow.get(0), 'new')
})
