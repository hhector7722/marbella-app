export const USAGE_RECENT_PAGE_SIZE = 40;

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
