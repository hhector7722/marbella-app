import assert from 'node:assert/strict'
import test from 'node:test'

import { requiresRacionChoice } from './staff-consumption-display.ts'

test('un bocadillo directo pide entero o medio', () => {
  assert.equal(
    requiresRacionChoice({
      name: 'Bocadillo de jamón',
      category: 'Bocadillos',
      has_subrecipes: false,
    }),
    true,
  )
})

test('una elaboración dentro del bocadillo no ofrece media ración', () => {
  assert.equal(
    requiresRacionChoice({
      name: 'Bocadillo de calamares',
      category: 'Bocadillos',
      has_subrecipes: true,
    }),
    false,
  )
})

test('si no se sabe si hay subrecetas, no se ofrece media ración', () => {
  assert.equal(
    requiresRacionChoice({
      name: 'Bocadillo de tortilla',
      category: null,
      has_subrecipes: true,
    }),
    false,
  )
})

test('los bocadillos sin medio siguen añadiéndose enteros', () => {
  assert.equal(
    requiresRacionChoice({
      name: 'Hamburguesa',
      category: 'Bocadillos',
      has_subrecipes: false,
    }),
    false,
  )
})

test('una receta que no es bocadillo no pide ración', () => {
  assert.equal(
    requiresRacionChoice({
      name: 'Pasta carbonara',
      category: 'Pastas',
      has_subrecipes: false,
    }),
    false,
  )
})
