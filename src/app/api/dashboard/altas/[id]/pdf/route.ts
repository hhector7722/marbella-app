import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { canGenerateAltaPdf, missingAltaPdfFields } from '@/lib/alta-laboral/completeness.ts';
import { ALTA_BUCKET } from '@/lib/alta-laboral/storage.ts';
import { buildAltaLaboralPdf, type AltaPdfImage } from '@/lib/pdf/alta-laboral-pdf.ts';
import type { EmploymentIntakeRow } from '@/lib/alta-laboral/types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function pdfFormat(path: string): AltaPdfImage['format'] {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'PNG';
  if (ext === 'webp') return 'WEBP';
  return 'JPEG';
}

async function toPdfImage(
  admin: ReturnType<typeof createAltaServiceClient>,
  path: string | null,
): Promise<AltaPdfImage | null> {
  if (!path) return null;
  const downloaded = await admin.storage.from(ALTA_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) return null;
  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  const b64 = buffer.toString('base64');
  const mime =
    pdfFormat(path) === 'PNG' ? 'image/png' : pdfFormat(path) === 'WEBP' ? 'image/webp' : 'image/jpeg';
  return { dataUrl: `data:${mime};base64,${b64}`, format: pdfFormat(path) };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: 'Parámetro no válido' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const admin = createAltaServiceClient();
  const { data, error } = await admin.from('employment_intakes').select('*').eq('id', id).maybeSingle();
  if (error || !data) {
    return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 });
  }
  const row = data as EmploymentIntakeRow;
  if (!canGenerateAltaPdf(row)) {
    const missing = missingAltaPdfFields(row).map((f) => f.label).join(', ');
    return NextResponse.json({ error: `Faltan datos: ${missing}` }, { status: 409 });
  }

  const [frontImage, backImage] = await Promise.all([
    toPdfImage(admin, row.dni_front_storage_path),
    toPdfImage(admin, row.dni_back_storage_path),
  ]);

  try {
    const pdf = buildAltaLaboralPdf({ row, frontImage, backImage });
    return new NextResponse(Buffer.from(pdf.bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'No se pudo generar el PDF' },
      { status: 500 },
    );
  }
}
