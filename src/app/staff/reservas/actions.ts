'use server'

import { revalidatePath } from 'next/cache'
import { staffReservationSchema } from '@/lib/reservas/staff-reservation'
import { createClient } from '@/utils/supabase/server'

export async function createStaffReservationAction(input: unknown): Promise<
  { success: true } | { success: false; message: string }
> {
  const parsed = staffReservationSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, message: parsed.error.issues[0]?.message ?? 'Datos no válidos' }
  }

  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return { success: false, message: 'No autenticado' }

  const data = parsed.data
  const { error } = await supabase.from('reservations').insert({
    reservation_date: data.reservation_date,
    reservation_time: `${data.reservation_time}:00`,
    pax: data.pax,
    customer_name: data.customer_name,
    customer_phone: data.customer_phone || '-',
    notes: data.notes || null,
    status: 'pending',
  })

  if (error) return { success: false, message: error.message }

  revalidatePath('/staff/reservas')
  return { success: true }
}
