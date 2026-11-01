import assert from 'node:assert/strict'
import test from 'node:test'
import { isReplenishmentPilotUser } from './access.ts'

test('solo el correo del propietario recibe acceso al piloto', () => {
  assert.equal(isReplenishmentPilotUser('hhector7722@gmail.com'), true)
  assert.equal(isReplenishmentPilotUser(' HHECTOR7722@GMAIL.COM '), true)
  for (const email of [null, undefined, '', 'fogotorrat@gmail.com', 'empleado@example.com',
    'hhector7722@gmail.com.evil.com']) {
    assert.equal(isReplenishmentPilotUser(email), false)
  }
})
