import assert from 'node:assert/strict';
import test from 'node:test';
import { productionLinksForRecipe } from './recipe-production-links.ts';

test('platos con elaboración interna exponen botón de producción sin duplicados', () => {
  const lines = [
    { child: { id: 'a', name: 'Crema prod', is_sellable: false } },
    { child: { id: 'a', name: 'Crema prod', is_sellable: false } },
    { child: { id: 'b', name: 'Panadera prod', is_sellable: false } },
    { child: { id: 'c', name: 'Otro plato', is_sellable: true } },
  ];
  assert.deepEqual(productionLinksForRecipe(true, lines), [
    { id: 'a', name: 'Crema prod' },
    { id: 'b', name: 'Panadera prod' },
  ]);
  assert.deepEqual(productionLinksForRecipe(false, lines), []);
  assert.deepEqual(productionLinksForRecipe(true, []), []);
});

test('una producción sin vínculo de consumo no aparece como producción del plato', () => {
  const copiedButNotLinked = [
    { child: { id: 'verduras', name: 'Verduras horno', is_sellable: true } },
  ];
  assert.deepEqual(productionLinksForRecipe(true, copiedButNotLinked), []);
});
