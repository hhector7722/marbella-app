import type { SupabaseClient } from '@supabase/supabase-js'

import {
  PEDIDO_CONTACT_EMAIL,
  resolvePedidoContactWhatsAppPhone,
} from '@/lib/client-pedido-link'

/** Teléfono WhatsApp del contacto del pedido (perfil `PEDIDO_CONTACT_EMAIL`). */
export async function loadPedidoContactWhatsAppPhone(
  supabase: SupabaseClient
): Promise<string | null> {
  const { data, error } = await supabase.rpc('get_pedido_contact_whatsapp_phone')
  if (error) {
    console.error('[pedido-contact-phone]', PEDIDO_CONTACT_EMAIL, error.message)
  }
  return resolvePedidoContactWhatsAppPhone(
    typeof data === 'string' ? data : data != null ? String(data) : null
  )
}
