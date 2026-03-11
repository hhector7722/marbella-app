import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error('Avatar API auth error:', authError);
      return NextResponse.json({ success: false, error: 'Sesión no válida' }, { status: 401 });
    }
    if (!user) {
      return NextResponse.json({ success: false, error: 'Inicia sesión para cambiar el avatar' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('avatar') as File | null;
    if (!file || typeof file.size !== 'number' || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No se ha seleccionado ninguna imagen' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
      return NextResponse.json({ success: false, error: 'Formato no permitido' }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ success: false, error: 'La imagen no puede superar 2 MB' }, { status: 400 });
    }

    const timestamp = Date.now();
    const filePath = `${user.id}/avatar_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      console.error('Avatar upload error:', uploadError);
      return NextResponse.json({ success: false, error: uploadError.message }, { status: 500 });
    }

    const { data: existingObjects } = await supabase.storage.from('avatars').list(user.id);
    if (existingObjects?.length) {
      const toRemove = existingObjects.filter((o) => o.name !== `avatar_${timestamp}.${ext}`);
      if (toRemove.length > 0) {
        await supabase.storage.from('avatars').remove(toRemove.map((o) => `${user.id}/${o.name}`));
      }
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    const { error: updateError } = await supabase
      .from('profiles')
      .update({ avatar_url: publicUrl })
      .eq('id', user.id);

    if (updateError) {
      console.error('Profile update error:', updateError);
      return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, avatarUrl: publicUrl });
  } catch (e) {
    console.error('Avatar API error:', e);
    return NextResponse.json({ success: false, error: 'Error al subir' }, { status: 500 });
  }
}
