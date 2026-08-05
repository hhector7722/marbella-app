/**
 * Parser v2 — Resumen de Nóminas SSOT (Estructurado por Coordenadas PDF).
 *
 * El parser es una función PURA sin efectos secundarios ni llamadas a Supabase.
 * Genera el objeto de dominio inmutable PayrollMonthSnapshot.
 */

import PDFParser from 'pdf2json';
import type {
  PayrollMonthSnapshot,
  PayrollSettlementDTO,
  PayrollSnapshotTotalsDTO,
  PayrollSnapshotHeaderDTO,
} from '../../types/payroll-snapshot.ts';
import { computeSettlementHash } from './settlement-hash.ts';

export const PAYROLL_SUMMARY_PARSER_VERSION = 2;

export type PayrollSummaryParseOk = {
  ok: true;
  snapshot: PayrollMonthSnapshot;
  // Campos retrocompatibles para consumidores
  header: PayrollSnapshotHeaderDTO;
  employees: PayrollSettlementDTO[];
  totals: PayrollSnapshotTotalsDTO;
  periodStart: string;
  periodEnd: string;
  periodYm: string;
  totalCompanyCost: number;
  labelUsed: 'COST TOTAL';
  amountBefore: number | null;
  amountAfter: number | null;
  candidatesNearLabel: number[];
  validationMessages: string[];
};

export type PayrollSummaryParseFail = {
  ok: false;
  error: string;
  validationMessages: string[];
  candidatesNearLabel: number[];
  periodStart?: string;
  periodEnd?: string;
  periodYm?: string;
};

export type PayrollSummaryParseResult = PayrollSummaryParseOk | PayrollSummaryParseFail;

