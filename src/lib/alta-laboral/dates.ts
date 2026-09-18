import { parseCivilYmd } from '../hours-engine/labor-conditions.ts';
import type { EmploymentIntakeRow } from './types.ts';

const MONTHS_ES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export function formatCivilDateEs(ymd: string | null | undefined): string {
  const parsed = parseCivilYmd(String(ymd ?? '').trim());
  if (!parsed) return '';
  const [y, m, d] = parsed.split('-').map(Number);
  return `${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

export function fullName(row: Pick<EmploymentIntakeRow, 'first_name' | 'last_name'>): string {
  return `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
}

export function displayStatus(
  row: Pick<EmploymentIntakeRow, 'status' | 'expires_at'>,
  now = new Date(),
): EmploymentIntakeRow['status'] {
  if (
    row.status === 'pending_candidate' &&
    Date.parse(row.expires_at) < now.getTime()
  ) {
    return 'expired';
  }
  return row.status;
}
