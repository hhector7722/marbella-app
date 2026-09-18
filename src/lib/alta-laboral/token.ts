import { createHash, randomBytes } from 'node:crypto';

export const INTAKE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function generateIntakeToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashIntakeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function intakeExpiresAt(from = new Date()): Date {
  return new Date(from.getTime() + INTAKE_TTL_MS);
}
