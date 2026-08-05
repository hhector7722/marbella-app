import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PAYROLL_SUMMARY_PARSER_VERSION,
  parseCompanySummaryPdfData,
  parseEuroNumber,
} from './company-summary-parser.ts';
import { hashPayrollPdf } from './content-hash.ts';

function createMockPdfData(params?: {
  period?: string;
  worker1Cost?: number;
  worker2Cost?: number;
  totalCompanyCostOverride?: number;
}) {
  const pStart = '01/07/2026';
  const pEnd = '31/07/2026';

  const w1Cost = params?.worker1Cost ?? 2449.00;
  const w2Cost = params?.worker2Cost ?? 940.95;
  const totalCost = params?.totalCompanyCostOverride ?? (w1Cost + w2Cost);

  return {
    Pages: [
      {
        Texts: [
          // Cabecera
          { x: 2.1, y: 4.4, R: [{ T: encodeURIComponent(`PAGA TOTAL DEL ${pStart} AL ${pEnd}`) }] },
          { x: 4.0, y: 5.8, R: [{ T: encodeURIComponent('Empresa 9022 - EL FOGO TORRAT,S.L.U.') }] },
          { x: 29.9, y: 5.8, R: [{ T: encodeURIComponent('N.I.F. B09761628') }] },
          { x: 41.6, y: 5.8, R: [{ T: encodeURIComponent('Fecha Listado 31/07/2026') }] },
          { x: 2.1, y: 12.2, R: [{ T: encodeURIComponent('CENTRO: 1 |EL FOGO TORRAT S.L.') }] },

          // Trabajador 1 (MAMADOU NYANDAYE - Nómina ordinaria)
          { x: 1.9, y: 22.2, R: [{ T: encodeURIComponent('000061') }] },
          { x: 3.6, y: 22.2, R: [{ T: encodeURIComponent('MAMADOU NYANDAYE') }] },
          { x: 13.6, y: 22.2, R: [{ T: encodeURIComponent('1.853,19') }] }, // BRUT
          { x: 16.5, y: 22.2, R: [{ T: encodeURIComponent('1.853,19') }] }, // BASE IRPF
          { x: 18.9, y: 22.2, R: [{ T: encodeURIComponent('-120,45') }] }, // RETENCION
          { x: 21.4, y: 22.2, R: [{ T: encodeURIComponent('1.853,19') }] }, // BASE CC
          { x: 24.0, y: 22.2, R: [{ T: encodeURIComponent('1.853,19') }] }, // BASE AT
          { x: 26.7, y: 22.2, R: [{ T: encodeURIComponent('-120,45') }] }, // SS TREB
          { x: 29.3, y: 22.2, R: [{ T: encodeURIComponent('595,81') }] }, // SS EMP
          { x: 31.9, y: 22.2, R: [{ T: encodeURIComponent('716,26') }] }, // TC1
          { x: 34.4, y: 22.2, R: [{ T: encodeURIComponent(w1Cost === 2449 ? '2.449,00' : String(w1Cost)) }] }, // COST TOTAL
          { x: 37.1, y: 22.2, R: [{ T: encodeURIComponent('1.692,94') }] }, // LIQUIDO

          // Trabajador 1 (MAMADOU NYANDAYE - Finiquito / Liquidación 2)
          { x: 1.9, y: 23.2, R: [{ T: encodeURIComponent('000061') }] },
          { x: 3.6, y: 23.2, R: [{ T: encodeURIComponent('MAMADOU NYANDAYE') }] },
          { x: 13.7, y: 23.2, R: [{ T: encodeURIComponent('764,64') }] }, // BRUT
          { x: 16.5, y: 23.2, R: [{ T: encodeURIComponent('764,64') }] }, // BASE IRPF
          { x: 18.9, y: 23.2, R: [{ T: encodeURIComponent('-35,64') }] }, // RETENCION
          { x: 21.5, y: 23.2, R: [{ T: encodeURIComponent('548,34') }] }, // BASE CC
          { x: 24.1, y: 23.2, R: [{ T: encodeURIComponent('548,34') }] }, // BASE AT
          { x: 26.7, y: 23.2, R: [{ T: encodeURIComponent('-35,64') }] }, // SS TREB
          { x: 29.3, y: 23.2, R: [{ T: encodeURIComponent('176,31') }] }, // SS EMP
          { x: 31.9, y: 23.2, R: [{ T: encodeURIComponent('211,95') }] }, // TC1
          { x: 34.4, y: 23.2, R: [{ T: encodeURIComponent('940,9') }] }, // COST TOTAL (Parte 1)
          { x: 36.4, y: 23.2, R: [{ T: encodeURIComponent('5') }] }, // COST TOTAL (Parte 2 -> 940,95)
          { x: 37.1, y: 23.2, R: [{ T: encodeURIComponent('729,00') }] }, // LIQUIDO

          // Bloque Totales (Línea 1)
          { x: 1.9, y: 28.0, R: [{ T: encodeURIComponent('TOTAL EMPRESA') }] },
          { x: 16.0, y: 28.0, R: [{ T: encodeURIComponent('2.617,83') }] }, // BRUT TOTAL
          { x: 21.2, y: 28.0, R: [{ T: encodeURIComponent('2.401,53') }] }, // BASE CC TOTAL
          { x: 26.5, y: 28.0, R: [{ T: encodeURIComponent('-156,09') }] }, // SS TREB TOTAL
          { x: 31.6, y: 28.0, R: [{ T: encodeURIComponent('928,21') }] }, // TC1 TOTAL
          { x: 36.7, y: 28.0, R: [{ T: encodeURIComponent('2.421,94') }] }, // LIQUIDO TOTAL

          // Bloque Totales (Línea 2 - Sub-fila)
          { x: 13.5, y: 28.5, R: [{ T: encodeURIComponent('2.617,83') }] }, // BASE IRPF TOTAL
          { x: 18.7, y: 28.5, R: [{ T: encodeURIComponent('-156,09') }] }, // RETENCION TOTAL
          { x: 23.7, y: 28.5, R: [{ T: encodeURIComponent('2.401,53') }] }, // BASE AT TOTAL
          { x: 29.1, y: 28.5, R: [{ T: encodeURIComponent('772,12') }] }, // SS EMP TOTAL
          { x: 34.5, y: 28.5, R: [{ T: encodeURIComponent(totalCost.toLocaleString('es-ES', { minimumFractionDigits: 2 })) }] }, // COST TOTAL (16.813,06 €)
        ],
      },
    ],
  };
}

