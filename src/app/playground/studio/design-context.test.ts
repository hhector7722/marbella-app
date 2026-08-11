import test from 'node:test';
import assert from 'node:assert/strict';
import { cssVarsDelContexto, getSandboxSpacingTokens, resolverReceta } from './design-context.ts';

test('the sandbox spacing scale separates all four air intensities', () => {
  const levels = (['nada', 'sutil', 'moderado', 'fuerte'] as const).map(aire =>
    resolverReceta({ aire, densidad: 'nada', profundidad: 'nada', contraste: 'nada' }).space,
  );

  assert.deepEqual(levels, [0.82, 1, 1.28, 1.72]);
  assert.ok(levels[3] - levels[0] >= 0.9);

  const baseTokens = getSandboxSpacingTokens(resolverReceta({ aire: 'nada' }));
  const strongTokens = getSandboxSpacingTokens(resolverReceta({ aire: 'fuerte' }));
  assert.ok(Number(strongTokens['--marbella-space-4'].replace('rem', '')) > Number(baseTokens['--marbella-space-4'].replace('rem', '')));
});

test('the original aesthetic preserves the real app base scale', () => {
  assert.equal(resolverReceta({}).space, 1);
});

test('the live CSS contract exposes air as a scoped design variable', () => {
  const base = cssVarsDelContexto(resolverReceta({ aire: 'nada' }));
  const strong = cssVarsDelContexto(resolverReceta({ aire: 'fuerte' }));

  assert.equal(base['--dl-space'], '0.82');
  assert.equal(strong['--dl-space'], '1.72');
  assert.equal(base['--dl-space-section'], '0.9184');
  assert.equal(strong['--dl-space-section'], '1.9264');
  assert.equal(base['--dl-space-row'], '0.724');
  assert.equal(strong['--dl-space-row'], '1.354');
  assert.equal(resolverReceta({ aire: 'nada' }).typeScale, resolverReceta({ aire: 'fuerte' }).typeScale);
});
