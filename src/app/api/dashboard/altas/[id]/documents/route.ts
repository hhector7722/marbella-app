import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { isMasterDashboardUser } from '@/lib/master-dashboard';
import { isSandboxRequest } from '@/lib/sandbox/server';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import { ALTA_BUCKET, imageExtension, intakeImagePath, validateAltaImage } from '@/lib/alta-laboral/storage.ts';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'Expediente no válido' }, { status: 400 });
  if (await isSandboxRequest()) return NextResponse.json({ error: 'Acción no disponible en sandbox' }, { status: 403 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !isMasterDashboardUser(user.email)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 });
  }

  const form = await request.formData();
  const side = form.get('side');
  if (side !== 'delantera' && side !== 'trasera') {
    return NextResponse.json({ error: 'Cara del documento no válida' }, { status: 400 });
  }
  const raw = form.get('image');
  const file = raw instanceof File ? raw : null;
  const valid = validateAltaImage(file, side);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  if (!file || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido' }, { status: 400 });
  }

  const admin = createAltaServiceClient();
  const { data: intake, error: loadError } = await admin.from('employment_intakes')
    .select('status, dni_front_storage_path, dni_back_storage_path').eq('id', id).maybeSingle();
  if (loadError || !intake) return NextResponse.json({ error: 'Alta no encontrada' }, { status: 404 });
  if (intake.status === 'applied') {
    return NextResponse.json({ error: 'Esta alta ya está aplicada y no puede editarse' }, { status: 409 });
  }

  const ext = imageExtension(file.name);
  if (!ext) return NextResponse.json({ error: 'Extensión no válida' }, { status: 400 });
  const path = intakeImagePath(id, side, ext);
  const uploaded = await admin.storage.from(ALTA_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
  });
  if (uploaded.error) return NextResponse.json({ error: uploaded.error.message }, { status: 500 });

  const key = side === 'delantera' ? 'dni_front_storage_path' : 'dni_back_storage_path';
  const previous = intake[key];
  const { error: updateError } = await admin.from('employment_intakes').update({ [key]: path }).eq('id', id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  if (previous && previous !== path && previous.startsWith(`intakes/${id}/`)) {
    const removed = await admin.storage.from(ALTA_BUCKET).remove([previous]);
    if (removed.error) console.error('Imagen anterior pendiente de limpieza', removed.error.message);
  }
  revalidatePath(`/dashboard/altas/${id}`);
  return NextResponse.json({ success: true, path });
}
