import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAYROLL_SUMMARY_PARSER_VERSION,
  parseCompanySummaryText,
  parseEuroNumber,
} from './company-summary-parser.ts';
import { hashPayrollPdf } from './content-hash.ts';

function fixtureMayLayout(total = '12.285,92'): string {
  return `
PAGA TOTAL DEL 01/05/2026 AL 31/05/2026
10.860,66
12.056,53
-785,96
3.966,20
      ${total}
TOTAL CENTRO
      ${total}
        -418,50
`;
}

function fixtureEmpresaLayout(total = '12.111,84'): string {
  return `
PAGA TOTAL DEL 01/06/2026 AL 30/06/2026
      ${total}
TOTAL EMPRESA
      ${total}
`;
}

describe('PAYROLL_SUMMARY_PARSER_VERSION', () => {
  it('es 1', () => {
    assert.equal(PAYROLL_SUMMARY_PARSER_VERSION, 1);
  });
});

describe('parseEuroNumber', () => {
  it('parsea formato europeo', () => {
    assert.equal(parseEuroNumber('12.285,92'), 12285.92);
    assert.equal(parseEuroNumber('11.814,03'), 11814.03);
  });
});

describe('parseCompanySummaryText', () => {
  it('PDF correcto TOTAL CENTRO (layout mayo)', () => {
    const r = parseCompanySummaryText(fixtureMayLayout());
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.totalCompanyCost, 12285.92);
    assert.equal(r.periodYm, '2026-05');
    assert.equal(r.periodStart, '2026-05-01');
    assert.equal(r.periodEnd, '2026-05-31');
    assert.equal(r.labelUsed, 'TOTAL CENTRO');
    assert.equal(r.amountBefore, 12285.92);
    assert.equal(r.amountAfter, 12285.92);
  });

  it('PDF correcto TOTAL EMPRESA', () => {
    const r = parseCompanySummaryText(fixtureEmpresaLayout());
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.totalCompanyCost, 12111.84);
    assert.equal(r.labelUsed, 'TOTAL EMPRESA');
    assert.equal(r.periodYm, '2026-06');
  });

  it('no elige un importe mayor cercano no asociado a la etiqueta', () => {
    const text = `
PAGA TOTAL DEL 01/05/2026 AL 31/05/2026
99.999,99
3.966,20
      12.285,92
TOTAL CENTRO
      12.285,92
`;
    const r = parseCompanySummaryText(text);
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.totalCompanyCost, 12285.92);
    assert.ok(!r.candidatesNearLabel.includes(99999.99));
  });

  it('importes repetidos coincidentes → OK', () => {
    const r = parseCompanySummaryText(fixtureMayLayout('12.000,00'));
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(r.totalCompanyCost, 12000);
  });

  it('antes ≠ después de la etiqueta → rechazo por ambigüedad', () => {
    const text = `
PAGA TOTAL DEL 01/05/2026 AL 31/05/2026
      10.000,00
TOTAL CENTRO
      12.285,92
`;
    const r = parseCompanySummaryText(text);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /Ambigüedad/i);
  });

  it('PDF sin TOTAL → rechazo', () => {
    const text = `
PAGA TOTAL DEL 01/05/2026 AL 31/05/2026
12.285,92
`;
    const r = parseCompanySummaryText(text);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /TOTAL/i);
  });

  it('formato inesperado sin periodo → rechazo', () => {
    const text = `
TOTAL CENTRO
12.285,92
`;
    const r = parseCompanySummaryText(text);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /periodo/i);
  });

  it('EMPRESA y CENTRO con importes distintos → rechazo', () => {
    const text = `
PAGA TOTAL DEL 01/06/2026 AL 30/06/2026
      12.000,00
TOTAL EMPRESA
      12.000,00
      13.000,00
TOTAL CENTRO
      13.000,00
`;
    const r = parseCompanySummaryText(text);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /≠|distintos|EMPRESA/i);
  });
});

describe('hashPayrollPdf', () => {
  it('es estable para el mismo buffer', () => {
    const a = hashPayrollPdf(Buffer.from('pdf-bytes'));
    const b = hashPayrollPdf(Buffer.from('pdf-bytes'));
    assert.equal(a, b);
    assert.equal(a.length, 64);
  });

  it('cambia si el contenido cambia', () => {
    const a = hashPayrollPdf(Buffer.from('pdf-a'));
    const b = hashPayrollPdf(Buffer.from('pdf-b'));
    assert.notEqual(a, b);
  });
});
