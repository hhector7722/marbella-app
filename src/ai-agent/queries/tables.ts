import { createClient } from '@/utils/supabase/server';
import { verifyUserAction } from '@/lib/ai/rbac';

export async function fetchOpenTables(): Promise<{
  updatedAt?: string | null;
  openTables: Array<{
    mesa: unknown;
    fecha_apertura?: string;
    total_provisional?: unknown;
    productos?: unknown;
  }>;
}> {
  await verifyUserAction('view_tables');
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('estado_sala')
    .select('radiografia_completa, ultima_actualizacion')
    .eq('id', 1)
    .single();

  if (error) throw new Error(`Error consultando estado_sala: ${error.message}`);
  const radiografia = (data as any)?.radiografia_completa ?? [];

  return {
    updatedAt: (data as any)?.ultima_actualizacion ?? null,
    openTables: Array.isArray(radiografia) ? radiografia : [],
  };
}

