import crypto from 'node:crypto';

export function verifyToken(
  token: string,
  secret: string,
  opts: { leewaySec?: number } = {}
): { ok: boolean; payload?: any; reason?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, reason: 'invalid format' };
    const [headerB64, bodyB64, sigB64] = parts;

    if (!secret) return { ok: false, reason: 'server misconfigured (missing secret)' };

    const expectedB64 = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');

    let a, b;
    try {
      a = Buffer.from(sigB64, 'base64url');
      b = Buffer.from(expectedB64, 'base64url');
    } catch {
      return { ok: false, reason: 'invalid signature encoding' };
    }

    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, reason: 'invalid signature' };
    }

    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));

    const now = Math.floor(Date.now() / 1000);
    const leeway = opts.leewaySec || 0;

    if (payload.exp && typeof payload.exp !== 'number') return { ok: false, reason: 'exp not a number' };
    if (payload.iat && typeof payload.iat !== 'number') return { ok: false, reason: 'iat not a number' };

    // reject obviously-bad small timestamps (detects malformed tokens using seconds-since-midnight or small offsets instead of epoch)
    if (payload.exp && payload.exp < 1000000) return { ok: false, reason: 'exp looks malformed (too small)' };
    if (payload.iat && payload.iat < 1000000) return { ok: false, reason: 'iat looks malformed (too small)' };

    if (payload.exp && payload.exp + leeway < now) return { ok: false, reason: 'expired' };
    if (payload.iat && payload.iat - leeway > now) return { ok: false, reason: 'issued in the future' };

    return { ok: true, payload };
  } catch (e) {
    return { ok: false, reason: String(e) };
  }
}