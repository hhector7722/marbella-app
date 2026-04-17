'use server'

import { createClient } from '@/utils/supabase/server'

export async function syncTicketInventory(numeroDocumento: string) {
  const supabase = await createClient()
  
  const { error } = await supabase.rpc('process_ticket_stock_deduction', {
    p_numero_documento: numeroDocumento
  })

  if (error) {
    console.error(`[INVENTORY SYNC ERROR] Ticket ${numeroDocumento}:`, error.message)
    throw new Error('Fallo al deducir stock del ticket.')
  }

  return { success: true }
}
