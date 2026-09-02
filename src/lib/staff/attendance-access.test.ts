import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MASTER_DASHBOARD_EMAIL } from '@/lib/master-dashboard';
import { canManageStaffAttendance } from './attendance-access.ts';

describe('canManageStaffAttendance', () => {
    it('manager y Master por email pueden gestionar asistencia', () => {
        assert.equal(canManageStaffAttendance('manager'), true);
        assert.equal(canManageStaffAttendance('staff', MASTER_DASHBOARD_EMAIL), true);
        assert.equal(canManageStaffAttendance('staff', 'hhector7722@gmail.com'), true);
    });

    it('staff sin email Master no puede gestionar asistencia', () => {
        assert.equal(canManageStaffAttendance('staff'), false);
        assert.equal(canManageStaffAttendance('staff', 'otro@gmail.com'), false);
        assert.equal(canManageStaffAttendance('supervisor'), false);
    });
});
