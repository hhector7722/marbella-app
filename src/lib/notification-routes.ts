/** Query params y builders para deep links desde notificaciones in-app / push. */

export const NOTIFICATION_QUERY = {
  closingId: 'closingId',
  scheduleDate: 'scheduleDate',
  entityId: 'id',
} as const

export function staffDashboardScheduleUrl(scheduleDateIso: string): string {
  return `/staff/dashboard?${NOTIFICATION_QUERY.scheduleDate}=${encodeURIComponent(scheduleDateIso)}`
}

export function cashClosingHistoryUrl(closingId: string): string {
  return `/dashboard/history?${NOTIFICATION_QUERY.closingId}=${encodeURIComponent(closingId)}`
}

export function staffReservasUrl(reservationId: string): string {
  return `/staff/reservas?${NOTIFICATION_QUERY.entityId}=${encodeURIComponent(reservationId)}`
}

export function purchaseInvoiceAlbaranesUrl(invoiceId: string): string {
  return `/dashboard/albaranes?${NOTIFICATION_QUERY.entityId}=${encodeURIComponent(invoiceId)}`
}
