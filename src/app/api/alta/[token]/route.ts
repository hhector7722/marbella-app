import { NextResponse } from 'next/server';
import { candidateFieldsSchema } from '@/lib/alta-laboral/schema.ts';
import { candidateToRow, intakeToProfilePatch } from '@/lib/alta-laboral/mapping.ts';
import { lookupIntakeByToken, publicStateOf } from '@/lib/alta-laboral/lookup.ts';
import { createAltaServiceClient } from '@/lib/alta-laboral/service-client.ts';
import {
  ALTA_BUCKET,
  imageExtension,
  intakeImagePath,
  profileDniPath,
  validateAltaImage,
} from '@/lib/alta-laboral/storage.ts';

export const runtime = 'nodejs';

const ACCOUNT_REDIRECT = 'https://marbella-app.vercel.app/profile?type=invite';

// Un error antes de terminar la vinculación deja el enlace reutilizable.
async function rollbackProvision(
  admin: ReturnType<typeof createAltaServiceClient>,
  intakeId: string,
  invitedUserId?: string,
): Promise<boolean> {
  if (invitedUserId) {
    const { error } = await admin.auth.admin.deleteUser(invitedUserId);
    if (error) {
      console.error('alta: no se pudo revertir la invitación', error);
      return false;
    }
  }
  const { error } = await admin
    .from('employment_intakes')
    .update({ status: 'pending_candidate', submitted_at: null })
    .eq('id', intakeId)
    .eq('status', 'submitted')
    .is('profile_id', null);
  if (error) console.error('alta: no se pudo reabrir el enlace', error);
  return !error;
}

// Las fotos originales permanecen en el expediente incluso si el copiado falla.
async function copyIntakeDocuments(
  admin: ReturnType<typeof createAltaServiceClient>,
  userId: string,
  images: Array<{ source: string; side: 'delantera' | 'trasera'; ext: string }>,
) {
  for (const { source, side, ext } of images) {
    const target = profileDniPath(userId, side, ext);
    const { error } = await admin.storage.from(ALTA_BUCKET).copy(source, target);
    if (error && !/already exists|duplicate/i.test(error.message)) {
      console.error('alta: copia de documento pendiente', { userId, side, error: error.message });
    }
  }
}

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


  const email = parsed.data.email.trim().toLowerCase();
  const { data: existingProfile, error: existingError } = await admin
    .from('profiles')
    .select('id')
    .ilike('email', email)
    .maybeSingle();
  if (existingError) {
    return NextResponse.json({ success: false, error: 'No se pudo comprobar el correo' }, { status: 500 });
  }
  if (existingProfile) {
    return NextResponse.json(
      { success: false, error: 'Ya existe una cuenta con ese correo. Contacta con el responsable.' },
      { status: 409 },
    );
  }

  // Solo una petición puede consumir el token y empezar a crear la cuenta.
  const { data: updated, error } = await admin
    .from('employment_intakes')
    .update({
      ...candidateToRow(parsed.data),
      email,
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
    return NextResponse.json({ success: false, error: 'No se pudieron guardar los datos' }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ success: false, error: 'Estos datos ya se han enviado' }, { status: 409 });
  }

  // El empleado establece su contraseña desde un enlace enviado a su propio correo.
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: ACCOUNT_REDIRECT,
    data: {
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
    },
  });
  if (invited.error || !invited.data.user) {
    console.error('alta: invitación Auth fallida', invited.error);
    const recovered = await rollbackProvision(admin, row.id);
    return NextResponse.json(
      {
        success: false,
        error: recovered
          ? 'No se pudo enviar la invitación de acceso. Inténtalo de nuevo o contacta con el responsable.'
          : 'Datos recibidos, pero el alta de acceso necesita revisión del responsable.',
      },
      { status: 502 },
    );
  }

  const userId = invited.data.user.id;
  const intakeWithCandidate = {
    ...row,
    ...candidateToRow(parsed.data),
    email,
    dni_front_storage_path: frontPath,
    dni_back_storage_path: backPath,
  };

  const { error: profileError } = await admin.from('profiles').insert({
    id: userId,
    ...intakeToProfilePatch(intakeWithCandidate),
  });
  if (profileError) {
    console.error('alta: no se pudo crear el perfil', profileError);
    const recovered = await rollbackProvision(admin, row.id, userId);
    return NextResponse.json(
      {
        success: false,
        error: recovered
          ? 'No se pudo completar el acceso. Inténtalo de nuevo o contacta con el responsable.'
          : 'Datos recibidos, pero el acceso necesita revisión del responsable.',
      },
      { status: 500 },
    );
  }

  const { data: linked, error: linkError } = await admin
    .from('employment_intakes')
    .update({ profile_id: userId })
    .eq('id', row.id)
    .eq('status', 'submitted')
    .is('profile_id', null)
    .select('id')
    .maybeSingle();
  if (linkError || !linked) {
    console.error('alta: no se pudo vincular el expediente', linkError);
    const recovered = await rollbackProvision(admin, row.id, userId);
    return NextResponse.json(
      {
        success: false,
        error: recovered
          ? 'No se pudo finalizar el registro. Inténtalo de nuevo.'
          : 'Datos recibidos, pero el acceso necesita revisión del responsable.',
      },
      { status: 500 },
    );
  }

  await copyIntakeDocuments(admin, userId, [
    { source: frontPath, side: 'delantera', ext: frontExt },
    { source: backPath, side: 'trasera', ext: backExt },
  ]);

  return NextResponse.json({ success: true });
}
