import test from 'node:test';
import assert from 'node:assert/strict';
import { getSandboxSpacingTokens, resolverReceta } from './design-context.ts';

test('the sandbox spacing tokens grow when air becomes stronger', () => {
  const base = resolverReceta({ aire: 'nada', densidad: 'nada', profundidad: 'nada', contraste: 'nada' });
  const strong = resolverReceta({ aire: 'fuerte', densidad: 'nada', profundidad: 'nada', contraste: 'nada' });

  const baseTokens = getSandboxSpacingTokens(base);
  const strongTokens = getSandboxSpacingTokens(strong);

  assert.ok(Number(strongTokens['--marbella-space-2'].replace('rem', '')) > Number(baseTokens['--marbella-space-2'].replace('rem', '')));
  assert.ok(Number(strongTokens['--marbella-space-3'].replace('rem', '')) > Number(baseTokens['--marbella-space-3'].replace('rem', '')));
});
