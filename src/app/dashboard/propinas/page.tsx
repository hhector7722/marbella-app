import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import TipsDashboardView from '@/components/tips/TipsDashboardView';

export default async function PropinasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile, error } = await supabase.from('profiles').select('role').eq('id', user.id).single();

  if (error) {
    // Si la BD falla aquí, preferimos bloquear para no exponer una UI sin permisos claros
    redirect('/login');
  }

  const role = profile?.role ?? null;
  const isManagerOrAdmin = role === 'manager' || role === 'admin';

  // tip_pool_editors: permiso específico para editar botes (cantidades/desgloses)
  const { data: poolEditorRow, error: poolEditorError } = await supabase
    .from('tip_pool_editors')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  if (poolEditorError) {
    redirect('/login');
  }

  const canEditPools = isManagerOrAdmin || !!poolEditorRow;
  if (!canEditPools) redirect('/staff/dashboard');

  // Restricción pedida: no editar overrides/empleados/horas salvo manager/admin
  const canEditOverrides = isManagerOrAdmin;

  return <TipsDashboardView canEditPools={canEditPools} canEditOverrides={canEditOverrides} />;
}

