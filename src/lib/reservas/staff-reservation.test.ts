import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { staffReservationSchema } from './staff-reservation.ts'

const reservation = {
  reservation_date: '2026-10-09',
  reservation_time: '14:00',
  pax: 2,
  customer_name: 'Cliente',
  customer_phone: '',
  notes: '',
}

describe('alta interna de reserva', () => {
  it('acepta cualquier día válido y solo horas en punto o y media', () => {
    assert.equal(staffReservationSchema.safeParse(reservation).success, true)
    assert.equal(staffReservationSchema.safeParse({ ...reservation, reservation_time: '23:30' }).success, true)
    assert.equal(staffReservationSchema.safeParse({ ...reservation, reservation_time: '14:15' }).success, false)
    assert.equal(staffReservationSchema.safeParse({ ...reservation, reservation_time: '14:45' }).success, false)
  })
})
