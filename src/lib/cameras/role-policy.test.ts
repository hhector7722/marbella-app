import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canAccessCamerasForRole, canUseCameraPresenceIndicator } from './role-policy.ts';

describe('Política de cámaras: permisos y semáforo', () => {
  it('solo manager y admin pueden acceder', () => {
    assert.equal(canAccessCamerasForRole('admin'), true);
    assert.equal(canAccessCamerasForRole('manager'), true);
    for (const role of ['staff', 'chef', 'supervisor', '', null, undefined]) {
      assert.equal(canAccessCamerasForRole(role), false, String(role));
    }
  });

  it('solo Héctor, como manager/admin, puede pasar a verde', () => {
    assert.equal(canUseCameraPresenceIndicator('manager', 'hhector7722@gmail.com'), true);
    assert.equal(canUseCameraPresenceIndicator('admin', 'HHECTOR7722@GMAIL.COM '), true);
    assert.equal(canUseCameraPresenceIndicator('staff', 'hhector7722@gmail.com'), false);
    for (const role of ['admin', 'manager']) {
      assert.equal(canUseCameraPresenceIndicator(role, 'fogotorrat@gmail.com'), false);
      assert.equal(canUseCameraPresenceIndicator(role, 'otro@example.com'), false);
    }
  });
});
