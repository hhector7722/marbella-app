import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MANAGED_EXTRA_IDENTITIES,
  pickNextManagedExtraSlot,
  type ManagedExtraSlotRef,
} from './managed-extra-slots.ts';

const slots: ManagedExtraSlotRef[] = MANAGED_EXTRA_IDENTITIES.map((identity) => ({
  slot: identity.slot,
  profileId: identity.userId,
}));

const [extra1, extra2, extra3] = slots;

describe('slots de extra gestionado', () => {
  it('día vacío: Extra asigna Extra 1', () => {
    const next = pickNextManagedExtraSlot(slots, new Set());
    assert.equal(next?.slot, 1);
    assert.equal(next?.profileId, extra1!.profileId);
  });

  it('Extra 1 usado: Extra asigna Extra 2', () => {
    const next = pickNextManagedExtraSlot(slots, new Set([extra1!.profileId]));
    assert.equal(next?.slot, 2);
    assert.equal(next?.profileId, extra2!.profileId);
  });

  it('Extra 1 y Extra 2 usados: Extra asigna Extra 3', () => {
    const next = pickNextManagedExtraSlot(
      slots,
      new Set([extra1!.profileId, extra2!.profileId]),
    );
    assert.equal(next?.slot, 3);
  });

  it('Extra 1 y Extra 3 usados: Extra reutiliza Extra 2', () => {
    const next = pickNextManagedExtraSlot(
      slots,
      new Set([extra1!.profileId, extra3!.profileId]),
    );
    assert.equal(next?.slot, 2);
    assert.equal(next?.profileId, extra2!.profileId);
  });

  it('los tres usados: no hay otro Extra', () => {
    const next = pickNextManagedExtraSlot(
      slots,
      new Set([extra1!.profileId, extra2!.profileId, extra3!.profileId]),
    );
    assert.equal(next, null);
  });

  it('el sábado no bloquea el domingo', () => {
    const saturday = new Set([extra1!.profileId]);
    const sunday = new Set<string>();
    assert.equal(pickNextManagedExtraSlot(slots, saturday)?.slot, 2);
    assert.equal(pickNextManagedExtraSlot(slots, sunday)?.slot, 1);
  });
});
