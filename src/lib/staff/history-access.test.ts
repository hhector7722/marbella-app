import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolveAttendanceSession } from './history-access.ts';

describe('resolveAttendanceSession', () => {
    it('en view-as staff no concede gestión de plantilla', () => {
        const session = resolveAttendanceSession({
            identity: {
                isViewingAs: true,
                effectiveUserId: 'staff-1',
                effectiveRole: 'staff',
                effectiveEmail: 'staff@example.com',
            },
            sessionUserId: 'master-1',
            sessionRole: 'manager',
            sessionEmail: 'hhector7722@gmail.com',
        });

        assert.equal(session.canManage, false);
        assert.equal(session.userId, 'staff-1');
        assert.equal(session.isViewingAs, true);
    });

    it('en view-as manager sí concede gestión', () => {
        const session = resolveAttendanceSession({
            identity: {
                isViewingAs: true,
                effectiveUserId: 'mgr-1',
                effectiveRole: 'manager',
                effectiveEmail: 'mgr@example.com',
            },
            sessionUserId: 'master-1',
            sessionRole: 'manager',
            sessionEmail: 'hhector7722@gmail.com',
        });

        assert.equal(session.canManage, true);
    });

    it('en view-as supervisor no concede gestión', () => {
        const session = resolveAttendanceSession({
            identity: {
                isViewingAs: true,
                effectiveUserId: 'sup-1',
                effectiveRole: 'supervisor',
                effectiveEmail: 'sup@example.com',
            },
            sessionUserId: 'master-1',
            sessionRole: 'manager',
            sessionEmail: 'hhector7722@gmail.com',
        });

        assert.equal(session.canManage, false);
    });
});
