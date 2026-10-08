import assert from 'node:assert/strict'
import test from 'node:test'
import { documentPagesReady, documentPageEvidenceBlockReason } from './pages.ts'

test('no recibe la primera hoja mientras falta otra declarada', () => {
  assert.equal(documentPagesReady({ expectedPages: 2, attachmentCount: 0,
    jobs: [{ id: 'main', status: 'leased' }], currentJobId: 'main' }), false)
})

test('espera a que el trabajo de la segunda hoja termine o llegue a su lease', () => {
  assert.equal(documentPagesReady({ expectedPages: 2, attachmentCount: 1,
    jobs: [{ id: 'main', status: 'leased' }, { id: 'extra', status: 'pending' }], currentJobId: 'main' }), false)
  assert.equal(documentPagesReady({ expectedPages: 2, attachmentCount: 1,
    jobs: [{ id: 'main', status: 'completed' }, { id: 'extra', status: 'leased' }], currentJobId: 'extra' }), true)
})

test('un trabajo fallido impide recibir parte de un documento', () => {
  assert.equal(documentPagesReady({ expectedPages: 2, attachmentCount: 1,
    jobs: [{ id: 'main', status: 'failed' }, { id: 'extra', status: 'leased' }], currentJobId: 'extra' }), false)
})

const h1 = 'a'.repeat(64)
const h2 = 'b'.repeat(64)
const pageJobs = [
  { id: 'main', status: 'completed', source_attachment_id: null, file_version_hash: h1,
    extractor_version: 'mistral-v1', replay_mode: 'live', evidence_extraction_id: 'ex1' },
  { id: 'extra', status: 'leased', source_attachment_id: 'attachment-1', file_version_hash: h2,
    extractor_version: 'mistral-v1', replay_mode: 'live', evidence_extraction_id: null },
]
const documentInput = {
  expectedPages: 2,
  pages: [{ attachmentId: null, fileHash: h1 },
    { attachmentId: 'attachment-1', fileHash: h2 }],
  jobs: pageJobs,
  extractions: [{ id: 'ex1', file_version_hash: h1, status: 'success' },
    { id: 'ex2', file_version_hash: h2, status: 'success' }],
  currentJobId: 'extra', currentExtractionId: 'ex2', extractorVersion: 'mistral-v1',
}

test('valida cada hoja Mistral live incluso si la actual sigue leased', () => {
  assert.equal(documentPageEvidenceBlockReason(documentInput), null)
})

test('no confunde relecturas historical con trabajos live', () => {
  assert.equal(documentPageEvidenceBlockReason({
    ...documentInput, jobs: pageJobs.map((job) =>
      job.id === 'main' ? { ...job, replay_mode: 'historical' } : job),
  }), 'document_page_jobs_missing_or_ambiguous')
})

test('no acepta extracción ausente aunque el job esté completed', () => {
  assert.equal(documentPageEvidenceBlockReason({
    ...documentInput, extractions: documentInput.extractions.slice(1),
  }), 'document_page_extraction_missing')
})

test('rechaza dos trabajos para la misma hoja', () => {
  assert.equal(documentPageEvidenceBlockReason({
    ...documentInput,
    jobs: [...pageJobs, { ...pageJobs[0]!, id: 'main-copy' }],
  }), 'document_page_jobs_missing_or_ambiguous')
})

test('rechaza una hoja con hash de otro original', () => {
  assert.equal(documentPageEvidenceBlockReason({
    ...documentInput,
    pages: [{ attachmentId: null, fileHash: h2 }, documentInput.pages[1]!],
  }), 'document_page_jobs_missing_or_ambiguous')
})
