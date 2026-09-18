import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  partitionMissingPayrollMonths,
  payrollAbsenceNotice,
} from './payroll-month-status.ts';

describe('partitionMissingPayrollMonths', () => {
  it('el mes en curso sin resumen es esperado', () => {
    const { expectedPending, unexpectedMissing } = partitionMissingPayrollMonths(
      ['2026-09'],
      '2026-09-18',
    );
    assert.deepEqual(expectedPending, ['2026-09']);
    assert.deepEqual(unexpectedMissing, []);
  });

  it('un mes cerrado sin resumen es inesperado', () => {
    const { expectedPending, unexpectedMissing } = partitionMissingPayrollMonths(
      ['2026-08'],
      '2026-09-18',
    );
    assert.deepEqual(expectedPending, []);
    assert.deepEqual(unexpectedMissing, ['2026-08']);
  });

  it('un mes futuro sin resumen es esperado', () => {
    const { expectedPending, unexpectedMissing } = partitionMissingPayrollMonths(
      ['2026-10'],
      '2026-09-18',
    );
    assert.deepEqual(expectedPending, ['2026-10']);
    assert.deepEqual(unexpectedMissing, []);
  });

  it('separa un rango con mes cerrado y mes en curso', () => {
    const { expectedPending, unexpectedMissing } = partitionMissingPayrollMonths(
      ['2026-08', '2026-09'],
      '2026-09-18',
    );
    assert.deepEqual(expectedPending, ['2026-09']);
    assert.deepEqual(unexpectedMissing, ['2026-08']);
  });
});

describe('payrollAbsenceNotice', () => {
  it('el mes en curso habla de pendiente, no de error', () => {
    const notice = payrollAbsenceNotice(['2026-09'], '2026-09-18');
    assert.equal(notice?.variant, 'info');
    assert.equal(notice?.title, 'Nómina pendiente');
    assert.match(notice?.body ?? '', /solo se cuentan las extras/);
    assert.doesNotMatch(notice?.body ?? '', /payroll_/);
  });

  it('un mes cerrado grita que falta el resumen', () => {
    const notice = payrollAbsenceNotice(['2026-08'], '2026-09-18');
    assert.equal(notice?.variant, 'negative');
    assert.equal(notice?.title, 'Falta el resumen de agosto');
    assert.match(notice?.body ?? '', /desconocido/);
  });

  it('si hay mes cerrado y mes en curso, manda el error', () => {
    const notice = payrollAbsenceNotice(['2026-08', '2026-09'], '2026-09-18');
    assert.equal(notice?.variant, 'negative');
    assert.match(notice?.title ?? '', /agosto/);
    assert.match(notice?.body ?? '', /septiembre/);
  });

  it('sin huecos no hay aviso', () => {
    assert.equal(payrollAbsenceNotice([], '2026-09-18'), null);
  });
});
