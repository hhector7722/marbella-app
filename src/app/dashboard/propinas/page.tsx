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

  // Manager-only: esta pantalla escribe (botes/overrides)
  if (!profile || profile.role !== 'manager') {
    redirect('/staff/dashboard');
  }

  return <TipsDashboardView />;
}

