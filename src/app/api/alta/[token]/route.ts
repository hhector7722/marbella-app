import { NextResponse } from 'next/server';
import { candidateFieldsSchema } from '@/lib/alta-laboral/schema.ts';
import { candidateToRow } from '@/lib/alta-laboral/mapping.ts';
import { lookupIntakeByToken, publicStateOf } from '@/lib/alta-laboral/lookup.ts';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import {
  ALTA_BUCKET,
  imageExtension,
  intakeImagePath,
  validateAltaImage,
} from '@/lib/alta-laboral/storage.ts';

export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const row = await lookupIntakeByToken(token);
  const state = publicStateOf(row);
  return NextResponse.json({ state });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const row = await lookupIntakeByToken(token);
  const state = publicStateOf(row);
  if (state === 'invalid') {
    return NextResponse.json({ success: false, error: 'Este enlace no es válido' }, { status: 404 });
  }
  if (state === 'expired') {
    return NextResponse.json({ success: false, error: 'Este enlace ha caducado' }, { status: 410 });
  }
  if (state === 'submitted' || !row) {
    return NextResponse.json({ success: false, error: 'Estos datos ya se han enviado' }, { status: 409 });
  }

  const form = await request.formData();
  const parsed = candidateFieldsSchema.safeParse({
    firstName: String(form.get('firstName') ?? ''),
    lastName: String(form.get('lastName') ?? ''),
    dni: String(form.get('dni') ?? ''),
    afiliacionSeguridadSocial: String(form.get('afiliacionSeguridadSocial') ?? ''),
    nacionalidad: String(form.get('nacionalidad') ?? ''),
    fechaNacimiento: String(form.get('fechaNacimiento') ?? ''),
    domicilio: String(form.get('domicilio') ?? ''),
    phone: String(form.get('phone') ?? ''),
    email: String(form.get('email') ?? ''),
    bankAccount: String(form.get('bankAccount') ?? ''),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos' },
      { status: 400 },
    );
  }

  const front = form.get('dniFront');
  const back = form.get('dniBack');
  const frontFile = front instanceof File ? front : null;
  const backFile = back instanceof File ? back : null;
  const frontOk = validateAltaImage(frontFile, 'delantera');
  if (!frontOk.ok) return NextResponse.json({ success: false, error: frontOk.error }, { status: 400 });
  const backOk = validateAltaImage(backFile, 'trasera');
  if (!backOk.ok) return NextResponse.json({ success: false, error: backOk.error }, { status: 400 });

  const admin = createAltaServiceClient();
  const frontExt = imageExtension(frontFile!.name) ?? 'jpg';
  const backExt = imageExtension(backFile!.name) ?? 'jpg';
  const frontPath = intakeImagePath(row.id, 'delantera', frontExt);
  const backPath = intakeImagePath(row.id, 'trasera', backExt);

  const frontUp = await admin.storage.from(ALTA_BUCKET).upload(frontPath, frontFile!, {
    upsert: true,
    contentType: frontFile!.type || 'image/jpeg',
  });
  if (frontUp.error) {
    return NextResponse.json({ success: false, error: frontUp.error.message }, { status: 500 });
  }
  const backUp = await admin.storage.from(ALTA_BUCKET).upload(backPath, backFile!, {
    upsert: true,
    contentType: backFile!.type || 'image/jpeg',
  });
  if (backUp.error) {
    return NextResponse.json({ success: false, error: backUp.error.message }, { status: 500 });
  }

  const { data: updated, error } = await admin
    .from('employment_intakes')
    .update({
      ...candidateToRow(parsed.data),
      dni_front_storage_path: frontPath,
      dni_back_storage_path: backPath,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('status', 'pending_candidate')
    .select('id')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ success: false, error: 'Estos datos ya se han enviado' }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}
