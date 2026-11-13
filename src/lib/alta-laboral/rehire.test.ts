import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRehireDraft } from './rehire.ts';

test('reincorporar prepara copia sin reutilizar fechas ni modificar origen', () => {
  const person = {
    first_name: 'Alba', last_name: 'Pérez', dni: '1234A',
    afiliacion_seguridad_social: '999', nacionalidad: 'Española',
    fecha_nacimiento: '1996-03-04', domicilio: 'Barcelona', phone: '666777888',
    email: 'alba@example.com', bank_account: 'ES1200000000000000000000',
    contracted_hours_weekly: 24,
  };
  const prior = { categoria: 'Camarera', tipo_contrato: 'Temporal', weekly_hours: 16, fecha_inicio: '2025-01-01', fecha_fin: '2025-08-01' };
  const draft = buildRehireDraft(person, prior, { weekly_hours: 28 });
  assert.equal(draft.categoria, 'Camarera');
  assert.equal(draft.weekly_hours, 28);
  assert.equal(draft.fecha_inicio, null);
  assert.equal(draft.fecha_fin, null);
  assert.equal(person.contracted_hours_weekly, 24);
  assert.equal(prior.fecha_inicio, '2025-01-01');
});

test('no inventa datos ausentes del trabajador', () => {
  const empty = { first_name: 'Alba', last_name: null, dni: null, afiliacion_seguridad_social: null, nacionalidad: null, fecha_nacimiento: null, domicilio: null, phone: null, email: null, bank_account: null, contracted_hours_weekly: null };
  const draft = buildRehireDraft(empty, null, null);
  assert.equal(draft.dni, null);
  assert.equal(draft.categoria, null);
  assert.equal(draft.weekly_hours, null);
  assert.equal(draft.fecha_inicio, null);
});
