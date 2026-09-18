import { createAltaServiceClient } from './service-client.ts';
import { hashIntakeToken } from './token.ts';
import type { EmploymentIntakeRow, PublicIntakeState } from './types.ts';

export async function lookupIntakeByToken(
  token: string,
): Promise<EmploymentIntakeRow | null> {
  const trimmed = token.trim();
  if (!trimmed || trimmed.length < 16) return null;
  const admin = createAltaServiceClient();
  const { data, error } = await admin
    .from('employment_intakes')
    .select('*')
    .eq('token_hash', hashIntakeToken(trimmed))
    .maybeSingle();
  if (error || !data) return null;
  return data as EmploymentIntakeRow;
}

export function publicStateOf(
  row: EmploymentIntakeRow | null,
  now = new Date(),
): PublicIntakeState {
  if (!row) return 'invalid';
  if (row.status === 'revoked' || row.status === 'expired') return 'expired';
  if (Date.parse(row.expires_at) < now.getTime() && row.status === 'pending_candidate') {
    return 'expired';
  }
  if (row.status === 'pending_candidate') return 'open';
  return 'submitted';
}
