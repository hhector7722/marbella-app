import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/utils/supabase/server';

function base64url(buf: Buffer) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createToken(payload: Record<string, unknown>, secret: string, ttl = 3600) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttl };
  const headerB64 = base64url(Buffer.from(JSON.stringify(header)));
  const bodyB64 = base64url(Buffer.from(JSON.stringify(body)));
  const sig = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest();
  const sigB64 = base64url(sig);
  return `${headerB64}.${bodyB64}.${sigB64}`;
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const secret = process.env.VOICE_WS_SECRET;
  if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

  const ttl = Number(process.env.VOICE_TOKEN_TTL_SECONDS || 3600);
  const token = createToken({ sub: user.id }, secret, ttl);

  return NextResponse.json({ token });
}

