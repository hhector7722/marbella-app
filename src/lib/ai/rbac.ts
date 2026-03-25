import { createClient } from '@/utils/supabase/server';

export type UserRole = 'manager' | 'staff' | 'supervisor';

export interface ActionPermission {
  action: string;
  allowedRoles: UserRole[];
}

const PERMISSIONS: Record<string, UserRole[]> = {
  'view_financials': ['manager'],
  'view_own_labor': ['manager', 'staff', 'supervisor'],
  'view_team_labor': ['manager', 'supervisor'],
  'manage_orders': ['manager', 'staff', 'supervisor'],
  'view_recipes': ['manager', 'staff', 'supervisor'],
};

export async function verifyUserAction(action: string, providedUserId?: string) {
  const supabase = await createClient();
  let currentUserId: string;
  let userRole: UserRole;

  if (providedUserId) {
    // Escenario Webhook (Vapi): Confiamos en el userId pasado si la petición viene del servidor (backend)
    // En producción, aquí deberíamos validar un WEBHOOK_SECRET
    currentUserId = providedUserId;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUserId)
      .single();
    userRole = (profile?.role as UserRole) || 'staff';
  } else {
    // Escenario Chat (Next.js): Usamos la sesión de la cookie
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      throw new Error('No autorizado. Sesión inválida.');
    }
    currentUserId = user.id;
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', currentUserId)
      .single();
    userRole = (profile?.role as UserRole) || 'staff';
  }

  const allowedRoles = PERMISSIONS[action];
  
  if (!allowedRoles) {
    throw new Error(`Acción desconocida: ${action}`);
  }

  if (!allowedRoles.includes(userRole)) {
    throw new Error(`Permisos insuficientes para realizar la acción: ${action}`);
  }

  return {
    userId: currentUserId,
    role: userRole,
    isOwner: providedUserId === currentUserId
  };
}
