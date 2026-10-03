import assert from 'node:assert/strict'
import test from 'node:test'
import { documentPagesReady } from './pages.ts'

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
