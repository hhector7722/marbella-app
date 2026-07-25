/**
 * Parser v1 — resumen de costes de empresa (PDF gestoría).
 *
 * Estrategia (NO usa Math.max ni ventana 300 chars):
 * 1. Localizar etiqueta TOTAL EMPRESA o TOTAL CENTRO.
 * 2. Extraer el importe europeo inmediatamente DESPUÉS de la etiqueta.
 * 3. Extraer el importe europeo inmediatamente ANTES de la etiqueta.
 * 4. Si ambos existen y coinciden → ese es el total (layout típico gestoría).
 * 5. Si solo uno existe → usarlo.
 * 6. Si ambos existen y difieren → ambigüedad → rechazo.
 * 7. Preferir TOTAL EMPRESA si ambas etiquetas están presentes y dan el mismo importe;
 *    si dan importes distintos → ambigüedad.
 */

export const PAYROLL_SUMMARY_PARSER_VERSION = 1;

const EURO_AMOUNT_RE = /\d{1,3}(?:\.\d{3})*,\d{2}/g;
const LABEL_EMPRESA_RE = /TOTAL\s+EMPRESA/gi;
const LABEL_CENTRO_RE = /TOTAL\s+CENTRO/gi;
const PERIOD_RE =
  /PAGA\s+TOTAL\s+DEL\s+(\d{2}\/\d{2}\/\d{4})\s+AL\s+(\d{2}\/\d{2}\/\d{4})/i;

/** Radio de caracteres alrededor de la etiqueta para buscar el importe asociado. */
const LABEL_AMOUNT_RADIUS = 80;

export type PayrollSummaryParseOk = {
  ok: true;
  periodStart: string;
  periodEnd: string;
  periodYm: string;
  totalCompanyCost: number;
  labelUsed: 'TOTAL EMPRESA' | 'TOTAL CENTRO';
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

export type PayrollSummaryParseResult =
  | PayrollSummaryParseOk
  | PayrollSummaryParseFail;

export function parseEuroNumber(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return n;
}

export function ymdFromDmy(dmy: string): string | null {
  const m = String(dmy ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return `${yyyy}-${mm}-${dd}`;
}

function periodYmFromStartDate(startYmd: string): string {
  return startYmd.slice(0, 7);
}

function findLabelIndexes(text: string, re: RegExp): number[] {
  const flags = re.flags.includes('g') ? re.flags : `${re.flags}g`;
  const r = new RegExp(re.source, flags);
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = r.exec(text)) !== null) {
    out.push(m.index);
  }
  return out;
}

/**
 * Importe europeo más cercano a `labelIndex` en el lado indicado,
 * dentro de LABEL_AMOUNT_RADIUS caracteres (ignorando el propio rótulo).
 */
function nearestAmount(
  text: string,
  labelIndex: number,
  labelLength: number,
  side: 'before' | 'after',
): { amount: number; raw: string } | null {
  const slice =
    side === 'before'
      ? text.slice(Math.max(0, labelIndex - LABEL_AMOUNT_RADIUS), labelIndex)
      : text.slice(
          labelIndex + labelLength,
          labelIndex + labelLength + LABEL_AMOUNT_RADIUS,
        );

  const matches = [...slice.matchAll(EURO_AMOUNT_RE)];
  if (matches.length === 0) return null;

  if (side === 'before') {
    const last = matches[matches.length - 1]!;
    const amount = parseEuroNumber(last[0]!);
    if (amount === null || amount <= 0) return null;
    return { amount, raw: last[0]! };
  }

  const first = matches[0]!;
  const amount = parseEuroNumber(first[0]!);
  if (amount === null || amount <= 0) return null;
  return { amount, raw: first[0]! };
}

function resolveAmountAtLabel(
  text: string,
  labelIndex: number,
  labelLength: number,
): {
  amount: number | null;
  before: number | null;
  after: number | null;
  candidates: number[];
  messages: string[];
  ambiguous: boolean;
} {
  const beforeHit = nearestAmount(text, labelIndex, labelLength, 'before');
  const afterHit = nearestAmount(text, labelIndex, labelLength, 'after');
  const before = beforeHit?.amount ?? null;
  const after = afterHit?.amount ?? null;
  const candidates = [before, after].filter((n): n is number => n !== null);
  const messages: string[] = [];

  if (before !== null && after !== null) {
    if (before === after) {
      messages.push(
        `Importe antes y después de la etiqueta coinciden (${before}).`,
      );
      return {
        amount: before,
        before,
        after,
        candidates,
        messages,
        ambiguous: false,
      };
    }
    messages.push(
      `Ambigüedad: importe antes (${before}) ≠ después (${after}) de la etiqueta.`,
    );
    return {
      amount: null,
      before,
      after,
      candidates,
      messages,
      ambiguous: true,
    };
  }

  if (after !== null) {
    messages.push(`Importe tomado después de la etiqueta (${after}).`);
    return {
      amount: after,
      before,
      after,
      candidates,
      messages,
      ambiguous: false,
    };
  }

  if (before !== null) {
    messages.push(`Importe tomado antes de la etiqueta (${before}).`);
    return {
      amount: before,
      before,
      after,
      candidates,
      messages,
      ambiguous: false,
    };
  }

  messages.push('No se encontró importe europeo junto a la etiqueta.');
  return {
    amount: null,
    before,
    after,
    candidates,
    messages,
    ambiguous: false,
  };
}

/**
 * Parsea el texto extraído del PDF resumen (pdf2json / equivalente).
 */
