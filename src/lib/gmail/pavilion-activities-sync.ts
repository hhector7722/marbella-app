import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { resolveActivityDate } from '@/lib/pavilion-activities/date-parse';

const BUCKET = 'pavilion_activities';
const DEFAULT_FROM = 'fmarco@cemmarbella.cat';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

type GmailHeader = { name?: string; value?: string };
type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { attachmentId?: string; size?: number; data?: string };
  parts?: GmailPart[];
};

type SyncResult = {
  processed: number;
  imported: number;
  skipped: number;
  errors: string[];
};

function getEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

async function getGmailAccessToken(): Promise<string> {
  const clientId = getEnv('GMAIL_CLIENT_ID');
  const clientSecret = getEnv('GMAIL_CLIENT_SECRET');
  const refreshToken = getEnv('GMAIL_REFRESH_TOKEN');

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Faltan GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET o GMAIL_REFRESH_TOKEN en el servidor.',
    );
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth Gmail falló (${res.status}): ${text.slice(0, 200)}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('OAuth Gmail no devolvió access_token');
  return json.access_token;
}

function decodeBase64Url(data: string): Buffer {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + pad, 'base64');
}

function headerValue(headers: GmailHeader[] | undefined, name: string): string {
  const found = headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return found?.value?.trim() ?? '';
}

function collectPdfParts(parts: GmailPart[] | undefined, acc: GmailPart[] = []): GmailPart[] {
  if (!parts?.length) return acc;
  for (const part of parts) {
    const mime = (part.mimeType ?? '').toLowerCase();
    const filename = (part.filename ?? '').toLowerCase();
    if (mime === 'application/pdf' || filename.endsWith('.pdf')) {
      if (part.body?.attachmentId || part.body?.data) acc.push(part);
    }
    if (part.parts?.length) collectPdfParts(part.parts, acc);
  }
  return acc;
}

async function gmailFetch<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Gmail API ${path} (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function downloadAttachment(
  accessToken: string,
  messageId: string,
  attachmentId: string,
): Promise<Buffer> {
  const json = await gmailFetch<{ data?: string }>(
    accessToken,
    `/messages/${messageId}/attachments/${attachmentId}`,
  );
  if (!json.data) throw new Error('Adjunto Gmail sin datos');
  return decodeBase64Url(json.data);
}

function buildStoragePath(activityDate: string): string {
  return `${activityDate}/activity.pdf`;
}

export async function syncPavilionActivitiesFromGmail(
  supabase: SupabaseClient,
): Promise<SyncResult> {
  const fromEmail = getEnv('GMAIL_ACTIVITY_FROM') || DEFAULT_FROM;
  const accessToken = await getGmailAccessToken();

  const query = encodeURIComponent(`from:${fromEmail} has:attachment filename:pdf newer_than:60d`);
  const list = await gmailFetch<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?q=${query}&maxResults=100`,
  );

  const messages = list.messages ?? [];
  const result: SyncResult = { processed: 0, imported: 0, skipped: 0, errors: [] };

  for (const msg of messages) {
    result.processed += 1;
    try {
      const full = await gmailFetch<{
        id: string;
        internalDate?: string;
        payload?: { headers?: GmailHeader[]; parts?: GmailPart[]; mimeType?: string; body?: GmailPart['body']; filename?: string };
      }>(accessToken, `/messages/${msg.id}?format=full`);

      const { data: existing } = await supabase
        .from('pavilion_activity_sheets')
        .select('id')
        .eq('gmail_message_id', full.id)
        .maybeSingle();

      if (existing) {
        result.skipped += 1;
        continue;
      }

      const subject = headerValue(full.payload?.headers, 'Subject');
      const receivedAtMs = full.internalDate ? Number(full.internalDate) : null;

      const rootParts: GmailPart[] = [];
      if (full.payload?.parts?.length) {
        rootParts.push(...full.payload.parts);
      } else if (full.payload) {
        rootParts.push({
          mimeType: full.payload.mimeType,
          filename: full.payload.filename,
          body: full.payload.body,
        });
      }

      const pdfParts = collectPdfParts(rootParts);
      if (!pdfParts.length) {
        result.skipped += 1;
        continue;
      }

      const pdfPart = pdfParts[0];
      const filename = pdfPart.filename ?? 'actividades.pdf';

      let pdfBuffer: Buffer;
      if (pdfPart.body?.attachmentId) {
        pdfBuffer = await downloadAttachment(accessToken, full.id, pdfPart.body.attachmentId);
      } else if (pdfPart.body?.data) {
        pdfBuffer = decodeBase64Url(pdfPart.body.data);
      } else {
        result.skipped += 1;
        continue;
      }

      const activityDate = resolveActivityDate({ subject, filename, receivedAtMs });
      if (!activityDate) {
        result.errors.push(`Mensaje ${full.id}: no se pudo inferir la fecha (${subject})`);
        continue;
      }

      const storagePath = buildStoragePath(activityDate);

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, pdfBuffer, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        result.errors.push(`Mensaje ${full.id}: ${uploadError.message}`);
        continue;
      }

      const { error: upsertError } = await supabase.from('pavilion_activity_sheets').upsert(
        {
          activity_date: activityDate,
          file_path: storagePath,
          source: 'email',
          gmail_message_id: full.id,
          original_filename: filename,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'activity_date' },
      );

      if (upsertError) {
        result.errors.push(`Mensaje ${full.id} BD: ${upsertError.message}`);
        continue;
      }

      result.imported += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error desconocido';
      result.errors.push(msg);
    }
  }

  return result;
}

export function createPavilionActivitiesServiceClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient(supabaseUrl, supabaseKey);
}
