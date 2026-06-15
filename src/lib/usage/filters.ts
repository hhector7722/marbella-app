import { MASTER_DASHBOARD_EMAIL } from '@/lib/master-dashboard';
import { firstNameOnly } from '@/lib/usage/display-name';

export const USAGE_RECENT_PAGE_SIZE = 40;

export type UsageFilterUserRef = {
  profileId: string;
  email: string;
  displayName: string;
};

/** Hector queda fuera de la selección por defecto en analytics de uso. */
export function isUsageDefaultExcludedUser(user: UsageFilterUserRef): boolean {
  const email = user.email.trim().toLowerCase();
  if (email === MASTER_DASHBOARD_EMAIL.toLowerCase()) return true;
  return firstNameOnly(user.displayName).toLowerCase() === 'hector';
}

export function defaultUsageProfileIds(users: UsageFilterUserRef[]): string[] {
  return users.filter((user) => !isUsageDefaultExcludedUser(user)).map((user) => user.profileId);
}

export function isDefaultUsageSelection(
  selected: Set<string>,
  users: UsageFilterUserRef[]
): boolean {
  const defaultIds = defaultUsageProfileIds(users);
  if (selected.size !== defaultIds.length) return false;
  return defaultIds.every((id) => selected.has(id));
}

export function resolveUsageProfileIds(
  profileIds: string[] | null,
  users: UsageFilterUserRef[]
): string[] {
  if (profileIds !== null) return profileIds;
  return defaultUsageProfileIds(users);
}

export function serializeProfileIdsForUrl(profileIds: string[] | null): string | null {
  if (profileIds === null) return null;
  return profileIds.length > 0 ? profileIds.join(',') : '';
}

export function parseProfileIdsParam(
  usuarios?: string,
  legacyUsuario?: string
): string[] | null {
  if (usuarios !== undefined) {
    const ids = usuarios
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
    return ids;
  }

  const legacy = legacyUsuario?.trim();
  if (legacy) return [legacy];

  return null;
}
