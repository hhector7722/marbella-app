import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import type { TimeFilterValue } from '@/components/time/time-filter-types';
import { timeFilterLabel } from '@/components/time/time-filter-types';

export function staffSelectionApplySummary(employee: {
  id: string;
  first_name: string;
  last_name?: string | null;
}): string {
  if (!employee.id) return 'Plantilla (todos)';
  const first = (employee.first_name || '').trim();
  // Cabecera / filtro asistencia: solo nombre de pila (sin apellidos).
  return first || 'Sin nombre';
}

export function timeFilterApplySummary(value: TimeFilterValue): string {
  return timeFilterLabel(value);
}

export function formatYmdShort(ymd: string): string {
  const parts = ymd.split('T')[0].split('-').map(Number);
  const y = parts[0];
  const m = parts[1];
  const d = parts[2];
  if (!y || !m || !d) return ymd;
  return format(new Date(y, m - 1, d), 'd MMM yyyy', { locale: es });
}

export function closingDetailUsageSummary(closing: {
  closing_date?: string | null;
  closed_at?: string | null;
}): string {
  const ymd = closing.closing_date?.split('T')[0] ?? closing.closed_at?.split('T')[0];
  return ymd ? formatYmdShort(ymd) : 'Cierre';
}

export function closingDetailUsageLabel(closing: {
  closing_date?: string | null;
  closed_at?: string | null;
}): string {
  return `${closingDetailUsageSummary(closing)} · Detalle de cierre`;
}

export function movementDetailUsageSummary(movement: {
  type: string;
  amount: number;
  notes?: string | null;
  original_type?: string | null;
}): string {
  const originalType = movement.original_type ?? movement.type;
  const typeLabel =
    originalType === 'SWAP' || movement.type === 'SWAP'
      ? 'Intercambio'
      : originalType === 'ADJUSTMENT' || movement.type === 'adjustment'
        ? 'Arqueo'
        : movement.type === 'income' || originalType === 'IN' || originalType === 'CLOSE_ENTRY'
          ? 'Entrada'
          : 'Salida';
  const amount = Math.abs(Number(movement.amount ?? 0));
  const amountStr = amount > 0.005 ? `${amount.toFixed(2)}€` : '';
  const concept = movement.notes?.trim();
  const parts = [typeLabel, amountStr, concept ? namedEntitySummary(concept, '') : ''].filter(Boolean);
  return parts.join(' · ') || 'Movimiento';
}

export function movementDetailUsageLabel(movement: {
  type: string;
  amount: number;
  notes?: string | null;
  original_type?: string | null;
}): string {
  return `${movementDetailUsageSummary(movement)} · Detalle movimiento`;
}

export function overtimeWeekDetailUsageLabel(weekId: string, weekNumber?: number): string {
  const weekLabel = weekNumber != null ? `Semana ${weekNumber}` : 'Semana';
  const ymd = weekId.split('T')[0];
  return ymd ? `${weekLabel} (${formatYmdShort(ymd)}) · Detalle horas extras` : `${weekLabel} · Detalle horas extras`;
}

export function overtimeWorkerHistoryUsageLabel(workerName: string, weekId: string, weekNumber?: number): string {
  const worker = namedEntitySummary(workerName);
  const weekLabel = weekNumber != null ? `Semana ${weekNumber}` : 'Semana';
  const ymd = weekId.split('T')[0];
  const weekPart = ymd ? `${weekLabel} (${formatYmdShort(ymd)})` : weekLabel;
  return `${worker} · ${weekPart} · Historial horas extras`;
}

export function employeeFilterUsageLabel(employeeSummary: string): string {
  return `${employeeSummary} · Filtro asistencia`;
}

export function formatMonthYear(year: number, monthIndex0: number): string {
  return format(new Date(year, monthIndex0, 1), 'MMMM yyyy', { locale: es });
}

export function formatMonthYearParts(year: number, month1to12: number): string {
  return format(new Date(year, month1to12 - 1, 1), 'MMMM yyyy', { locale: es });
}

export function periodRangeSummary(from: string, to: string): string {
  return `Periodo ${from}–${to}`;
}

export function albaranesFilterSummary(params: {
  from: string;
  to: string;
  supplierId: string;
  supplierName?: string | null;
}): string {
  const parts: string[] = [];
  if (params.from || params.to) {
    parts.push(
      params.from && params.to
        ? periodRangeSummary(params.from, params.to)
        : params.from
          ? `Desde ${params.from}`
          : `Hasta ${params.to}`
    );
  }
  if (params.supplierId) {
    parts.push(`Proveedor: ${namedEntitySummary(params.supplierName ?? params.supplierId)}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Sin filtros';
}

export function namedEntitySummary(name: string, fallback = 'Sin nombre'): string {
  const trimmed = name.trim();
  return trimmed || fallback;
}

export function reservationApplySummary(reservation: {
  customer_name: string;
  pax: number;
  reservation_time: string;
}): string {
  const name = namedEntitySummary(reservation.customer_name, 'Sin nombre');
  return `${name} · ${reservation.pax} pax · ${reservation.reservation_time}`;
}

export function consumptionCartSummary(
  items: Array<{ recipe: { name: string }; quantity: number; is_half: boolean }>
): string {
  if (items.length === 0) return 'Carrito vacío';
  return items
    .map((item) => {
      const half = item.is_half ? ' ½' : '';
      return `${item.recipe.name}${half} ×${item.quantity}`;
    })
    .join(', ');
}