export function parseEuroNumber(raw: string | null | undefined): number {
  if (!raw) return 0;
  const s = String(raw)
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Función PURA: Parsea la estructura JSON de pdf2json y devuelve PayrollMonthSnapshot.
 */
export function parseCompanySummaryPdfData(
  pdfData: any,
  options?: { contentHash?: string; filename?: string; source?: string },
): PayrollSummaryParseResult {
  const validationMessages: string[] = [];
  let periodStart = '';
  let periodEnd = '';
  let periodYm = '';
  let company = '';
  let nif = '';
  let listDate: string | null = null;
  let center: string | null = null;
  let totalWorkers: number | null = null;

  const settlements: PayrollSettlementDTO[] = [];
  let totals: PayrollSnapshotTotalsDTO | null = null;

  if (!pdfData || !Array.isArray(pdfData.Pages) || pdfData.Pages.length === 0) {
    return {
      ok: false,
      error: 'Estructura PDF inválida o vacía',
      validationMessages: ['PDF sin páginas'],
      candidatesNearLabel: [],
    };
  }

  for (let pIdx = 0; pIdx < pdfData.Pages.length; pIdx++) {
    const page = pdfData.Pages[pIdx];
    const linesMap: Map<number, Array<{ x: number; text: string }>> = new Map();

    for (const textItem of page.Texts || []) {
      const y = Math.round(textItem.y * 10) / 10;
      let key = Array.from(linesMap.keys()).find((k) => Math.abs(k - y) < 0.35);
      if (key === undefined) {
        key = y;
        linesMap.set(key, []);
      }
      let rawText = '';
      try {
        rawText = decodeURIComponent(textItem.R[0].T);
      } catch {
        rawText = String(textItem.R[0].T ?? '');
      }
      linesMap.get(key)!.push({ x: Math.round(textItem.x * 10) / 10, text: rawText });
    }

    const sortedYs = Array.from(linesMap.keys()).sort((a, b) => a - b);

    for (let i = 0; i < sortedYs.length; i++) {
      const y = sortedYs[i]!;
      const items = linesMap.get(y)!.sort((a, b) => a.x - b.x);
      const lineText = items.map((it) => it.text).join(' ');

      // Cabecera: Periodo
      if (lineText.includes('PAGA TOTAL DEL')) {
        const m = lineText.match(/PAGA\s+TOTAL\s+DEL\s+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (m) {
          const [, s, e] = m;
          const [sD, sM, sY] = s!.split('/');
          const [eD, eM, eY] = e!.split('/');
          periodStart = `${sY}-${sM}-${sD}`;
          periodEnd = `${eY}-${eM}-${eD}`;
          periodYm = periodStart.slice(0, 7);
        }
      }

      // Cabecera: Empresa / NIF / Fecha Listado
      if (lineText.includes('Empresa')) {
        const empMatch = lineText.match(/Empresa\s+.*?-\s+(.*?)(?=\s+N\.I\.F\.|$)/i);
        if (empMatch) company = empMatch[1]!.trim();
        const nifMatch = lineText.match(/N\.I\.F\.\s+([A-Z0-9]+)/i);
        if (nifMatch) nif = nifMatch[1]!.trim();
        const dateMatch = lineText.match(/Fecha\s+Listado\s+(\d{2}\/\d{2}\/\d{4})/i);
        if (dateMatch) listDate = dateMatch[1]!.trim();
      }

      // Cabecera: Centro
      if (lineText.includes('CENTRO:')) {
        const cMatch = lineText.match(/CENTRO:\s+(.*)/i);
        if (cMatch) center = cMatch[1]!.trim();
      }

      // Fila de trabajador: código numérico de 6 dígitos con posición X < 3.2
      const codeItem = items.find((it) => it.x < 3.2 && /^\d{6}$/.test(it.text.trim()));
      if (codeItem) {
        const employeeCode = codeItem.text.trim();
        const nameTokens = items.filter((it) => it.x >= 3.2 && it.x < 12.5).map((it) => it.text).join(' ').trim();

        const extractCol = (minX: number, maxX: number) => {
          const colTokens = items.filter((it) => it.x >= minX && it.x < maxX).map((it) => it.text.trim());
          return parseEuroNumber(colTokens.join(''));
        };

        const grossSalary = extractCol(12.5, 15.5);
        const irpfBase = extractCol(15.5, 18.0);
        const withholdingIRPF = extractCol(18.0, 20.5);
        const ccBase = extractCol(20.5, 23.0);
        const atBase = extractCol(23.0, 25.5);
        const ssEmployee = extractCol(25.5, 28.0);
        const ssEmployer = extractCol(28.0, 31.0);
        const tc1 = extractCol(31.0, 33.5);
        const companyCost = extractCol(33.5, 36.8);
        const netSalary = extractCol(36.8, 40.0);

        if (grossSalary > 0 || companyCost > 0 || netSalary > 0) {
          const rowIndex = settlements.length;
          const settlementHash = computeSettlementHash({
            periodYm: periodYm || 'unknown',
            employeeCode,
            grossSalary,
            companyCost,
            netSalary,
            rowIndex,
          });

          settlements.push({
            rowIndex,
            employeeCode,
            employeeName: nameTokens,
            grossSalary,
            irpfBase,
            irpf: withholdingIRPF,
            ccBase,
            atBase,
            ssEmployee,
            ssEmployer,
            tc1,
            companyCost,
            netSalary,
            settlementHash,
            classification: 'UNCLASSIFIED',
            status: 'DISCOVERED',
          });
        }
      }

      // Bloque TOTAL EMPRESA / TOTAL CENTRO
      if (lineText.includes('TOTAL EMPRESA') || lineText.includes('TOTAL CENTRO')) {
        const isEmpresa = lineText.includes('TOTAL EMPRESA');
        if (!totals || isEmpresa) {
          const extractCol = (minX: number, maxX: number) => {
            const colTokens = items.filter((it) => it.x >= minX && it.x < maxX).map((it) => it.text.trim());
            return parseEuroNumber(colTokens.join(''));
          };

          const totalGross = extractCol(15.0, 18.0);
          const totalBaseCC = extractCol(20.0, 23.5);
          const totalSSEmployee = extractCol(25.0, 28.5);
          const totalTC1 = extractCol(30.0, 33.5);
          const totalNet = extractCol(35.0, 39.0);

          let totalBaseIRPF = 0;
          let totalWithholdingIRPF = 0;
          let totalBaseAT = 0;
          let totalSSEmployer = 0;
          let totalCompanyCost = 0;

          if (i + 1 < sortedYs.length) {
            const nextY = sortedYs[i + 1]!;
            if (nextY - y < 0.8) {
              const subItems = linesMap.get(nextY)!.sort((a, b) => a.x - b.x);
              const extractSubCol = (minX: number, maxX: number) => {
                const colTokens = subItems.filter((it) => it.x >= minX && it.x < maxX).map((it) => it.text.trim());
                return parseEuroNumber(colTokens.join(''));
              };
              totalBaseIRPF = extractSubCol(12.5, 15.5);
              totalWithholdingIRPF = extractSubCol(17.0, 20.5);
              totalBaseAT = extractSubCol(22.0, 25.5);
              totalSSEmployer = extractSubCol(27.5, 31.0);
              totalCompanyCost = extractSubCol(33.0, 36.5);
            }
          }

          totals = {
            totalGross,
            totalBaseIRPF,
            totalWithholdingIRPF,
            totalBaseCC,
            totalBaseAT,
            totalSSEmployee,
            totalSSEmployer,
            totalTC1,
            totalCompanyCost,
            totalNet,
            totalWorkers,
          };
        }
      }

      if (lineText.includes('TOTAL TRABAJADORES')) {
        const twMatch = lineText.match(/TOTAL\s+TRABAJADORES.*?\s+(\d+)/i);
        if (twMatch) {
          totalWorkers = Number(twMatch[1]);
          if (totals) totals.totalWorkers = totalWorkers;
        }
      }
    }
  }

  if (!periodStart || !periodYm) {
    return {
      ok: false,
      error: 'No se detectó el periodo (PAGA TOTAL DEL .. AL ..)',
      validationMessages: ['Periodo no encontrado'],
      candidatesNearLabel: [],
    };
  }

  if (!totals || !(totals.totalCompanyCost > 0)) {
    return {
      ok: false,
      error: 'No se pudo extraer el bloque de Totales (COST TOTAL)',
      validationMessages: ['COST TOTAL no encontrado en bloque de totales'],
      candidatesNearLabel: [],
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  const sumCompanyCost = settlements.reduce((acc, e) => acc + e.companyCost, 0);
  const sumCompanyCostRounded = Math.round(sumCompanyCost * 100) / 100;
  const isMatch = Math.abs(sumCompanyCostRounded - totals.totalCompanyCost) < 0.02;

  if (!isMatch) {
    validationMessages.push(
      `Inconsistencia: La suma de liquidaciones (${sumCompanyCostRounded} €) no coincide con COST TOTAL (${totals.totalCompanyCost} €).`,
    );
    return {
      ok: false,
      error: `Inconsistencia en PDF: Suma de filas (${sumCompanyCostRounded}) ≠ COST TOTAL (${totals.totalCompanyCost})`,
      validationMessages,
      candidatesNearLabel: [sumCompanyCostRounded, totals.totalCompanyCost],
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  const header: PayrollSnapshotHeaderDTO = {
    company,
    nif,
    periodStart,
    periodEnd,
    periodYm,
    listDate,
    center,
    totalWorkers,
  };

  const snapshot: PayrollMonthSnapshot = {
    version: 1,
    header,
    settlements,
    totals,
    metadata: {
      contentHash: options?.contentHash ?? '',
      parserVersion: PAYROLL_SUMMARY_PARSER_VERSION,
      parsedAt: new Date().toISOString(),
      filename: options?.filename ?? null,
      source: options?.source ?? 'gmail_summary',
    },
  };

  validationMessages.push(`Periodo ${periodStart} → ${periodEnd} (${periodYm}).`);
  validationMessages.push(`Extraídas ${settlements.length} liquidaciones individuales.`);
  validationMessages.push(`COST TOTAL en totales PDF: ${totals.totalCompanyCost} €.`);
  validationMessages.push(`Importe seleccionado: ${totals.totalCompanyCost} vía COST TOTAL (parser v${PAYROLL_SUMMARY_PARSER_VERSION}).`);

  return {
    ok: true,
    snapshot,
    header,
    employees: settlements,
    totals,
    periodStart,
    periodEnd,
    periodYm,
    totalCompanyCost: totals.totalCompanyCost,
    labelUsed: 'COST TOTAL',
    amountBefore: totals.totalCompanyCost,
    amountAfter: totals.totalCompanyCost,
    candidatesNearLabel: [totals.totalCompanyCost],
    validationMessages,
  };
}

/**
 * Función PURA: Conveniencia para parsear directamente desde un Buffer de PDF.
 */
export async function parseCompanySummaryPdfBuffer(
  pdfBuffer: Buffer,
  options?: { contentHash?: string; filename?: string; source?: string },
): Promise<PayrollSummaryParseResult> {
  return new Promise<PayrollSummaryParseResult>((resolve) => {
    // @ts-ignore
    const ParserClass = typeof PDFParser === 'function' ? PDFParser : (PDFParser as any).default || PDFParser;
    const pdfParser = new ParserClass(null, 0);
    pdfParser.on('pdfParser_dataError', (errData: { parserError?: string }) => {
      resolve({
        ok: false,
        error: errData.parserError ?? 'pdf2json error',
        validationMessages: ['Fallo al procesar PDF con pdf2json'],
        candidatesNearLabel: [],
      });
    });
    pdfParser.on('pdfParser_dataReady', (pdfData: any) => {
      try {
        const result = parseCompanySummaryPdfData(pdfData, options);
        resolve(result);
      } catch (err: any) {
        resolve({
          ok: false,
          error: err.message ?? 'Error parseando datos de PDF',
          validationMessages: [err.message],
          candidatesNearLabel: [],
        });
      }
    });
    pdfParser.parseBuffer(pdfBuffer);
  });
}

/**
 * Función PURA: Retrocompatible para parsear JSON de pdf2json.
 */
export function parseCompanySummaryText(textContentOrJson: string): PayrollSummaryParseResult {
  const str = String(textContentOrJson ?? '').trim();
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const pdfData = JSON.parse(str);
      return parseCompanySummaryPdfData(pdfData);
    } catch {
      /* ignore */
    }
  }

  return {
    ok: false,
    error: 'El parser v2 requiere estructura de coordenadas de PDF (pdf2json / parseCompanySummaryPdfBuffer)',
    validationMessages: ['Texto plano no compatible con parser v2 de coordenadas'],
    candidatesNearLabel: [],
  };
}
