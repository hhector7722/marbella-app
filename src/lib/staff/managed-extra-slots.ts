/** Exactamente tres slots. No hay Extra 4. */
export const MANAGED_EXTRA_SLOT_COUNT = 3;

export const MANAGED_EXTRA_ACTION_LABEL = 'Extra';

export const MANAGED_EXTRA_INITIAL_RATE = 10;

export const MANAGED_EXTRA_WEEKLY_HOURS = 0;

/** Lunes lejano: el tramo abierto cubre el historial sin depender del día del bootstrap. */
export const MANAGED_EXTRA_JOINING_DATE = '2020-01-06';

/** Bloqueo práctico de login. GoTrue no tiene ban permanente; 100 años. */
export const MANAGED_EXTRA_BAN_DURATION = '876000h';

export const MANAGED_EXTRA_ACCOUNT_KIND = 'managed_extra';

export type ManagedExtraSlotNumber = 1 | 2 | 3;

export type ManagedExtraSlotRef = {
  slot: ManagedExtraSlotNumber;
  profileId: string;
};

/**
 * Identidad estable. No depende del nombre visible ni del email técnico.
 * El email solo existe en Auth para cumplir el alta de usuario.
 */
export const MANAGED_EXTRA_IDENTITIES: readonly {
  slot: ManagedExtraSlotNumber;
  userId: string;
  email: string;
}[] = [
  {
    slot: 1,
    userId: 'a1b00001-0000-4000-8000-000000000001',
    email: 'extra-1@internal.invalid',
  },
  {
    slot: 2,
    userId: 'a1b00002-0000-4000-8000-000000000002',
    email: 'extra-2@internal.invalid',
  },
  {
    slot: 3,
    userId: 'a1b00003-0000-4000-8000-000000000003',
    email: 'extra-3@internal.invalid',
  },
];

export function isManagedExtraSlot(value: number | null | undefined): value is ManagedExtraSlotNumber {
  return value === 1 || value === 2 || value === 3;
}

export function managedExtraVisibleName(slot: ManagedExtraSlotNumber): string {
  return `Extra ${slot}`;
}

/**
 * Primer slot libre, en orden 1 → 2 → 3.
 * `assignedProfileIds` es el día que se está editando, no la ocupación global.
 */
export function pickNextManagedExtraSlot(
  slots: readonly ManagedExtraSlotRef[],
  assignedProfileIds: ReadonlySet<string>,
): ManagedExtraSlotRef | null {
  const ordered = slots
    .filter((slot) => isManagedExtraSlot(slot.slot))
    .slice()
    .sort((a, b) => a.slot - b.slot);

  for (const slot of ordered) {
    if (!assignedProfileIds.has(slot.profileId)) return slot;
  }
  return null;
}
