import assert from 'node:assert/strict'
import test from 'node:test'
import { proposalAncestryIds, selectCurrentProposalLineage } from './proposal-lineage.ts'

test('oculta hojas antiguas sin sucesor cuando una recalculación cambia las filas', () => {
  const rows = [
    { id: 'old-total-1', proposal_set_id: 'set-old', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:20:00Z' },
    { id: 'old-total-2', proposal_set_id: 'set-old', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:20:00Z' },
    { id: 'new-product-1', proposal_set_id: 'set-new', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:30:00Z' },
    { id: 'new-product-2', proposal_set_id: 'set-new', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:30:00Z' },
  ]

  assert.deepEqual(
    selectCurrentProposalLineage(rows).map((row) => row.id).sort(),
    ['new-product-1', 'new-product-2']
  )
})

test('sigue la revisión humana descendiente del último set y oculta su raíz', () => {
  const rows = [
    { id: 'base-a', proposal_set_id: 'set-new', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:30:00Z' },
    { id: 'base-b', proposal_set_id: 'set-new', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:30:00Z' },
    { id: 'review-a', proposal_set_id: 'review-set-a', supersedes_proposal_id: 'base-a', provenance: { source: 'docling_evidence', revision: 'human_mapping_selection' }, created_at: '2026-09-16T00:35:00Z' },
  ]

  assert.deepEqual(
    selectCurrentProposalLineage(rows).map((row) => row.id).sort(),
    ['base-b', 'review-a']
  )
})

test('una revisión humana posterior no se confunde con una nueva generación base', () => {
  const rows = [
    { id: 'old-base', proposal_set_id: 'set-old', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:10:00Z' },
    { id: 'new-base', proposal_set_id: 'set-new', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:20:00Z' },
    { id: 'new-review', proposal_set_id: 'review-set', supersedes_proposal_id: 'new-base', provenance: { revision: 'human_mapping_selection' }, created_at: '2026-09-16T00:40:00Z' },
  ]

  assert.deepEqual(selectCurrentProposalLineage(rows).map((row) => row.id), ['new-review'])
})

test('una recalculación puede resolver la línea económica inmutable a través de su ancestro confirmado', () => {
  const rows = [
    { id: 'base-v2', proposal_set_id: 'set-v2', supersedes_proposal_id: null, provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:20:00Z' },
    { id: 'human-confirmed', proposal_set_id: 'review', supersedes_proposal_id: 'base-v2', provenance: { revision: 'human_mapping_selection' }, created_at: '2026-09-16T00:25:00Z' },
    { id: 'base-v3', proposal_set_id: 'set-v3', supersedes_proposal_id: 'human-confirmed', provenance: { source: 'docling_evidence' }, created_at: '2026-09-16T00:30:00Z' },
  ]

  assert.deepEqual(proposalAncestryIds(rows, 'base-v3'), ['base-v3', 'human-confirmed', 'base-v2'])
})
