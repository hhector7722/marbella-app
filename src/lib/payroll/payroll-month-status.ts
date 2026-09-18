import { format } from 'date-fns';
import { es } from 'date-fns/locale';

export type PayrollAbsenceNotice = {
  variant: 'info' | 'negative';
  title: string;
  body: string;
};

/**
 * Mes en curso o futuro sin resumen: esperado.
 * Mes ya cerrado sin resumen: defecto.
 */
export function partitionMissingPayrollMonths(
  missingMonths: string[],
  todayYmd: string,
): { expectedPending: string[]; unexpectedMissing: string[] } {
  const currentYm = todayYmd.slice(0, 7);
  const expectedPending: string[] = [];
  const unexpectedMissing: string[] = [];
  const seen = new Set<string>();

  for (const raw of missingMonths) {
    const ym = raw.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || seen.has(ym)) continue;
    seen.add(ym);
    if (ym >= currentYm) expectedPending.push(ym);
    else unexpectedMissing.push(ym);
  }

  expectedPending.sort();
  unexpectedMissing.sort();
  return { expectedPending, unexpectedMissing };
}

function monthNameEs(ym: string): string {
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return format(new Date(year, month - 1, 1), 'MMMM', { locale: es });
}

function joinMonthNames(months: string[]): string {
  const names = months.map(monthNameEs);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export function payrollAbsenceNotice(
  missingMonths: string[],
  todayYmd: string,
): PayrollAbsenceNotice | null {
  const { expectedPending, unexpectedMissing } = partitionMissingPayrollMonths(
    missingMonths,
    todayYmd,
  );
  if (unexpectedMissing.length === 0 && expectedPending.length === 0) {
    return null;
  }

  if (unexpectedMissing.length > 0) {
    const closed = joinMonthNames(unexpectedMissing);
    let body = `El fijo de ${unexpectedMissing.length === 1 ? 'ese mes' : 'esos meses'} es desconocido.`;
    if (expectedPending.length > 0) {
      const pending = joinMonthNames(expectedPending);
      const verb = expectedPending.length === 1 ? 'ha' : 'han';
      body += ` ${pending} todavía no ${verb} llegado; hasta entonces solo se cuentan las extras.`;
    }
    return {
      variant: 'negative',
      title: `Falta el resumen de ${closed}`,
      body,
    };
  }

  const pending = joinMonthNames(expectedPending);
  const isCurrentOnly =
    expectedPending.length === 1 && expectedPending[0] === todayYmd.slice(0, 7);

  return {
    variant: 'info',
    title: isCurrentOnly ? 'Nómina pendiente' : `Nómina de ${pending} pendiente`,
    body: 'El resumen de gestoría llega a final de mes. Hasta entonces el fijo es desconocido y solo se cuentan las extras.',
  };
}
