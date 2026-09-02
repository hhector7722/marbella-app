import { isMasterDashboardUser } from '@/lib/master-dashboard';

/** Puede crear, editar o borrar fichajes de la plantilla (manager o Master por email). */
export function canManageStaffAttendance(
    role: string | null | undefined,
    email?: string | null,
): boolean {
    return role === 'manager' || isMasterDashboardUser(email);
}
