import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { createClient } from '@/utils/supabase/server';
import { AIAgent } from '@/ai-agent/core/agent';

// Verificar token HMAC firmado por voice-token endpoint
function verifyToken(token: string, secret: string) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false as const, reason: 'invalid_format' };
    const [headerB64, bodyB64, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${headerB64}.${bodyB64}`).digest('base64url');
    if (expected !== sig) return { ok: false as const, reason: 'invalid_signature' };
    const payload = JSON.parse(Buffer.from(bodyB64, 'base64url').toString('utf8'));
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return { ok: false as const, reason: 'expired' };
    return { ok: true as const, payload };
  } catch (e: any) {
    return { ok: false as const, reason: String(e) };
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const m = authHeader.match(/^Bearer (.+)$/);
    if (!m) return NextResponse.json({ error: 'Missing Authorization Bearer token' }, { status: 401 });

    const token = m[1];
    const secret = process.env.VOICE_WS_SECRET;
    if (!secret) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });

    const verified = verifyToken(token, secret);
    if (!verified.ok) {
      return NextResponse.json({ error: `Invalid token: ${verified.reason}` }, { status: 401 });
    }

    const payload = verified.payload as { sub: string; iat?: number; exp?: number };
    const userId = payload.sub;
    if (!userId) return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });

    const body = await req.json().catch(() => ({} as any));
    const query = typeof body?.query === 'string' ? body.query.trim() : '';
    if (!query) return NextResponse.json({ error: 'Missing query' }, { status: 400 });

    // Create supabase client to read profile/role
    const supabase = await createClient();
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, first_name, last_name')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.warn('voice-chat profile query error:', profileError.message);
    }

    // Derivar userRole y userName con fallback
    const dbRole = (profile?.role as string) || 'staff';
    const userRole = dbRole === 'manager' || dbRole === 'supervisor' ? 'manager' : 'staff';

    const profileFirst =
      profile && (profile as any).first_name ? String((profile as any).first_name).trim() : undefined;
    const userName = profileFirst || (typeof userId === 'string' ? userId.split('-')[0] : String(userId));

    // Llamada al agente con identidad y RBAC
    const agent = new AIAgent();
    const result = await agent.processQuery({
      query,
      userId,
      userName,
      userRole,
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 });
  }
}

