import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MASTER_DASHBOARD_EMAIL } from '../master-dashboard.ts';
import { canManageStaffAttendance, canManageStaffAttendanceForSession } from './attendance-access.ts';
import type { MasterViewAsIdentity } from '../master-view-as.ts';

describe('canManageStaffAttendance', () => {
    it('manager, admin, supervisor y Master por email pueden gestionar asistencia', () => {
        assert.equal(canManageStaffAttendance('manager'), true);
        assert.equal(canManageStaffAttendance('admin'), true);
        assert.equal(canManageStaffAttendance('supervisor'), true);
        assert.equal(canManageStaffAttendance('staff', MASTER_DASHBOARD_EMAIL), true);
        assert.equal(canManageStaffAttendance('staff', 'hhector7722@gmail.com'), true);
    });

    it('staff sin email Master no puede gestionar asistencia', () => {
        assert.equal(canManageStaffAttendance('staff'), false);
        assert.equal(canManageStaffAttendance('staff', 'otro@gmail.com'), false);
    });
});

describe('canManageStaffAttendanceForSession', () => {
    const viewingAsStaff: Pick<MasterViewAsIdentity, 'isViewingAs' | 'effectiveRole'> = {
        isViewingAs: true,
        effectiveRole: 'staff',
    };

    it('en view-as staff no aplica bypass Master aunque el email de sesión sea Master', () => {
        assert.equal(
            canManageStaffAttendanceForSession(viewingAsStaff, 'staff', 'hhector7722@gmail.com'),
            false,
        );
    });

    it('en view-as manager sí puede gestionar asistencia', () => {
        assert.equal(
            canManageStaffAttendanceForSession(
                { isViewingAs: true, effectiveRole: 'manager' },
                'staff',
                'hhector7722@gmail.com',
            ),
            true,
        );
    });

    it('sin view-as delega en canManageStaffAttendance', () => {
        assert.equal(
            canManageStaffAttendanceForSession(null, 'staff', 'hhector7722@gmail.com'),
            true,
        );
    });
});