describe('PAYROLL_SUMMARY_PARSER_VERSION', () => {
  it('es 2', () => {
    assert.equal(PAYROLL_SUMMARY_PARSER_VERSION, 2);
  });
});

describe('parseEuroNumber', () => {
  it('parsea formato europeo', () => {
    assert.equal(parseEuroNumber('16.813,06'), 16813.06);
    assert.equal(parseEuroNumber('940,95'), 940.95);
    assert.equal(parseEuroNumber('0,00'), 0);
  });
});

describe('parseCompanySummaryPdfData (Parser v2 Estructurado por Coordenadas)', () => {
  it('parsea correctamente las liquidaciones independientes de un mismo trabajador (Mamadou Nyandaye x2)', () => {
    const pdfData = createMockPdfData();
    const res = parseCompanySummaryPdfData(pdfData);

    assert.equal(res.ok, true);
    if (!res.ok) return;

    assert.equal(res.header.periodYm, '2026-07');
    assert.equal(res.header.company, 'EL FOGO TORRAT,S.L.U.');
    assert.equal(res.header.nif, 'B09761628');
    assert.equal(res.employees.length, 2);

    // Fila 1: Nómina Mamadou
    assert.equal(res.employees[0]!.employeeCode, '000061');
    assert.equal(res.employees[0]!.employeeName, 'MAMADOU NYANDAYE');
    assert.equal(res.employees[0]!.grossSalary, 1853.19);
    assert.equal(res.employees[0]!.companyCost, 2449.00);
    assert.equal(res.employees[0]!.netSalary, 1692.94);

    // Fila 2: Finiquito Mamadou
    assert.equal(res.employees[1]!.employeeCode, '000061');
    assert.equal(res.employees[1]!.employeeName, 'MAMADOU NYANDAYE');
    assert.equal(res.employees[1]!.grossSalary, 764.64);
    assert.equal(res.employees[1]!.companyCost, 940.95);
    assert.equal(res.employees[1]!.netSalary, 729.00);

    // Totales
    assert.equal(res.totals.totalCompanyCost, 3389.95);
    assert.equal(res.totalCompanyCost, 3389.95);
    assert.equal(res.labelUsed, 'COST TOTAL');
  });

  it('rechaza el documento si la suma de costes de liquidaciones no coincide con COST TOTAL', () => {
    const pdfData = createMockPdfData({ totalCompanyCostOverride: 9999.99 });
    const res = parseCompanySummaryPdfData(pdfData);

    assert.equal(res.ok, false);
    if (res.ok) return;

    assert.match(res.error, /Inconsistencia en PDF/i);
    assert.equal(res.candidatesNearLabel.includes(9999.99), true);
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
