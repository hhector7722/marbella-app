import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../components/schedule/ScheduleDayEditor.tsx', import.meta.url), 'utf8');

test('el editor mantiene visibles tres importes con tres columnas independientes y sin recorte', () => {
  assert.match(source, /data-element="schedule-labor-summary"/);
  assert.match(source, /grid-cols-3/);
  for (const field of ['schedule-labor-total', 'schedule-labor-overtime', 'schedule-labor-required-sales']) {
    assert.match(source, new RegExp(`data-element="${field}"`));
  }
  assert.match(source, /formatPreview\(laborPreview\?\.cost\)/);
  assert.match(source, /formatPreview\(laborPreview\?\.overtimeCost\)/);
  assert.match(source, /formatPreview\(laborPreview\?\.requiredBilling\)/);
});
