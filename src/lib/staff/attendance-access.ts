import { isMasterDashboardUser } from '@/lib/master-dashboard';

const MANAGER_ATTENDANCE_ROLES = new Set(['manager', 'admin', 'supervisor']);

/** Puede crear, editar o borrar fichajes de la plantilla (manager/admin/supervisor o Master por email). */
export function canManageStaffAttendance(
    role: string | null | undefined,
    email?: string | null,
): boolean {
    if (isMasterDashboardUser(email)) return true;
    return MANAGER_ATTENDANCE_ROLES.has(String(role ?? ''));
}
