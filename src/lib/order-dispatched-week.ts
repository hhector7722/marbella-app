export interface DispatchedWeekRow {
  dispatched: boolean;
  firstName: string | null;
  dispatchedAt: string | null;
}

export const EMPTY_DISPATCHED_WEEK_ROW: DispatchedWeekRow = {
  dispatched: false,
  firstName: null,
  dispatchedAt: null,
};

export function readDispatchedWeekRow(data: unknown): DispatchedWeekRow {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return EMPTY_DISPATCHED_WEEK_ROW;

  const rec = row as {
    dispatched?: unknown;
    first_name?: unknown;
    dispatched_at?: unknown;
  };
  const firstName = typeof rec.first_name === 'string' ? rec.first_name.trim() : '';
  const dispatchedAt = typeof rec.dispatched_at === 'string'
    && !Number.isNaN(Date.parse(rec.dispatched_at))
    ? rec.dispatched_at
    : null;

  return {
    dispatched: rec.dispatched === true,
    firstName: firstName || null,
    dispatchedAt,
  };
}

const madridDate = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const madridWeekday = new Intl.DateTimeFormat('es-ES', {
  timeZone: 'Europe/Madrid',
  weekday: 'long',
});

export function formatDispatchedWeekNotice(
  row: DispatchedWeekRow,
  now: Date = new Date(),
): string {
  const dispatchedDate = row.dispatchedAt ? new Date(row.dispatchedAt) : null;
  let message = 'Se ha tramitado un pedido';

  if (dispatchedDate) {
    message = madridDate.format(dispatchedDate) === madridDate.format(now)
      ? 'Hoy se ha tramitado un pedido'
      : `El ${madridWeekday.format(dispatchedDate)} se tramitó un pedido`;
  }

  return `${message}${row.firstName ? ` (${row.firstName})` : ''}.`;
}
