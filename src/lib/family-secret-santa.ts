import { createHash, timingSafeEqual } from "node:crypto";

export const FAMILY_STATE_ID = "family-2026";

export const FAMILY_PARTICIPANTS = [
  "David",
  "Diego",
  "Dani",
  "Daniel",
  "Ivan",
  "Joel",
  "Samu",
  "Hector",
  "Neus",
  "Carolina",
  "Andrea",
  "Laura",
] as const;

export type FamilyParticipant = (typeof FAMILY_PARTICIPANTS)[number];
export type FamilyAssignments = Partial<Record<FamilyParticipant, FamilyParticipant>>;

const ACCESS_TOKEN_HASH =
  "d19dfd10073d48546730ed459c3ae04287901291e3b06ec5d98bf624e01a45ca";

export function isValidFamilyToken(token: string): boolean {
  const digest = createHash("sha256").update(token).digest();
  const expected = Buffer.from(ACCESS_TOKEN_HASH, "hex");

  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export function normalizeFamilyAssignments(value: unknown): FamilyAssignments {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const participantSet = new Set<string>(FAMILY_PARTICIPANTS);
  const usedReceivers = new Set<string>();
  const normalized: FamilyAssignments = {};

  for (const giver of FAMILY_PARTICIPANTS) {
    const receiver = source[giver];
    if (
      typeof receiver !== "string" ||
      !participantSet.has(receiver) ||
      receiver === giver ||
      usedReceivers.has(receiver)
    ) {
      continue;
    }

    normalized[giver] = receiver as FamilyParticipant;
    usedReceivers.add(receiver);
  }

  return normalized;
}

export function canCompleteFamilyAssignments(
  assignments: FamilyAssignments,
): boolean {
  const usedReceivers = new Set(
    Object.values(assignments).filter(Boolean) as FamilyParticipant[],
  );

  const remainingGivers = FAMILY_PARTICIPANTS.filter(
    (giver) => !assignments[giver],
  );
  const remainingReceivers = FAMILY_PARTICIPANTS.filter(
    (receiver) => !usedReceivers.has(receiver),
  );

  function search(
    givers: readonly FamilyParticipant[],
    receivers: readonly FamilyParticipant[],
  ): boolean {
    if (givers.length === 0) return true;

    let selectedIndex = 0;
    let selectedOptions: FamilyParticipant[] | null = null;

    for (let i = 0; i < givers.length; i += 1) {
      const giver = givers[i];
      const options = receivers.filter((receiver) => receiver !== giver);

      if (options.length === 0) return false;

      if (selectedOptions === null || options.length < selectedOptions.length) {
        selectedIndex = i;
        selectedOptions = options;
      }
    }

    const giver = givers[selectedIndex];
    const nextGivers = givers.filter((_, index) => index !== selectedIndex);

    for (const receiver of selectedOptions ?? []) {
      const nextReceivers = receivers.filter((candidate) => candidate !== receiver);
      if (search(nextGivers, nextReceivers)) return true;
    }

    return false;
  }

  return search(remainingGivers, remainingReceivers);
}

export function getAvailableFamilyReceivers(
  giver: FamilyParticipant,
  currentAssignments: FamilyAssignments,
): FamilyParticipant[] {
  const base: FamilyAssignments = { ...currentAssignments };
  delete base[giver];

  const usedReceivers = new Set(
    Object.values(base).filter(Boolean) as FamilyParticipant[],
  );

  return FAMILY_PARTICIPANTS.filter((receiver) => {
    if (receiver === giver || usedReceivers.has(receiver)) return false;

    return canCompleteFamilyAssignments({
      ...base,
      [giver]: receiver,
    });
  });
}
