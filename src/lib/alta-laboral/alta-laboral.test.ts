import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canGenerateAltaPdf, missingAltaPdfFields } from './completeness.ts';
import { formatCivilDateEs } from './dates.ts';
import { candidateToRow, intakeToProfilePatch } from './mapping.ts';
import { buildAltaLaboralPdf } from '../pdf/alta-laboral-pdf.ts';
import { appendGmailAddress, DEFAULT_CANDIDATE_EMAIL, digitsPhoneEs } from './contact.ts';
import { NACIONALIDADES } from './nacionalidades.ts';
import { candidateFieldsSchema, contractFieldsSchema } from './schema.ts';
import { generateIntakeToken, hashIntakeToken } from './token.ts';
import type { EmploymentIntakeRow } from './types.ts';

function baseRow(overrides: Partial<EmploymentIntakeRow> = {}): EmploymentIntakeRow {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    token_hash: 'abc',
    status: 'completed',
    expires_at: '2099-01-01T00:00:00.000Z',
    created_by: null,
    created_at: '2026-09-18T00:00:00.000Z',
    submitted_at: '2026-09-18T00:00:00.000Z',
    completed_at: '2026-09-18T00:00:00.000Z',
    applied_at: null,
    revoked_at: null,
    first_name: 'Hector',
    last_name: 'Sanchez',
    dni: '47951446B',
    afiliacion_seguridad_social: '08 12535514 76',
    nacionalidad: 'España',
    fecha_nacimiento: '1992-11-04',
    domicilio: 'Avinguda Mare de Déu de Montserrat 143',
    phone: '+34647229309',
    email: 'hhector7722@gmail.com',
    bank_account: 'ES9121000418450200051332',
    dni_front_storage_path: 'intakes/x/delantera.jpg',
    dni_back_storage_path: 'intakes/x/trasera.jpg',
    categoria: 'Camarero',
    tipo_contrato: 'Indefinido',
    weekly_hours: 40,
    fecha_inicio: '2026-10-01',
    fecha_fin: null,
    profile_id: null,
    ...overrides,
  };
}

