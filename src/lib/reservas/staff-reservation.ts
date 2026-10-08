import { z } from 'zod'

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12) return false

  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return day >= 1 && day <= daysInMonth[month - 1]
}

export const staffReservationSchema = z.object({
  reservation_date: z.string().refine(isCalendarDate, 'Fecha no válida'),
  reservation_time: z.string().regex(/^([01]\d|2[0-3]):(?:00|30)$/, 'Elige una hora en punto o y media'),
  pax: z.coerce.number().int().min(1, 'Indica al menos una persona'),
  customer_name: z.string().trim().min(2, 'Indica el nombre').max(120),
  customer_phone: z.string().trim().max(40).refine(
    (phone) => phone.length === 0 || phone.length >= 6,
    'Teléfono no válido',
  ),
  notes: z.string().trim().max(500),
})
