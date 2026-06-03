/** Destinatarios fijos de notificaciones in-app / push (emails en profiles). */

export const NOTIFICATION_HECTOR_EMAIL = 'hhector7722@gmail.com' as const

export const NOTIFICATION_RESERVATION_EMAILS = [
  NOTIFICATION_HECTOR_EMAIL,
  'pereboladeres@gmail.com',
  'hernang6799@gmail.com',
] as const

export function normalizeNotificationEmail(email: string | null | undefined): string {
  return (email ?? '').trim().toLowerCase()
}
