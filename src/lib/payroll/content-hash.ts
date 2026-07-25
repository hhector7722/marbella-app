import { createHash } from 'node:crypto';

/** Hash estable SHA-256 del PDF (hex). */
export function hashPayrollPdf(buffer: Buffer | Uint8Array): string {
  return createHash('sha256').update(buffer).digest('hex');
}
