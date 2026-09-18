import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { ALTA_BUCKET } from '@/lib/alta-laboral/storage.ts';
import type { EmploymentIntakeRow } from '@/lib/alta-laboral/types.ts';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function mimeForPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id') ?? '';
  const side = searchParams.get('side') === 'trasera' ? 'trasera' : 'delantera';
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
  const path = side === 'trasera' ? row.dni_back_storage_path : row.dni_front_storage_path;
  if (!path) {
    return NextResponse.json({ error: 'No hay imagen' }, { status: 404 });
  }

  const downloaded = await admin.storage.from(ALTA_BUCKET).download(path);
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json({ error: 'No se pudo abrir la imagen' }, { status: 404 });
  }

  const buffer = Buffer.from(await downloaded.data.arrayBuffer());
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeForPath(path),
      'Cache-Control': 'private, max-age=60',
    },
  });
}