describe('alta laboral', () => {
  it('hashea el token de forma determinista y no lo deja en claro', () => {
    const token = generateIntakeToken();
    assert.equal(hashIntakeToken(token), hashIntakeToken(token));
    assert.notEqual(hashIntakeToken(token), token);
    assert.equal(hashIntakeToken(token).length, 64);
  });

  it('no genera PDF si falta un dato vital', () => {
    const incomplete = baseRow({ categoria: null, weekly_hours: null });
    assert.equal(canGenerateAltaPdf(incomplete), false);
    const labels = missingAltaPdfFields(incomplete).map((f) => f.label);
    assert.ok(labels.includes('Categoría'));
    assert.ok(labels.includes('Horas semanales'));
    assert.equal(canGenerateAltaPdf(baseRow()), true);
    assert.throws(
      () => buildAltaLaboralPdf({ row: incomplete, frontImage: null, backImage: null }),
      /Faltan datos para el PDF/,
    );
    const pdf = buildAltaLaboralPdf({ row: baseRow(), frontImage: null, backImage: null });
    assert.ok(pdf.bytes.byteLength > 100);
    assert.match(pdf.filename, /^alta-laboral-hector-sanchez\.pdf$/);
  });

  it('mapea el expediente al parche de perfil sin categoría ni tipo de contrato', () => {
    const patch = intakeToProfilePatch(baseRow());
    assert.equal(patch.first_name, 'Hector');
    assert.equal(patch.bank_account, 'ES9121000418450200051332');
    assert.equal(patch.joining_date, '2026-10-01');
    assert.equal(patch.contracted_hours_weekly, 40);
    assert.equal(patch.role, 'staff');
    assert.equal('categoria' in patch, false);
  });

  it('formatea la fecha civil por componentes, no con Date ISO', () => {
    assert.equal(formatCivilDateEs('1992-11-04'), '4 de noviembre de 1992');
    assert.equal(formatCivilDateEs('no-es-fecha'), '');
  });

  it('valida al candidato y el contrato', () => {
    const candidate = candidateFieldsSchema.safeParse({
      firstName: 'Ana',
      lastName: 'López',
      dni: '12345678Z',
      afiliacionSeguridadSocial: '08 12345678 90',
      nacionalidad: 'España',
      fechaNacimiento: '1990-01-15',
      domicilio: 'Carrer Exemple 1',
      phone: '600000000',
      email: 'ana@example.com',
      bankAccount: 'ES91 2100 0418 4502 0005 1332',
    });
    assert.equal(candidate.success, true);
    if (candidate.success) {
      assert.equal(candidate.data.bankAccount, 'ES9121000418450200051332');
    }

    const badDate = candidateFieldsSchema.safeParse({
      firstName: 'Ana',
      lastName: 'López',
      dni: '12345678Z',
      afiliacionSeguridadSocial: '08',
      nacionalidad: 'España',
      fechaNacimiento: '1990-13-40',
      domicilio: 'Carrer',
      phone: '600',
      email: 'ana@example.com',
      bankAccount: 'ES9121000418450200051332',
    });
    assert.equal(badDate.success, false);

    const contract = contractFieldsSchema.safeParse({
      categoria: 'Cocinero',
      tipoContrato: 'Temporal',
      weeklyHours: '20',
      fechaInicio: '2026-10-01',
      fechaFin: '2026-09-01',
    });
    assert.equal(contract.success, false);

    const row = candidateToRow({
      firstName: 'Ana',
      lastName: 'López',
      dni: '12345678Z',
      afiliacionSeguridadSocial: '08',
      nacionalidad: 'España',
      fechaNacimiento: '1990-01-15',
      domicilio: 'Carrer',
      phone: '600',
      email: 'ana@example.com',
      bankAccount: 'ES9121000418450200051332',
    });
    assert.equal(row.first_name, 'Ana');
  });

  it('pone España primera y el resto en orden alfabético', () => {
    assert.equal(NACIONALIDADES[0], 'España');
    const rest = NACIONALIDADES.slice(1);
    const sorted = [...rest].toSorted((a, b) => a.localeCompare(b, 'es'));
    assert.deepEqual(rest, sorted);
  });

  it('exige teléfono de 9 dígitos y acepta el prefijo 34', () => {
    assert.equal(digitsPhoneEs('600 12 34 56'), '600123456');
    assert.equal(digitsPhoneEs('+34600123456'), '600123456');
    const short = candidateFieldsSchema.safeParse({
      firstName: 'Ana',
      lastName: 'López',
      dni: '12345678Z',
      afiliacionSeguridadSocial: '08',
      nacionalidad: 'España',
      fechaNacimiento: '1990-01-15',
      domicilio: 'Carrer',
      phone: '60012345',
      email: 'ana@example.com',
      bankAccount: 'ES9121000418450200051332',
    });
    assert.equal(short.success, false);
    const prefixed = candidateFieldsSchema.safeParse({
      firstName: 'Ana',
      lastName: 'López',
      dni: '12345678Z',
      afiliacionSeguridadSocial: '08',
      nacionalidad: 'España',
      fechaNacimiento: '1990-01-15',
      domicilio: 'Carrer',
      phone: '+34600123456',
      email: 'ana@example.com',
      bankAccount: 'ES9121000418450200051332',
    });
    assert.equal(prefixed.success, true);
    if (prefixed.success) assert.equal(prefixed.data.phone, '600123456');
  });

  it('añade @gmail.com al correo', () => {
    assert.equal(appendGmailAddress('hector'), 'hector@gmail.com');
    assert.equal(appendGmailAddress('hector@outlook.com'), 'hector@gmail.com');
    assert.equal(DEFAULT_CANDIDATE_EMAIL, '@gmail.com');
  });
});
