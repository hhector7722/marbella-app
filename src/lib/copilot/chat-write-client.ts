import 'server-only';
import { createClient as createServiceClient } from '@supabase/supabase-js';

/**
 * Las escrituras del historial nunca se autorizan directamente desde el
 * navegador. Usar solo tras comprobar auth.getUser y los permisos del perfil.
 */
export function createCopilotWriteClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
