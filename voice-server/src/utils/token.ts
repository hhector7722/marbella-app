import crypto from 'node:crypto';

export function verifyToken(token: string, secret: string): { ok: boolean; payload?: any; reason?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'invalid format' };
    const [headerB64, bodyB64, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
    if (sig !== expectedSig) return { ok: false, reason: 'invalid signature' };
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { ok: false, reason: 'expired' };
    return { ok: true, payload };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}

