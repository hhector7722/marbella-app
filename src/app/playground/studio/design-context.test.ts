import test from 'node:test';
import assert from 'node:assert/strict';
import { cssVarsDelContexto, getSandboxSpacingTokens, resolverReceta } from './design-context.ts';

test('the sandbox spacing tokens grow when air becomes stronger', () => {
  const base = resolverReceta({ aire: 'nada', densidad: 'nada', profundidad: 'nada', contraste: 'nada' });
  const strong = resolverReceta({ aire: 'fuerte', densidad: 'nada', profundidad: 'nada', contraste: 'nada' });

  const baseTokens = getSandboxSpacingTokens(base);
  const strongTokens = getSandboxSpacingTokens(strong);

  assert.ok(Number(strongTokens['--marbella-space-2'].replace('rem', '')) > Number(baseTokens['--marbella-space-2'].replace('rem', '')));
  assert.ok(Number(strongTokens['--marbella-space-3'].replace('rem', '')) > Number(baseTokens['--marbella-space-3'].replace('rem', '')));
});

test('the live CSS contract exposes air as a scoped design variable', () => {
  const base = cssVarsDelContexto(resolverReceta({ aire: 'nada' }));
  const strong = cssVarsDelContexto(resolverReceta({ aire: 'fuerte' }));

  assert.equal(base['--dl-space'], '1');
  assert.equal(strong['--dl-space'], '1.56');
  assert.equal(base['--marbella-space-4'], '1rem');
  assert.equal(strong['--marbella-space-4'], '1.56rem');
});
