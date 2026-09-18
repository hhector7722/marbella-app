import assert from 'node:assert/strict'
import test from 'node:test'
import {
  isK5ReusableMappingVersion,
  isTrustedLegacyImportedMappingVersion,
  trustedLegacyImportIdempotencyKey,
} from './trusted-mapping.ts'

test('mapping confirmado siempre es reutilizable', () => {
  assert.equal(isK5ReusableMappingVersion({ status: 'confirmed' }), true)
})

test('legacy proposed solo es reutilizable con provenance estructural exacta', () => {
  const legacyId = '11111111-1111-4111-8111-111111111111'
  const trusted = {
    status: 'proposed',
    legacy_mapping_id: legacyId,
    idempotency_key: trustedLegacyImportIdempotencyKey(legacyId),
  }
  assert.equal(isTrustedLegacyImportedMappingVersion(trusted), true)
  assert.equal(isK5ReusableMappingVersion(trusted), true)

  assert.equal(isK5ReusableMappingVersion({ ...trusted, idempotency_key: 'other' }), false)
  assert.equal(isK5ReusableMappingVersion({ ...trusted, legacy_mapping_id: null }), false)
  assert.equal(isK5ReusableMappingVersion({ status: 'proposed' }), false)
})
