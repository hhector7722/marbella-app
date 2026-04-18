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

export async function revertTicketInventory(numeroDocumento: string) {
  const supabase = await createClient()
  
  const { error } = await supabase.rpc('revert_ticket_stock_deduction', {
    p_numero_documento: numeroDocumento
  })

  if (error) {
    console.error(`[INVENTORY REFUND ERROR] Ticket ${numeroDocumento}:`, error.message)
    throw new Error('Fallo al reintegrar el stock del ticket anulado.')
  }

  return { success: true }
}
