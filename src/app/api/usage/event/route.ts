import { NextResponse } from 'next/server';
import { deriveUsageLabel } from '@/lib/usage/labels';
import { recordAppUsageEventWithClient } from '@/lib/usage/record';
import type { AppUsageEventType, UsageClientEventPayload } from '@/lib/usage/types';
import { createClient } from '@/utils/supabase/server';

const ALLOWED_TYPES: AppUsageEventType[] = ['login', 'page_view', 'action'];

function sanitizePath(path: unknown): string | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.length > 512) {
    return null;
  }
  return path;
}

function sanitizeOptionalText(value: unknown, max = 512): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  return value.trim().slice(0, max);
}

function sanitizeDuration(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded < 0 || rounded > 24 * 60 * 60 * 1000) return null;
  return rounded;
}

function sanitizeMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (key.length > 64) continue;
    if (typeof raw === 'string') out[key] = raw.slice(0, 256);
    else if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = raw;
    else if (typeof raw === 'boolean') out[key] = raw;
    else if (raw === null) out[key] = null;
  }
  return out;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
  }

  let body: UsageClientEventPayload;
  try {
    body = (await request.json()) as UsageClientEventPayload;
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  if (!body?.eventType || !ALLOWED_TYPES.includes(body.eventType)) {
    return NextResponse.json({ error: 'eventType no válido' }, { status: 400 });
  }

  const path = sanitizePath(body.path);
  const metadata = sanitizeMetadata(body.metadata);

  await recordAppUsageEventWithClient(supabase, user.id, {
    eventType: body.eventType,
    path,
    label:
      sanitizeOptionalText(body.label) ??
      (path ? deriveUsageLabel(path, metadata, body.eventType) : null),
    search: sanitizeOptionalText(body.search, 1024),
    referrerPath: sanitizePath(body.referrerPath),
    durationMs: sanitizeDuration(body.durationMs),
    metadata,
  });

  return NextResponse.json({ ok: true });
}
