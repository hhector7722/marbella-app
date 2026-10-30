'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';

export type StaffClockMessage = {
  id: string;
  body: string;
  created_at: string;
};

export type StaffClockMessageCheck =
  | { success: true; pending: StaffClockMessage | null }
  | { success: false; error: string };

export type StaffClockMessageSendResult =
  | { success: true }
  | { success: false; error: string; pending?: StaffClockMessage };

async function findUnacknowledgedMessage(
  db: SupabaseClient,
  recipientId: string,
): Promise<StaffClockMessageCheck> {
  const { data, error } = await db.from('staff_clock_messages')
    .select('id, body, created_at')
    .eq('recipient_id', recipientId)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error al consultar mensajes pendientes:', error.message);
    return { success: false, error: 'No se pudo comprobar si hay mensajes pendientes. Inténtalo de nuevo.' };
  }
  return { success: true, pending: (data ?? null) as StaffClockMessage | null };
}

/** Solo la cuenta propietaria puede consultar mensajes pendientes de otro usuario.
 * Se consulta incluso si el destinatario todavía no ha fichado. */
export async function checkPendingStaffClockMessage(
  recipientId: string,
): Promise<StaffClockMessageCheck> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !isMasterDashboardUser(user.email)) {
    return { success: false, error: 'No tienes permiso para consultar los mensajes de fichaje.' };
  }
  const recipient = recipientId.trim();
  if (!/^[0-9a-f-]{36}$/i.test(recipient)) {
    return { success: false, error: 'Destinatario inválido.' };
  }
  return findUnacknowledgedMessage(supabase as unknown as SupabaseClient, recipient);
}

export async function sendStaffClockMessage(
  recipientId: string,
  content: string,
): Promise<StaffClockMessageSendResult> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user || !isMasterDashboardUser(user.email)) {
    return { success: false, error: 'Solo Héctor puede enviar mensajes de fichaje.' };
  }
  const recipient = recipientId.trim();
  const body = content.trim();
  if (!/^[0-9a-f-]{36}$/i.test(recipient)) {
    return { success: false, error: 'Destinatario inválido.' };
  }
  if (!body || body.length > 2000) {
    return { success: false, error: 'Escribe un mensaje de entre 1 y 2000 caracteres.' };
  }
  const { data: profile, error: profileError } = await supabase
    .from('profiles').select('id').eq('id', recipient).maybeSingle();
  if (profileError || !profile) {
    return { success: false, error: 'No se ha encontrado el usuario.' };
  }
  const db = supabase as unknown as SupabaseClient;
  const check = await findUnacknowledgedMessage(db, recipient);
  if (!check.success) return check;
  if (check.pending) {
    return {
      success: false,
      error: 'Este usuario ya tiene un mensaje pendiente de lectura.',
      pending: check.pending,
    };
  }

  const { error } = await db.from('staff_clock_messages').insert({
    sender_id: user.id,
    recipient_id: recipient,
    body,
  });
  if (!error) return { success: true };

  // Índice único: dos sesiones no pueden guardar a la vez para el mismo usuario.
  // Mostrar al remitente el texto exacto del mensaje que sigue pendiente.
  if (error.code === '23505') {
    const existing = await findUnacknowledgedMessage(db, recipient);
    return {
      success: false,
      error: 'Este usuario ya tiene un mensaje pendiente de lectura.',
      pending: existing.success ? existing.pending ?? undefined : undefined,
    };
  }
  console.error('Error al guardar mensaje de fichaje:', error.message);
  return { success: false, error: 'No se ha podido guardar el mensaje.' };
}

export async function getPendingStaffClockMessages(): Promise<StaffClockMessage[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from('staff_clock_messages')
    .select('id, body, created_at')
    .eq('recipient_id', user.id)
    .is('acknowledged_at', null)
    .order('created_at', { ascending: true })
    .limit(20);
  if (error) {
    console.error('Error al recuperar los mensajes de fichaje:', error.message);
    return [];
  }
  return (data ?? []) as StaffClockMessage[];
}

export async function acknowledgeStaffClockMessage(
  messageId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Sesión no disponible.' };
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) {
    return { success: false, error: 'Mensaje inválido.' };
  }
  const db = supabase as unknown as SupabaseClient;
  const { data, error } = await db.from('staff_clock_messages')
    .update({ acknowledged_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('recipient_id', user.id)
    .is('acknowledged_at', null)
    .select('id')
    .maybeSingle();
  if (error || !data) {
    return { success: false, error: 'No se ha podido confirmar la lectura.' };
  }
  return { success: true };
}
