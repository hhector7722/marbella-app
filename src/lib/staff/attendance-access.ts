import { isMasterDashboardUser } from '@/lib/master-dashboard';
import type { MasterViewAsIdentity } from '@/lib/master-view-as';

const MANAGER_ATTENDANCE_ROLES = new Set(['manager', 'admin', 'supervisor']);

/** Puede crear, editar o borrar fichajes de la plantilla (manager/admin/supervisor o Master por email). */
export function canManageStaffAttendance(
    role: string | null | undefined,
    email?: string | null,
): boolean {
    if (isMasterDashboardUser(email)) return true;
    return MANAGER_ATTENDANCE_ROLES.has(String(role ?? ''));
}

type ViewAsIdentitySlice = Pick<MasterViewAsIdentity, 'isViewingAs' | 'effectiveRole'>;

/**
 * Igual que canManageStaffAttendance, pero en view-as no aplica el bypass del email Master:
 * solo cuenta el rol del usuario simulado.
 */
export function canManageStaffAttendanceForSession(
    identity: ViewAsIdentitySlice | null | undefined,
    role: string | null | undefined,
    email?: string | null,
): boolean {
    if (identity?.isViewingAs) {
        return MANAGER_ATTENDANCE_ROLES.has(String(identity.effectiveRole ?? ''));
    }
    return canManageStaffAttendance(role, email);
}
