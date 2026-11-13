import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ultraWideDevice } from './preferred-camera.ts'

test('escoge objetivo ultra gran angular frente a cámara trasera normal', () => {
  const devices = [
    { kind: 'videoinput', label: 'Front Ultra Wide Camera', deviceId: 'front-wide' },
    { kind: 'videoinput', label: 'Back Camera', deviceId: 'back' },
    { kind: 'videoinput', label: 'Back Ultra Wide Camera', deviceId: 'wide' },
  ] as MediaDeviceInfo[]
  assert.equal(ultraWideDevice(devices)?.deviceId, 'wide')
})

test('reconoce gran angular en español y 0,5x', () => {
  const devices = [
    { kind: 'videoinput', label: 'Cámara trasera Ultra gran angular', deviceId: 'wide-es' },
  ] as MediaDeviceInfo[]
  assert.equal(ultraWideDevice(devices)?.deviceId, 'wide-es')
  assert.equal(ultraWideDevice([{ kind: 'videoinput', label: '0.5x', deviceId: 'w' }] as MediaDeviceInfo[])?.deviceId, 'w')
})

test('no promete gran angular cuando no hay lente identificable', () => {
  assert.equal(ultraWideDevice([{ kind: 'videoinput', label: 'Back Camera', deviceId: 'back' }] as MediaDeviceInfo[]), undefined)
})
