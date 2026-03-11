'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updateProfile(userId: string, data: { dni?: string; bank_account?: string; phone?: string; email?: string; joining_date?: string; prefer_stock_hours?: boolean; codigo_empleado?: string }) {
    const supabase = await createClient();

    // Verificar si el usuario que hace la petición es manager
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

    if (currentProfile?.role !== 'manager' && currentUser.id !== userId) {
        return { success: false, error: 'No tienes permisos' };
    }

    const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', userId);

    if (error) {
        console.error('Error updating profile:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/profile');
    return { success: true };
}

export async function addEmployeeDocument(userId: string, docData: { type: 'contract' | 'payroll'; file_path: string; file_name: string; period?: string }) {
    const supabase = await createClient();

    // Solo managers pueden subir documentos
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

    if (currentProfile?.role !== 'manager') {
        return { success: false, error: 'Solo managers pueden subir documentos' };
    }

    const { error } = await supabase
        .from('employee_documents')
        .insert({
            user_id: userId,
            ...docData
        });

    if (error) {
        console.error('Error saving document metadata:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/profile');
    return { success: true };
}

/** Sube comunicado o contrato para un empleado (bucket employee-documents, tabla employee_documents) */
export async function addEmployeeDocumentByTipo(
    userId: string,
    docData: { tipo: 'comunicado' | 'contrato'; storage_path: string; filename: string }
) {
    const supabase = await createClient();

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

    if (currentProfile?.role !== 'manager' && currentProfile?.role !== 'supervisor') {
        return { success: false, error: 'Solo managers pueden subir comunicados y contratos' };
    }

    const { data: targetProfile } = await supabase
        .from('profiles')
        .select('codigo_empleado')
        .eq('id', userId)
        .single();

    const codigoEmpleado = targetProfile?.codigo_empleado ?? userId;

    const { error } = await supabase
        .from('employee_documents')
        .insert({
            user_id: userId,
            codigo_empleado: codigoEmpleado,
            tipo: docData.tipo,
            mes: null,
            year: null,
            filename: docData.filename,
            storage_path: docData.storage_path
        });

    if (error) {
        console.error('Error saving document metadata:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/profile');
    return { success: true };
}

/** Borra documento de tipo comunicado/contrato (storage + DB) */
export async function deleteEmployeeDocumentByTipo(docId: string, storagePath: string) {
    const supabase = await createClient();

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

    if (currentProfile?.role !== 'manager' && currentProfile?.role !== 'supervisor') {
        return { success: false, error: 'No tienes permisos' };
    }

    const { error: storageError } = await supabase.storage
        .from('employee-documents')
        .remove([storagePath]);

    if (storageError) {
        console.error('Error deleting file from storage:', storageError);
    }

    const { error: dbError } = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', docId);

    if (dbError) {
        return { success: false, error: dbError.message };
    }

    revalidatePath('/profile');
    return { success: true };
}

export async function getEmployeeDocuments(userId: string) {
    const supabase = await createClient();

    const { data, error } = await supabase
        .from('employee_documents')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching documents:', error);
        return [];
    }

    return data;
}

export async function deleteEmployeeDocument(docId: string, filePath: string) {
    const supabase = await createClient();

    // Solo managers pueden borrar
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const { data: currentProfile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', currentUser.id)
        .single();

    if (currentProfile?.role !== 'manager') {
        return { success: false, error: 'No tienes permisos' };
    }

    // 1. Borrar de Storage
    const { error: storageError } = await supabase.storage
        .from('employee-documents')
        .remove([filePath]);

    if (storageError) {
        console.error('Error deleting file from storage:', storageError);
    }

    // 2. Borrar de DB
    const { error: dbError } = await supabase
        .from('employee_documents')
        .delete()
        .eq('id', docId);

    if (dbError) {
        console.error('Error deleting document metadata:', dbError);
        return { success: false, error: dbError.message };
    }

    revalidatePath('/profile');
    return { success: true };
}

/** Resultado para useActionState (form con action). */
export type UpdateAvatarResult = { success: boolean; error?: string; avatarUrl?: string };

export async function updateAvatar(formData: FormData): Promise<UpdateAvatarResult> {
    const supabase = await createClient();

    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (!currentUser) return { success: false, error: 'No autenticado' };

    const userId = formData.get('userId') as string | null;
    if (!userId || currentUser.id !== userId) {
        return { success: false, error: 'Solo puedes editar tu propia imagen de perfil' };
    }

    const file = formData.get('avatar') as File | null;
    if (!file || typeof file.size !== 'number' || file.size === 0) {
        return { success: false, error: 'No se ha seleccionado ninguna imagen' };
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    if (!['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) {
        return { success: false, error: 'Formato no permitido. Usa JPG, PNG, WebP o GIF.' };
    }

    if (file.size > 2 * 1024 * 1024) {
        return { success: false, error: 'La imagen no puede superar 2 MB' };
    }

    const timestamp = Date.now();
    const filePath = `${userId}/avatar_${timestamp}.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: false });

    if (uploadError) {
        console.error('Avatar upload error:', uploadError);
        return { success: false, error: uploadError.message };
    }

    const { data: existingObjects } = await supabase.storage.from('avatars').list(userId);
    if (existingObjects?.length) {
        const toRemove = existingObjects.filter((o) => o.name !== `avatar_${timestamp}.${ext}`);
        if (toRemove.length > 0) {
            await supabase.storage.from('avatars').remove(toRemove.map((o) => `${userId}/${o.name}`));
        }
    }

    const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);

    const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', userId);

    if (updateError) {
        console.error('Profile update error:', updateError);
        return { success: false, error: updateError.message };
    }

    revalidatePath('/profile');
    return { success: true, avatarUrl: publicUrl };
}

/** Wrapper para useActionState: el formulario envía FormData (incl. archivo) correctamente. */
export async function updateAvatarFormAction(
    _prevState: UpdateAvatarResult | null,
    formData: FormData
): Promise<UpdateAvatarResult> {
    return updateAvatar(formData);
}

export async function completeOnboarding() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'No autenticado' };

    const { error } = await supabase
        .from('profiles')
        .update({ needs_onboarding: false })
        .eq('id', user.id);

    if (error) {
        console.error('Error completing onboarding:', error);
        return { success: false, error: error.message };
    }

    revalidatePath('/');
    return { success: true };
}