export function parseCompanySummaryText(
  textContent: string,
): PayrollSummaryParseResult {
  const validationMessages: string[] = [];
  const text = String(textContent ?? '');

  if (!text.trim()) {
    return {
      ok: false,
      error: 'Texto del PDF vacío',
      validationMessages: ['Texto vacío'],
      candidatesNearLabel: [],
    };
  }

  const periodMatch = text.match(PERIOD_RE);
  if (!periodMatch) {
    return {
      ok: false,
      error: 'No se detectó el periodo (PAGA TOTAL DEL .. AL ..)',
      validationMessages: ['Periodo no encontrado'],
      candidatesNearLabel: [],
    };
  }

  const periodStart = ymdFromDmy(periodMatch[1]!);
  const periodEnd = ymdFromDmy(periodMatch[2]!);
  if (!periodStart || !periodEnd) {
    return {
      ok: false,
      error: 'Periodo inválido en documento',
      validationMessages: ['Periodo inválido'],
      candidatesNearLabel: [],
    };
  }
  if (periodStart > periodEnd) {
    return {
      ok: false,
      error: 'Periodo incoherente (inicio > fin)',
      validationMessages: ['period_start > period_end'],
      candidatesNearLabel: [],
      periodStart,
      periodEnd,
      periodYm: periodYmFromStartDate(periodStart),
    };
  }

  const periodYm = periodYmFromStartDate(periodStart);
  validationMessages.push(`Periodo ${periodStart} → ${periodEnd} (${periodYm}).`);

  const empresaIdxs = findLabelIndexes(text, LABEL_EMPRESA_RE);
  const centroIdxs = findLabelIndexes(text, LABEL_CENTRO_RE);

  if (empresaIdxs.length === 0 && centroIdxs.length === 0) {
    return {
      ok: false,
      error: 'No se encontró TOTAL CENTRO ni TOTAL EMPRESA en el documento',
      validationMessages: [...validationMessages, 'Sin etiqueta TOTAL'],
      candidatesNearLabel: [],
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  type LabelHit = {
    label: 'TOTAL EMPRESA' | 'TOTAL CENTRO';
    index: number;
    length: number;
  };

  const hits: LabelHit[] = [
    ...empresaIdxs.map((index) => ({
      label: 'TOTAL EMPRESA' as const,
      index,
      length: text.slice(index).match(/^TOTAL\s+EMPRESA/i)?.[0]?.length ?? 13,
    })),
    ...centroIdxs.map((index) => ({
      label: 'TOTAL CENTRO' as const,
      index,
      length: text.slice(index).match(/^TOTAL\s+CENTRO/i)?.[0]?.length ?? 12,
    })),
  ];

  // Usar la primera aparición de cada tipo de etiqueta (orden documento).
  const byLabel = new Map<string, LabelHit>();
  for (const h of hits) {
    if (!byLabel.has(h.label)) byLabel.set(h.label, h);
  }

  const resolved: Array<{
    label: 'TOTAL EMPRESA' | 'TOTAL CENTRO';
    amount: number;
    before: number | null;
    after: number | null;
    candidates: number[];
    messages: string[];
  }> = [];

  for (const h of byLabel.values()) {
    const r = resolveAmountAtLabel(text, h.index, h.length);
    validationMessages.push(...r.messages.map((m) => `[${h.label}] ${m}`));
    if (r.ambiguous) {
      return {
        ok: false,
        error: `Ambigüedad de importe en ${h.label}`,
        validationMessages,
        candidatesNearLabel: r.candidates,
        periodStart,
        periodEnd,
        periodYm,
      };
    }
    if (r.amount === null) continue;
    resolved.push({
      label: h.label,
      amount: r.amount,
      before: r.before,
      after: r.after,
      candidates: r.candidates,
      messages: r.messages,
    });
  }

  if (resolved.length === 0) {
    return {
      ok: false,
      error: 'No se detectó ningún importe válido junto a TOTAL EMPRESA/CENTRO',
      validationMessages,
      candidatesNearLabel: [],
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  const empresa = resolved.find((r) => r.label === 'TOTAL EMPRESA');
  const centro = resolved.find((r) => r.label === 'TOTAL CENTRO');

  if (empresa && centro && empresa.amount !== centro.amount) {
    return {
      ok: false,
      error: `TOTAL EMPRESA (${empresa.amount}) ≠ TOTAL CENTRO (${centro.amount})`,
      validationMessages: [
        ...validationMessages,
        'Etiquetas TOTAL con importes distintos',
      ],
      candidatesNearLabel: [empresa.amount, centro.amount],
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  // Preferir EMPRESA si existe; si no, CENTRO.
  const chosen = empresa ?? centro!;
  if (!(chosen.amount > 0)) {
    return {
      ok: false,
      error: 'El importe total debe ser positivo',
      validationMessages: [...validationMessages, 'Importe no positivo'],
      candidatesNearLabel: chosen.candidates,
      periodStart,
      periodEnd,
      periodYm,
    };
  }

  validationMessages.push(
    `Importe seleccionado: ${chosen.amount} vía ${chosen.label} (parser v${PAYROLL_SUMMARY_PARSER_VERSION}).`,
  );

  return {
    ok: true,
    periodStart,
    periodEnd,
    periodYm,
    totalCompanyCost: chosen.amount,
    labelUsed: chosen.label,
    amountBefore: chosen.before,
    amountAfter: chosen.after,
    candidatesNearLabel: chosen.candidates,
    validationMessages,
  };
}
