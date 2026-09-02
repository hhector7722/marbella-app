import { canManageStaffAttendance, canManageStaffAttendanceForSession } from '@/lib/staff/attendance-access';
import type { MasterViewAsIdentity } from '@/lib/master-view-as';

export type HistoryAccessScope = {
    actorUserId: string;
    effectiveUserId: string;
    effectiveRole: string;
    effectiveEmail: string;
    isViewingAs: boolean;
};

export type AttendanceSession = {
    userId: string;
    role: string;
    email: string;
    canManage: boolean;
    isViewingAs: boolean;
};

/** Sesión efectiva de asistencia en cliente (view-as o sesión real). */
export function resolveAttendanceSession(params: {
    identity: Pick<
        MasterViewAsIdentity,
        'isViewingAs' | 'effectiveUserId' | 'effectiveRole' | 'effectiveEmail'
    > | null;
    sessionUserId: string;
    sessionRole: string;
    sessionEmail: string;
}): AttendanceSession {
    if (params.identity?.isViewingAs) {
        return {
            userId: params.identity.effectiveUserId,
            role: params.identity.effectiveRole,
            email: params.identity.effectiveEmail,
            canManage: canManageStaffAttendanceForSession(
                params.identity,
                params.identity.effectiveRole,
                params.identity.effectiveEmail,
            ),
            isViewingAs: true,
        };
    }

    return {
        userId: params.sessionUserId,
        role: params.sessionRole,
        email: params.sessionEmail,
        canManage: canManageStaffAttendance(params.sessionRole, params.sessionEmail),
        isViewingAs: false,
    };
}

export function canReadEmployeeHistory(
    scope: HistoryAccessScope,
    targetUserId: string,
): boolean {
    const identitySlice = scope.isViewingAs
        ? { isViewingAs: true as const, effectiveRole: scope.effectiveRole }
        : null;

    const canManage = canManageStaffAttendanceForSession(
        identitySlice,
        scope.effectiveRole,
        scope.effectiveEmail,
    );

    if (canManage) return true;
    return scope.effectiveUserId === targetUserId;
}
